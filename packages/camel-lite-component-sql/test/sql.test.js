import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Exchange, CamelContext } from 'camel-lite-core';
import { SqlComponent, ParameterBinder, openDatabase } from 'camel-lite-component-sql';

// ---------------------------------------------------------------------------
// Helper: open an in-memory SQLite DB with a test table
// ---------------------------------------------------------------------------
function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE items (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      qty  INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.prepare('INSERT INTO items (name, qty) VALUES (?, ?)').run('apple', 10);
  db.prepare('INSERT INTO items (name, qty) VALUES (?, ?)').run('banana', 5);
  db.prepare('INSERT INTO items (name, qty) VALUES (?, ?)').run('cherry', 20);
  return db;
}

function makeExchange(body) {
  const ex = new Exchange();
  ex.in.body = body;
  return ex;
}

// ---------------------------------------------------------------------------
// ParameterBinder unit tests
// ---------------------------------------------------------------------------

describe('ParameterBinder', () => {
  it('replaceParams: sqlite dialect replaces :name with ?', () => {
    const { sql, values } = ParameterBinder.replaceParams(
      'SELECT * FROM items WHERE name = :name AND qty > :qty',
      { name: 'apple', qty: 5 },
      'sqlite'
    );
    assert.equal(sql, 'SELECT * FROM items WHERE name = ? AND qty > ?');
    assert.deepEqual(values, ['apple', 5]);
  });

  it('replaceParams: pg dialect replaces :name with $1, $2', () => {
    const { sql, values } = ParameterBinder.replaceParams(
      'SELECT * FROM users WHERE id = :id AND role = :role',
      { id: 42, role: 'admin' },
      'pg'
    );
    assert.equal(sql, 'SELECT * FROM users WHERE id = $1 AND role = $2');
    assert.deepEqual(values, [42, 'admin']);
  });

  it('replaceParams: mysql2 dialect replaces :name with ?', () => {
    const { sql, values } = ParameterBinder.replaceParams(
      'UPDATE t SET status = :status WHERE id = :id',
      { status: 'active', id: 7 },
      'mysql2'
    );
    assert.equal(sql, 'UPDATE t SET status = ? WHERE id = ?');
    assert.deepEqual(values, ['active', 7]);
  });

  it('replaceParams: named dialect passes through unchanged', () => {
    const template = 'SELECT * FROM t WHERE x = :x';
    const params = { x: 99 };
    const { sql, values } = ParameterBinder.replaceParams(template, params, 'named');
    assert.equal(sql, template);
    assert.equal(values, params);
  });

  it('replaceParams: missing param defaults to null', () => {
    const { values } = ParameterBinder.replaceParams(
      'SELECT * FROM t WHERE a = :a AND b = :b',
      { a: 1 }, // b is missing
      'sqlite'
    );
    assert.deepEqual(values, [1, null]);
  });

  it('extractParams: returns body if it is a plain object', () => {
    const ex = makeExchange({ id: 5, name: 'pear' });
    assert.deepEqual(ParameterBinder.extractParams(ex), { id: 5, name: 'pear' });
  });

  it('extractParams: falls back to headers if body is not an object', () => {
    const ex = makeExchange('string body');
    ex.in.setHeader('id', 42);
    const params = ParameterBinder.extractParams(ex);
    assert.equal(params.id, 42);
  });
});

// ---------------------------------------------------------------------------
// SqlComponent + SqlProducer — SELECT
// ---------------------------------------------------------------------------

