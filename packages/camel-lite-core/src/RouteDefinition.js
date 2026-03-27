import { normalize } from './ProcessorNormalizer.js';
import { normaliseExpression, simple as simpleExpr } from './ExpressionBuilder.js';
import { CamelFilterStopException } from './errors/CamelFilterStopException.js';
import { Pipeline } from './Pipeline.js';
import { LoggerFactory } from '@alt-javascript/logger';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/RouteDefinition');

class RouteDefinition {
  #fromUri;
  #nodes = [];
  #clauses = [];

  constructor(fromUri) {
    this.#fromUri = fromUri;
  }

  process(p) {
    this.#nodes.push(normalize(p));
    return this;
  }

  to(uri) {
    this.#nodes.push({ type: 'to', uri });
    return this;
  }

  // ---------------------------------------------------------------------------
  // Message transformation DSL steps
  // ---------------------------------------------------------------------------

  /**
   * setBody — replaces exchange.in.body with the expression result.
   * Accepts: native function, simple(...), js(...), or constant(...)
   */
  setBody(expr) {
    const fn = normaliseExpression(expr);
    this.#nodes.push({ type: 'setBody', fn });
    return this;
  }

  /**
   * setHeader — sets a named header on exchange.in to the expression result.
   */
  setHeader(name, expr) {
    const fn = normaliseExpression(expr);
    this.#nodes.push({ type: 'setHeader', name, fn });
    return this;
  }

  /**
   * setProperty — sets a named exchange property to the expression result.
   */
  setProperty(name, expr) {
    const fn = normaliseExpression(expr);
    this.#nodes.push({ type: 'setProperty', name, fn });
    return this;
  }

  /**
   * removeHeader — deletes a named header from exchange.in.
   */
  removeHeader(name) {
    this.#nodes.push({ type: 'removeHeader', name });
    return this;
  }

