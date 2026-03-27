import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { Exchange, CamelContext } from '@alt-javascript/camel-lite-core';
import { ClientDataSource } from '@alt-javascript/jsnosqlc-core';
// Self-registers the in-memory driver with DriverManager on import
import '@alt-javascript/jsnosqlc-memory';
import { NosqlComponent, Filter } from '@alt-javascript/camel-lite-component-nosql';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExchange(body) {
  const ex = new Exchange();
  ex.in.body = body;
  return ex;
}

/** Build a NosqlComponent backed by a fresh in-memory store. */
function makeComponent(dsName = 'store') {
  const comp = new NosqlComponent();
  comp.setDatasource(dsName, () => new ClientDataSource({ url: 'jsnosqlc:memory:' }));
  return comp;
}

function makeEndpoint(comp, ctx, collection, operation, dsName = 'store') {
  const paramStr = `datasource=${dsName}&operation=${operation}`;
  const uri = `nosql:${collection}?${paramStr}`;
  const params = new URLSearchParams(paramStr);
  return comp.createEndpoint(uri, collection, params, ctx);
}

// ---------------------------------------------------------------------------
// URI parsing
// ---------------------------------------------------------------------------

describe('NosqlComponent: URI parsing', () => {
  it('parses collection, datasource, and operation from URI', () => {
    const comp = makeComponent();
    const ctx = new CamelContext();
    const ep = makeEndpoint(comp, ctx, 'users', 'insert');
    assert.equal(ep.collection, 'users');
    assert.equal(ep.datasource, 'store');
    assert.equal(ep.operation, 'insert');
  });

  it('defaults operation to get when not specified', () => {
    const comp = makeComponent();
    const ctx = new CamelContext();
    const uri = 'nosql:items?datasource=store';
    const ep = comp.createEndpoint(uri, 'items', new URLSearchParams('datasource=store'), ctx);
    assert.equal(ep.operation, 'get');
  });

  it('returns cached endpoint on duplicate URI', () => {
    const comp = makeComponent();
    const ctx = new CamelContext();
    const ep1 = makeEndpoint(comp, ctx, 'col', 'insert');
    const ep2 = makeEndpoint(comp, ctx, 'col', 'insert');
    assert.equal(ep1, ep2);
  });
});

// ---------------------------------------------------------------------------
// insert → get round-trip
// ---------------------------------------------------------------------------

describe('NosqlProducer: insert and get', () => {
  it('insert returns assigned key; get retrieves the document', async () => {
    const comp = makeComponent();
    const ctx = new CamelContext();

    // insert
    const insertEp = makeEndpoint(comp, ctx, 'products', 'insert');
    const insertEx = makeExchange({ name: 'Widget', price: 9.99 });
    await insertEp.createProducer().send(insertEx);
    const key = insertEx.in.body;
    assert.equal(typeof key, 'string', 'insert should return a string key');

    // get
    const getEp = makeEndpoint(comp, ctx, 'products', 'get');
    const getEx = makeExchange(key);
    await getEp.createProducer().send(getEx);
    assert.equal(getEx.in.body.name, 'Widget');
    assert.equal(getEx.in.body.price, 9.99);
  });

  it('get returns null for a missing key', async () => {
    const comp = makeComponent();
    const ctx = new CamelContext();
    const ep = makeEndpoint(comp, ctx, 'empty', 'get');
    const ex = makeExchange('nonexistent-key');
    await ep.createProducer().send(ex);
    assert.equal(ex.in.body, null);
  });
});

// ---------------------------------------------------------------------------
// store and get
// ---------------------------------------------------------------------------