describe('SqlProducer: SELECT', () => {
  it('executes SELECT and sets rows array on exchange.in.body', async () => {
    const db = makeDb();
    const comp = new SqlComponent();
    comp.setDatasource('default', () => db);

    const ctx = new CamelContext();
    const params = new URLSearchParams('query=SELECT+*+FROM+items&dialect=sqlite');
    const ep = comp.createEndpoint('sql:default?query=SELECT+*+FROM+items&dialect=sqlite', 'default', params, ctx);
    const producer = ep.createProducer();

    const ex = makeExchange(null);
    await producer.send(ex);

    assert.ok(Array.isArray(ex.in.body), 'body should be an array');
    assert.equal(ex.in.body.length, 3);
    assert.equal(ex.in.body[0].name, 'apple');
    assert.equal(ex.in.body[1].name, 'banana');
  });

  it('executes parameterized SELECT with :name placeholders', async () => {
    const db = makeDb();
    const comp = new SqlComponent();
    comp.setDatasource('myds', () => db);

    const ctx = new CamelContext();
    const q = 'SELECT+*+FROM+items+WHERE+name+=+:name';
    const params = new URLSearchParams(`query=${q}&dialect=sqlite`);
    const ep = comp.createEndpoint(`sql:myds?query=${q}&dialect=sqlite`, 'myds', params, ctx);
    const producer = ep.createProducer();

    const ex = makeExchange({ name: 'cherry' });
    await producer.send(ex);

    assert.equal(ex.in.body.length, 1);
    assert.equal(ex.in.body[0].qty, 20);
  });
});

// ---------------------------------------------------------------------------
// SqlProducer — INSERT / UPDATE / DELETE
// ---------------------------------------------------------------------------

describe('SqlProducer: mutations', () => {
  it('INSERT returns { rowCount: 1 }', async () => {
    const db = makeDb();
    const comp = new SqlComponent();
    comp.setDatasource('default', () => db);

    const ctx = new CamelContext();
    const q = encodeURIComponent('INSERT INTO items (name, qty) VALUES (:name, :qty)');
    const params = new URLSearchParams(`query=${q}&dialect=sqlite&outputType=rowCount`);
    const ep = comp.createEndpoint(`sql:default?query=${q}&dialect=sqlite&outputType=rowCount`, 'default', params, ctx);
    const producer = ep.createProducer();

    const ex = makeExchange({ name: 'grape', qty: 7 });
    await producer.send(ex);

    assert.deepEqual(ex.in.body, { rowCount: 1 });

    // Confirm row was inserted
    const rows = db.prepare('SELECT * FROM items WHERE name = ?').all('grape');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].qty, 7);
  });

  it('UPDATE returns { rowCount: N }', async () => {
    const db = makeDb();
    const comp = new SqlComponent();
    comp.setDatasource('default', () => db);

    const ctx = new CamelContext();
    const q = encodeURIComponent('UPDATE items SET qty = :qty WHERE name = :name');
    const params = new URLSearchParams(`query=${q}&dialect=sqlite&outputType=rowCount`);
    const ep = comp.createEndpoint(`sql:default?query=${q}&dialect=sqlite&outputType=rowCount`, 'default', params, ctx);
    const producer = ep.createProducer();

    const ex = makeExchange({ name: 'apple', qty: 99 });
    await producer.send(ex);

    assert.deepEqual(ex.in.body, { rowCount: 1 });
    const rows = db.prepare('SELECT qty FROM items WHERE name = ?').all('apple');
    assert.equal(rows[0].qty, 99);
  });

  it('DELETE returns { rowCount: N }', async () => {
    const db = makeDb();
    const comp = new SqlComponent();
    comp.setDatasource('default', () => db);

    const ctx = new CamelContext();
    const q = encodeURIComponent('DELETE FROM items WHERE name = :name');
    const params = new URLSearchParams(`query=${q}&dialect=sqlite&outputType=rowCount`);
    const ep = comp.createEndpoint(`sql:default?query=${q}&dialect=sqlite&outputType=rowCount`, 'default', params, ctx);
    const producer = ep.createProducer();

    const ex = makeExchange({ name: 'banana' });
    await producer.send(ex);

    assert.deepEqual(ex.in.body, { rowCount: 1 });
    const remaining = db.prepare('SELECT COUNT(*) as cnt FROM items').all();
    assert.equal(remaining[0].cnt, 2);
  });
});