  /**
   * log — emits an INFO log message. Message is an expression or a plain string
   * (plain strings are treated as Simple language templates).
   */
  log(messageExpr) {
    let fn;
    if (typeof messageExpr === 'string') {
      // If the string contains ${...} tokens, compile as Simple language.
      // Otherwise treat as a literal constant message.
      fn = /\$\{/.test(messageExpr)
        ? normaliseExpression(simpleExpr(messageExpr))
        : () => messageExpr;
    } else {
      fn = normaliseExpression(messageExpr);
    }
    this.#nodes.push({ type: 'log', fn });
    return this;
  }

  /**
   * marshal — serialises exchange.in.body.
   * format: 'json' (default). Extensible in future slices.
   */
  marshal(format = 'json') {
    this.#nodes.push({ type: 'marshal', format });
    return this;
  }

  /**
   * unmarshal — deserialises exchange.in.body.
   * format: 'json' (default).
   */
  unmarshal(format = 'json') {
    this.#nodes.push({ type: 'unmarshal', format });
    return this;
  }

  /**
   * convertBodyTo — coerces exchange.in.body to the given type name.
   * Supported: 'String', 'Number', 'Boolean'
   */
  convertBodyTo(type) {
    this.#nodes.push({ type: 'convertBodyTo', targetType: type });
    return this;
  }

  /**
   * stop — terminates exchange processing cleanly (no exception propagated to caller).
   * Uses the same CamelFilterStopException mechanism as filter().
   */
  stop() {
    this.#nodes.push({ type: 'stop' });
    return this;
  }

  /**
   * bean — executes a processor.
   *   - string: defers context.getBean(name) to runtime; throws if not found
   *   - function or { process(exchange) } object: normalised and executed directly
   */
  bean(nameOrProcessor) {
    if (typeof nameOrProcessor === 'string') {
      this.#nodes.push({ type: 'bean', name: nameOrProcessor });
    } else {
      this.#nodes.push(normalize(nameOrProcessor));
    }
    return this;
  }

  /**
   * Filter step — stops routing (cleanly) when predicate returns false.
   * Accepts: native function, simple(...), or js(...)
   */
  filter(predicate) {
    const fn = normaliseExpression(predicate);
    this.#nodes.push({ type: 'filter', fn });
    return this;
  }

  /**
   * Transform step — replaces exchange.in.body with expression return value.
   * Accepts: native function, simple(...), or js(...)
   */
  transform(expression) {
    const fn = normaliseExpression(expression);
    this.#nodes.push({ type: 'transform', fn });
    return this;
  }

  /**
   * Content-Based Router — returns a ChoiceBuilder for fluent when/otherwise/end chaining.
   */
  choice() {
    const choiceNode = { type: 'choice', clauses: [], otherwiseUri: null };
    this.#nodes.push(choiceNode);
    return new ChoiceBuilder(choiceNode, this);
  }

  /**
   * Splitter — splits the result of expression(exchange) (must be an array) into N
   * sub-exchanges. Each sub-exchange runs through remaining nodes. Results collected
   * back into exchange.in.body as an array.
   */
  split(expression) {
    const fn = normaliseExpression(expression);
    this.#nodes.push({ type: 'split', fn });
    return this;
  }

  /**
   * Aggregator — accumulates exchanges sharing the same correlationId until completionSize
   * is reached, then calls strategy(exchanges) to produce the aggregated exchange and
   * drives it through remaining nodes.
   *
   * Incomplete exchanges are stopped cleanly (no exception).
   */
  aggregate(correlationExpression, strategy, completionSize) {
    const corrFn = normaliseExpression(correlationExpression);
    const store = new Map(); // closure-scoped per route
    this.#nodes.push({ type: 'aggregate', corrFn, strategy, completionSize, store });
    return this;
  }

  onException(errorClass, processor, options = {}) {
    const normalised = normalize(processor);
    this.#clauses.push({
      errorClass,
      processor: normalised,
      handled: options.handled ?? true,
    });
    return this;
  }

  get fromUri() {
    return this.#fromUri;
  }

  getNodes() {
    return [...this.#nodes];
  }

  compile(context = null, options = {}) {
    const signal = options.signal ?? null;
    const steps = this.#compileNodes(this.#nodes, context, signal);
    return new Pipeline(steps, { clauses: this.#clauses, signal });
  }

  // Internal: compile a node array into a steps array.
  // Handles split/aggregate by consuming remaining nodes as a sub-pipeline.
  #compileNodes(nodes, context, signal) {
    const steps = [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      if (typeof node === 'function') {
        steps.push(node);
        continue;
      }

      if (node.type === 'to') {
        if (context !== null) {
          const { uri } = node;
          steps.push(this.#makeDispatchStep(uri, context));
        }
        continue;
      }

      if (node.type === 'filter') {
        const { fn } = node;
        steps.push(async (exchange) => {
          const passes = await fn(exchange);
          if (!passes) {
            log.debug(`Exchange filtered out: ${exchange.in.messageId}`);
            throw new CamelFilterStopException('filter predicate false');
          }
          exchange.setProperty('CamelFilterMatched', true);
        });
        continue;
      }

      if (node.type === 'transform') {
        const { fn } = node;
        steps.push(async (exchange) => {
          const result = await fn(exchange);
          exchange.in.body = result;
          log.debug(`Body transformed for exchange: ${exchange.in.messageId}`);
        });
        continue;
      }

      if (node.type === 'choice') {
        if (context !== null) {
          const choiceNode = node;
          steps.push(this.#makeChoiceStep(choiceNode, context));
        }
        continue;
      }

      if (node.type === 'split') {
        // Remaining nodes become the sub-pipeline
        const remainingNodes = nodes.slice(i + 1);
        const subSteps = this.#compileNodes(remainingNodes, context, signal);
        const subPipeline = new Pipeline(subSteps, { signal });
        const splitFn = node.fn;
        steps.push(this.#makeSplitterStep(splitFn, subPipeline));
        break; // remaining nodes consumed
      }

      if (node.type === 'aggregate') {
        const remainingNodes = nodes.slice(i + 1);
        const subSteps = this.#compileNodes(remainingNodes, context, signal);
        const subPipeline = new Pipeline(subSteps, { signal });
        steps.push(this.#makeAggregatorStep(node, subPipeline));
        break; // remaining nodes consumed
      }

      // ── New DSL steps ───────────────────────────────────────────────────

      if (node.type === 'setBody') {
        const { fn } = node;
        steps.push(async (exchange) => {
          exchange.in.body = await fn(exchange);
          log.debug(`setBody: body set on exchange ${exchange.in.messageId}`);
        });
        continue;
      }

      if (node.type === 'setHeader') {
        const { name, fn } = node;
        steps.push(async (exchange) => {
          const value = await fn(exchange);
          exchange.in.setHeader(name, value);
          log.debug(`setHeader: '${name}' set on exchange ${exchange.in.messageId}`);
        });
        continue;
      }

      if (node.type === 'setProperty') {
        const { name, fn } = node;
        steps.push(async (exchange) => {
          const value = await fn(exchange);
          exchange.setProperty(name, value);
          log.debug(`setProperty: '${name}' set on exchange ${exchange.in.messageId}`);
        });
        continue;
      }

      if (node.type === 'removeHeader') {
        const { name } = node;
        steps.push(async (exchange) => {
          exchange.in.headers.delete(name);
          log.debug(`removeHeader: '${name}' removed from exchange ${exchange.in.messageId}`);
        });
        continue;
      }

      if (node.type === 'log') {
        const { fn } = node;
        steps.push(async (exchange) => {
          const message = String(await fn(exchange));
          log.info(message);
        });
        continue;
      }

      if (node.type === 'marshal') {
        const { format } = node;
        steps.push(async (exchange) => {
          if (format === 'json') {
            exchange.in.body = JSON.stringify(exchange.in.body);
          } else {
            throw new Error(`marshal: unsupported format '${format}'`);
          }
          log.debug(`marshal(${format}) on exchange ${exchange.in.messageId}`);
        });
        continue;
      }

      if (node.type === 'unmarshal') {
        const { format } = node;
        steps.push(async (exchange) => {
          if (format === 'json') {
            exchange.in.body = JSON.parse(String(exchange.in.body));
          } else {
            throw new Error(`unmarshal: unsupported format '${format}'`);
          }
          log.debug(`unmarshal(${format}) on exchange ${exchange.in.messageId}`);
        });
        continue;
      }

      if (node.type === 'convertBodyTo') {
        const { targetType } = node;
        steps.push(async (exchange) => {
          const body = exchange.in.body;
          if (targetType === 'String') {
            exchange.in.body = String(body);
          } else if (targetType === 'Number') {
            exchange.in.body = Number(body);
          } else if (targetType === 'Boolean') {
            exchange.in.body = (body === 'true' || body === true);
          } else {
            throw new Error(`convertBodyTo: unsupported type '${targetType}'`);
          }
          log.debug(`convertBodyTo(${targetType}) on exchange ${exchange.in.messageId}`);
        });
        continue;
      }

      if (node.type === 'stop') {
        steps.push(async (_exchange) => {
          log.debug('stop(): halting exchange processing');
          throw new CamelFilterStopException('stop()');
        });
        continue;
      }

      if (node.type === 'bean') {
        const { name } = node;
        steps.push(async (exchange) => {
          if (!context) throw new Error(`bean('${name}'): CamelContext is required but was not provided at compile time`);
          const bean = context.getBean(name);
          if (!bean) throw new Error(`bean('${name}'): no bean registered in context with that name`);
          const processor = normalize(bean);
          await processor(exchange);
        });
        continue;
      }
    }

    return steps;
  }

  #makeDispatchStep(uri, context) {
    return async (exchange) => {
      const colonIdx = uri.indexOf(':');
      const scheme = colonIdx >= 0 ? uri.slice(0, colonIdx) : uri;
      const rest = colonIdx >= 0 ? uri.slice(colonIdx + 1) : '';
      const qIdx = rest.indexOf('?');
      const remaining = qIdx >= 0 ? rest.slice(0, qIdx) : rest;
      const params = qIdx >= 0
        ? new URLSearchParams(rest.slice(qIdx + 1))
        : new URLSearchParams();

      const component = context.getComponent(scheme);
      const endpoint = component.createEndpoint(uri, remaining, params, context);
      const producer = endpoint.createProducer();
      await producer.send(exchange);
    };
  }

  #makeChoiceStep(choiceNode, context) {
    return async (exchange) => {
      for (const clause of choiceNode.clauses) {
        const matches = await clause.predFn(exchange);
        if (matches) {
          log.debug(`CBR matched branch: ${clause.uri}`);
          const step = this.#makeDispatchStep(clause.uri, context);
          await step(exchange);
          return;
        }
      }
      if (choiceNode.otherwiseUri) {
        log.debug(`CBR otherwise: ${choiceNode.otherwiseUri}`);
        const step = this.#makeDispatchStep(choiceNode.otherwiseUri, context);
        await step(exchange);
      } else {
        log.debug(`CBR: no branch matched for exchange ${exchange.in.messageId}`);
      }
    };
  }

  #makeSplitterStep(splitFn, subPipeline) {
    return async (exchange) => {
      const items = await splitFn(exchange);
      if (!Array.isArray(items)) {
        throw new Error('split() expression must return an array');
      }
      log.info(`Splitting into ${items.length} sub-exchanges`);
      const results = [];
      for (const item of items) {
        const sub = exchange.clone();
        sub.in.body = item;
        await subPipeline.run(sub);
        results.push(sub.in.body);
      }
      exchange.in.body = results;
    };
  }

  #makeAggregatorStep(node, subPipeline) {
    const { corrFn, strategy, completionSize, store } = node;
    return async (exchange) => {
      const corrId = await corrFn(exchange);
      if (!store.has(corrId)) store.set(corrId, []);
      const bucket = store.get(corrId);
      bucket.push(exchange);
      log.debug(`Aggregator: ${bucket.length}/${completionSize} for ${corrId}`);

      if (bucket.length >= completionSize) {
        store.delete(corrId);
        const aggregated = strategy(bucket);
        log.info(`Aggregator completed: ${corrId}`);
        await subPipeline.run(aggregated);
        // Promote aggregated result back to the triggering exchange
        exchange.in.body = aggregated.in.body;
      } else {
        // Not yet complete — stop this exchange cleanly
        throw new CamelFilterStopException('aggregate pending');
      }
    };
  }
}

// ---------------------------------------------------------------------------
// ChoiceBuilder — fluent CBR DSL helper
// ---------------------------------------------------------------------------
class ChoiceBuilder {
  #choiceNode;
  #routeDef;
  #pendingPredicate = null;
  #isOtherwise = false;

  constructor(choiceNode, routeDef) {
    this.#choiceNode = choiceNode;
    this.#routeDef = routeDef;
  }

  when(predicate) {
    this.#pendingPredicate = normaliseExpression(predicate);
    this.#isOtherwise = false;
    return this;
  }

  otherwise() {
    this.#pendingPredicate = null;
    this.#isOtherwise = true;
    return this;
  }

  to(uri) {
    if (this.#isOtherwise) {
      this.#choiceNode.otherwiseUri = uri;
      this.#isOtherwise = false;
    } else if (this.#pendingPredicate) {
      this.#choiceNode.clauses.push({ predFn: this.#pendingPredicate, uri });
      this.#pendingPredicate = null;
    }
    return this;
  }

  end() {
    return this.#routeDef;
  }
}

export { RouteDefinition };
export default RouteDefinition;