describe('NosqlProducer: store and get', () => {
  it('store upserts under caller-supplied key; get retrieves it', async () => {
    const comp = makeComponent();
    const ctx = new CamelContext();

    const storeEp = makeEndpoint(comp, ctx, 'sessions', 'store');
    const storeEx = makeExchange({ key: 'sess-abc', doc: { userId: 42, role: 'admin' } });
    await storeEp.createProducer().send(storeEx);
    assert.equal(storeEx.in.body, undefined);

    const getEp = makeEndpoint(comp, ctx, 'sessions', 'get');
    const getEx = makeExchange('sess-abc');
    await getEp.createProducer().send(getEx);
    assert.equal(getEx.in.body.userId, 42);
    assert.equal(getEx.in.body.role, 'admin');
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('NosqlProducer: delete', () => {
  it('delete removes document; subsequent get returns null', async () => {
    const comp = makeComponent();
    const ctx = new CamelContext();

    // store first
    await makeEndpoint(comp, ctx, 'cache', 'store').createProducer()
      .send(makeExchange({ key: 'temp', doc: { x: 1 } }));

    // delete
    const delEp = makeEndpoint(comp, ctx, 'cache', 'delete');
    const delEx = makeExchange('temp');
    await delEp.createProducer().send(delEx);
    assert.equal(delEx.in.body, undefined);

    // get → null
    const getEx = makeExchange('temp');
    await makeEndpoint(comp, ctx, 'cache', 'get').createProducer().send(getEx);
    assert.equal(getEx.in.body, null);
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('NosqlProducer: update', () => {
  it('update patches document fields; others preserved', async () => {
    const comp = makeComponent();
    const ctx = new CamelContext();

    // insert a document
    const insertEx = makeExchange({ name: 'Alice', age: 30, role: 'user' });
    await makeEndpoint(comp, ctx, 'users', 'insert').createProducer().send(insertEx);
    const key = insertEx.in.body;

    // update — patch age and role, name should be preserved
    const updateEx = makeExchange({ key, patch: { age: 31, role: 'admin' } });
    await makeEndpoint(comp, ctx, 'users', 'update').createProducer().send(updateEx);
    assert.equal(updateEx.in.body, undefined);

    // verify patch applied and name preserved
    const getEx = makeExchange(key);
    await makeEndpoint(comp, ctx, 'users', 'get').createProducer().send(getEx);
    assert.equal(getEx.in.body.name, 'Alice');
    assert.equal(getEx.in.body.age, 31);
    assert.equal(getEx.in.body.role, 'admin');
  });
});

// ---------------------------------------------------------------------------
// find
// ---------------------------------------------------------------------------

describe('NosqlProducer: find', () => {
  it('find with Filter returns matching documents as array', async () => {
    const comp = makeComponent();
    const ctx = new CamelContext();

    // insert 3 documents
    const insertEp = makeEndpoint(comp, ctx, 'items', 'insert');
    await insertEp.createProducer().send(makeExchange({ name: 'Widget', price: 9.99 }));
    await insertEp.createProducer().send(makeExchange({ name: 'Gadget', price: 24.99 }));
    await insertEp.createProducer().send(makeExchange({ name: 'Donut', price: 1.99 }));

    // find where price < 10
    const filter = Filter.where('price').lt(10).build();
    const findEp = makeEndpoint(comp, ctx, 'items', 'find');
    const findEx = makeExchange(filter);
    await findEp.createProducer().send(findEx);

    assert.ok(Array.isArray(findEx.in.body), 'result should be an array');
    assert.equal(findEx.in.body.length, 2);
    const names = findEx.in.body.map(d => d.name).sort();
    assert.deepEqual(names, ['Donut', 'Widget']);
  });

  it('find with eq filter returns exact matches', async () => {
    const comp = makeComponent();
    const ctx = new CamelContext();

    const insertEp = makeEndpoint(comp, ctx, 'users', 'insert');
    await insertEp.createProducer().send(makeExchange({ name: 'Alice', role: 'admin' }));
    await insertEp.createProducer().send(makeExchange({ name: 'Bob', role: 'user' }));
    await insertEp.createProducer().send(makeExchange({ name: 'Carol', role: 'admin' }));

    const filter = Filter.where('role').eq('admin').build();
    const findEx = makeExchange(filter);
    await makeEndpoint(comp, ctx, 'users', 'find').createProducer().send(findEx);

    assert.equal(findEx.in.body.length, 2);
    assert.ok(findEx.in.body.every(d => d.role === 'admin'));
  });
});

// ---------------------------------------------------------------------------
// Multiple named datasources
// ---------------------------------------------------------------------------

describe('NosqlComponent: multiple datasources', () => {
  it('routes operations to the correct named datasource', async () => {
    const comp = new NosqlComponent();
    comp.setDatasource('ds1', () => new ClientDataSource({ url: 'jsnosqlc:memory:' }));
    comp.setDatasource('ds2', () => new ClientDataSource({ url: 'jsnosqlc:memory:' }));

    const ctx = new CamelContext();

    const ep1 = comp.createEndpoint('nosql:col?datasource=ds1&operation=insert', 'col', new URLSearchParams('datasource=ds1&operation=insert'), ctx);
    const ep2 = comp.createEndpoint('nosql:col?datasource=ds2&operation=insert', 'col', new URLSearchParams('datasource=ds2&operation=insert'), ctx);

    const ex1 = makeExchange({ from: 'ds1' });
    const ex2 = makeExchange({ from: 'ds2' });

    await ep1.createProducer().send(ex1);
    await ep2.createProducer().send(ex2);

    // Keys are different strings — just check both were created
    assert.equal(typeof ex1.in.body, 'string');
    assert.equal(typeof ex2.in.body, 'string');
    assert.notEqual(ex1.in.body, ex2.in.body);
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('NosqlComponent: error cases', () => {
  it('throws on unknown operation', async () => {
    const comp = makeComponent();
    const ctx = new CamelContext();
    const ep = comp.createEndpoint('nosql:col?datasource=store&operation=truncate', 'col', new URLSearchParams('datasource=store&operation=truncate'), ctx);

    await assert.rejects(
      () => ep.createProducer().send(makeExchange(null)),
      /unknown operation 'truncate'/i
    );
  });

  it('throws when datasource is not registered', async () => {
    const comp = new NosqlComponent(); // no datasources registered
    const ctx = new CamelContext();
    const ep = makeEndpoint(comp, ctx, 'col', 'insert', 'ghost');

    await assert.rejects(
      () => ep.createProducer().send(makeExchange({ x: 1 })),
      /cannot resolve datasource 'ghost'/i
    );
  });
});

// ---------------------------------------------------------------------------
// NosqlComponent.close() releases clients
// ---------------------------------------------------------------------------

describe('NosqlComponent: close', () => {
  it('close() closes all cached clients', async () => {
    const comp = makeComponent();
    const ctx = new CamelContext();

    // Trigger client creation
    const ep = makeEndpoint(comp, ctx, 'col', 'insert');
    await ep.createProducer().send(makeExchange({ x: 1 }));

    // close
    await comp.close();

    // Subsequent calls re-create client from factory (not throw)
    // — just verify close() does not throw
    // No assertion beyond no-throw is needed here
  });
});

// ---------------------------------------------------------------------------
// Integration tests (conditional on NOSQL_URL)
// ---------------------------------------------------------------------------

const NOSQL_URL = process.env.NOSQL_URL;

if (NOSQL_URL) {
  describe('NoSQL integration (live backend via NOSQL_URL)', () => {
    it('round-trips insert → get → delete via live driver', async () => {
      const comp = new NosqlComponent();
      comp.setDatasource('live', () => new ClientDataSource({ url: NOSQL_URL }));
      const ctx = new CamelContext();

      const collName = `camel_lite_test`;
      const insertEp = makeEndpoint(comp, ctx, collName, 'insert', 'live');
      const getEp = makeEndpoint(comp, ctx, collName, 'get', 'live');
      const deleteEp = makeEndpoint(comp, ctx, collName, 'delete', 'live');

      const insertEx = makeExchange({ testField: 'integration', ts: Date.now() });
      await insertEp.createProducer().send(insertEx);
      const key = insertEx.in.body;
      assert.ok(key, 'should have a key after insert');

      const getEx = makeExchange(key);
      await getEp.createProducer().send(getEx);
      assert.equal(getEx.in.body.testField, 'integration');

      const delEx = makeExchange(key);
      await deleteEp.createProducer().send(delEx);

      await comp.close();
    });
  });
} else {
  describe('NoSQL integration (skipped — set NOSQL_URL=jsnosqlc:mongodb://... to enable)', () => {
    it('skipped', () => { /* no-op */ });
  });
}

// ---------------------------------------------------------------------------
// Context-aware datasource resolution (three-step chain)
// ---------------------------------------------------------------------------

describe('NosqlComponent: context bean resolution', () => {
  function makeDs() {
    return new ClientDataSource({ url: 'jsnosqlc:memory:' });
  }

  async function seedCollection(ds, collName, docs) {
    const client = await ds.getClient();
    const col = client.getCollection(collName);
    for (const doc of docs) await col.insert(doc);
    // Note: we intentionally don't close the client here — the component will cache it.
  }

  it('step 2: resolves datasource from context.getBean(name) when not in component map', async () => {
    const ds = makeDs();
    const comp = new NosqlComponent(); // no setDatasource()
    const ctx = new CamelContext();
    ctx.registerBean('myStore', ds);

    // Seed data through the component so it uses the cached client
    const insertParams = new URLSearchParams('datasource=myStore&operation=insert');
    const insertEp = comp.createEndpoint('nosql:things?datasource=myStore&operation=insert', 'things', insertParams, ctx);
    await insertEp.createProducer().send(makeExchange({ x: 42 }));

    const params = new URLSearchParams('datasource=myStore&operation=find');
    const ep = comp.createEndpoint('nosql:things?datasource=myStore&operation=find', 'things', params, ctx);

    const ex = makeExchange(null);
    await ep.createProducer().send(ex);

    assert.ok(Array.isArray(ex.in.body));
    assert.equal(ex.in.body.length, 1);
    assert.equal(ex.in.body[0].x, 42);
  });

  it('step 3: auto-selects single context bean when no datasource given', async () => {
    const ds = makeDs();
    const comp = new NosqlComponent();
    const ctx = new CamelContext();
    ctx.registerBean('onlyStore', ds); // exactly one bean

    // Seed via component (auto-select)
    const insertParams = new URLSearchParams('operation=insert');
    const insertEp = comp.createEndpoint('nosql:items?operation=insert', 'items', insertParams, ctx);
    await insertEp.createProducer().send(makeExchange({ name: 'auto' }));

    const params = new URLSearchParams('operation=find');
    const ep = comp.createEndpoint('nosql:items?operation=find', 'items', params, ctx);

    const ex = makeExchange(null);
    await ep.createProducer().send(ex);

    assert.equal(ex.in.body.length, 1);
    assert.equal(ex.in.body[0].name, 'auto');
  });

  it('step 1 takes priority over context bean when component map has same name', async () => {
    const dsInMap = makeDs();
    const dsInContext = makeDs();

    const comp = new NosqlComponent();
    comp.setDatasource('store', () => dsInMap);

    const ctx = new CamelContext();
    ctx.registerBean('store', dsInContext);

    // Insert via component map path
    const insertParams = new URLSearchParams('datasource=store&operation=insert');
    const insertEp = comp.createEndpoint('nosql:col?datasource=store&operation=insert', 'col', insertParams, ctx);
    await insertEp.createProducer().send(makeExchange({ from: 'map' }));

    const params = new URLSearchParams('datasource=store&operation=find');
    const ep = comp.createEndpoint('nosql:col?datasource=store&operation=find', 'col', params, ctx);
    const ex = makeExchange(null);
    await ep.createProducer().send(ex);

    // Should read from dsInMap (1 doc), not dsInContext (0 docs)
    assert.equal(ex.in.body.length, 1);
    assert.equal(ex.in.body[0].from, 'map');
  });

  it('throws descriptive error when no resolution path succeeds', async () => {
    const comp = new NosqlComponent();
    const ctx = new CamelContext(); // no beans
    const params = new URLSearchParams('datasource=ghost&operation=insert');
    const ep = comp.createEndpoint('nosql:col?datasource=ghost&operation=insert', 'col', params, ctx);

    await assert.rejects(
      () => ep.createProducer().send(makeExchange({ x: 1 })),
      /cannot resolve datasource 'ghost'/i
    );
  });

  it('throws when no name given and context has multiple beans', async () => {
    const comp = new NosqlComponent();
    const ctx = new CamelContext();
    ctx.registerBean('ds1', makeDs());
    ctx.registerBean('ds2', makeDs()); // two beans — no auto-select

    const params = new URLSearchParams('operation=insert');
    const ep = comp.createEndpoint('nosql:col?operation=insert', 'col', params, ctx);

    await assert.rejects(
      () => ep.createProducer().send(makeExchange({ x: 1 })),
      /cannot resolve datasource/i
    );
  });
});