// ---------------------------------------------------------------------------
// Multiple named datasources
// ---------------------------------------------------------------------------

describe('SqlComponent: multiple named datasources', () => {
  it('routes queries to the correct named datasource', async () => {
    const db1 = new DatabaseSync(':memory:');
    db1.exec('CREATE TABLE t (val TEXT)');
    db1.prepare('INSERT INTO t (val) VALUES (?)').run('from-db1');

    const db2 = new DatabaseSync(':memory:');
    db2.exec('CREATE TABLE t (val TEXT)');
    db2.prepare('INSERT INTO t (val) VALUES (?)').run('from-db2');

    const comp = new SqlComponent();
    comp.setDatasource('ds1', () => db1);
    comp.setDatasource('ds2', () => db2);

    const ctx = new CamelContext();

    const params1 = new URLSearchParams('query=SELECT+val+FROM+t&dialect=sqlite');
    const ep1 = comp.createEndpoint('sql:ds1?query=SELECT+val+FROM+t&dialect=sqlite', 'ds1', params1, ctx);

    const params2 = new URLSearchParams('query=SELECT+val+FROM+t&dialect=sqlite');
    const ep2 = comp.createEndpoint('sql:ds2?query=SELECT+val+FROM+t&dialect=sqlite', 'ds2', params2, ctx);

    const ex1 = makeExchange(null);
    await ep1.createProducer().send(ex1);
    assert.equal(ex1.in.body[0].val, 'from-db1');

    const ex2 = makeExchange(null);
    await ep2.createProducer().send(ex2);
    assert.equal(ex2.in.body[0].val, 'from-db2');
  });
});

// ---------------------------------------------------------------------------
// SqlComponent: missing datasource throws
// ---------------------------------------------------------------------------

describe('SqlComponent: error cases', () => {
  it('throws when query param is missing', () => {
    const comp = new SqlComponent();
    comp.setDatasource('default', () => null);
    const ctx = new CamelContext();
    const params = new URLSearchParams('dialect=sqlite'); // no query
    assert.throws(
      () => comp.createEndpoint('sql:default?dialect=sqlite', 'default', params, ctx),
      /query.*required/i
    );
  });

  it('throws when datasource is not registered', async () => {
    const comp = new SqlComponent();
    const ctx = new CamelContext();
    const params = new URLSearchParams('query=SELECT+1&dialect=sqlite');
    const ep = comp.createEndpoint('sql:unknown?query=SELECT+1&dialect=sqlite', 'unknown', params, ctx);
    const producer = ep.createProducer();
    await assert.rejects(
      () => producer.send(makeExchange(null)),
      /cannot resolve datasource 'unknown'/i
    );
  });
});

// ---------------------------------------------------------------------------
// openDatabase helper
// ---------------------------------------------------------------------------

describe('openDatabase helper', () => {
  it('opens an in-memory SQLite database', () => {
    const db = openDatabase(':memory:');
    assert.ok(db, 'should return a DatabaseSync instance');
    db.exec('CREATE TABLE t (x INTEGER)');
    db.prepare('INSERT INTO t (x) VALUES (?)').run(42);
    const rows = db.prepare('SELECT x FROM t').all();
    assert.equal(rows[0].x, 42);
  });
});

// ---------------------------------------------------------------------------
// Context-aware datasource resolution (three-step chain)
// ---------------------------------------------------------------------------

describe('SqlComponent: context bean resolution', () => {
  function makeDb() {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, val TEXT)');
    db.prepare('INSERT INTO t (val) VALUES (?)').run('hello');
    return db;
  }

  it('step 2: resolves datasource from context.getBean(name) when not in component map', async () => {
    const db = makeDb();
    const comp = new SqlComponent(); // no setDatasource()
    const ctx = new CamelContext();
    ctx.registerBean('myDb', db);

    const params = new URLSearchParams('datasource=myDb&query=SELECT+val+FROM+t&dialect=sqlite');
    const ep = comp.createEndpoint('sql:?datasource=myDb&query=SELECT+val+FROM+t&dialect=sqlite', '', params, ctx);

    const ex = new Exchange();
    ex.in.body = null;
    await ep.createProducer().send(ex);

    assert.ok(Array.isArray(ex.in.body));
    assert.equal(ex.in.body[0].val, 'hello');
  });

  it('step 3: auto-selects single context bean when no name given', async () => {
    const db = makeDb();
    const comp = new SqlComponent();
    const ctx = new CamelContext();
    ctx.registerBean('theOnlyDb', db); // only one bean

    const params = new URLSearchParams('query=SELECT+val+FROM+t&dialect=sqlite');
    const ep = comp.createEndpoint('sql:?query=SELECT+val+FROM+t&dialect=sqlite', '', params, ctx);

    const ex = new Exchange();
    ex.in.body = null;
    await ep.createProducer().send(ex);

    assert.ok(Array.isArray(ex.in.body));
    assert.equal(ex.in.body[0].val, 'hello');
  });

  it('step 1 takes priority over context bean when component map has same name', async () => {
    const dbInMap = makeDb();
    dbInMap.exec('INSERT INTO t (val) VALUES (?)', 'from-map');

    const dbInContext = makeDb();

    const comp = new SqlComponent();
    comp.setDatasource('myDb', () => dbInMap); // component map — takes priority

    const ctx = new CamelContext();
    ctx.registerBean('myDb', dbInContext); // context — should be ignored

    const params = new URLSearchParams('datasource=myDb&query=SELECT+COUNT(*)+AS+cnt+FROM+t&dialect=sqlite');
    const ep = comp.createEndpoint('sql:?datasource=myDb&query=SELECT+COUNT(*)+AS+cnt+FROM+t&dialect=sqlite', '', params, ctx);

    const ex = new Exchange();
    ex.in.body = null;
    await ep.createProducer().send(ex);

    // dbInMap has 2 rows (original + 'from-map'), dbInContext has 1
    assert.equal(ex.in.body[0].cnt, 2);
  });

  it('?datasource= param overrides the sql: path segment as the name', async () => {
    const db = makeDb();
    const comp = new SqlComponent();
    const ctx = new CamelContext();
    ctx.registerBean('paramBean', db);

    // Path says 'pathBean' but ?datasource= says 'paramBean'
    const params = new URLSearchParams('datasource=paramBean&query=SELECT+val+FROM+t&dialect=sqlite');
    const ep = comp.createEndpoint('sql:pathBean?datasource=paramBean&query=SELECT+val+FROM+t&dialect=sqlite', 'pathBean', params, ctx);

    const ex = new Exchange();
    ex.in.body = null;
    await ep.createProducer().send(ex);

    assert.equal(ex.in.body[0].val, 'hello');
  });

  it('throws a descriptive error when no resolution path succeeds', async () => {
    const comp = new SqlComponent();
    const ctx = new CamelContext(); // no beans
    const params = new URLSearchParams('datasource=ghost&query=SELECT+1&dialect=sqlite');
    const ep = comp.createEndpoint('sql:?datasource=ghost&query=SELECT+1&dialect=sqlite', '', params, ctx);

    await assert.rejects(
      () => ep.createProducer().send(new Exchange()),
      /cannot resolve datasource 'ghost'/i
    );
  });

  it('throws when no name given and context has zero or multiple beans', async () => {
    const comp = new SqlComponent();
    const ctx = new CamelContext();
    ctx.registerBean('db1', makeDb());
    ctx.registerBean('db2', makeDb()); // two beans — no auto-select

    const params = new URLSearchParams('query=SELECT+1&dialect=sqlite');
    const ep = comp.createEndpoint('sql:?query=SELECT+1&dialect=sqlite', '', params, ctx);

    await assert.rejects(
      () => ep.createProducer().send(new Exchange()),
      /cannot resolve datasource/i
    );
  });
});
