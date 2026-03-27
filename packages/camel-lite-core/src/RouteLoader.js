import { readFile } from 'node:fs/promises';
import { load as yamlLoad } from 'js-yaml';
import { LoggerFactory } from '@alt-javascript/logger';
import { RouteBuilder } from './RouteBuilder.js';
import { simple, js, constant } from './ExpressionBuilder.js';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/RouteLoader');

/**
 * RouteLoader — parses YAML or JSON route definition files/strings into RouteBuilder instances.
 *
 * Supported top-level shapes:
 *   { routes: [ { route: { id, from: { uri, steps } } }, ... ] }
 *   { route: { id, from: { uri, steps } } }          ← single route
 *   [ { route: { id, from: { uri, steps } } }, ... ]  ← array of routes
 *
 * Expression language keys (inside step value nodes):
 *   simple: '<template>'   → simple('<template>')
 *   js: '<code>'           → js('<code>')
 *   constant: <value>      → constant(<value>)
 *   (bare string value)    → constant(value)  for step types that take a single value
 *
 * Supported step keys → DSL methods:
 *   to             → .to(uri)
 *   process        → .process(js(code))
 *   filter         → .filter(expr) + nested steps appended as siblings
 *   transform      → .transform(expr)
 *   setBody        → .setBody(expr)
 *   setHeader      → .setHeader(name, expr)
 *   setProperty    → .setProperty(name, expr)
 *   removeHeader   → .removeHeader(name)
 *   log            → .log(expr or string)
 *   marshal        → .marshal(format)
 *   unmarshal      → .unmarshal(format)
 *   convertBodyTo  → .convertBodyTo(type)
 *   stop           → .stop()
 *   bean           → .bean(name)
 *   choice         → .choice().when(...).to(...).otherwise().to(...).end()
 *   split          → .split(expr) + nested steps appended as siblings
 *
 * Unknown step keys are warned and skipped.
 */
class RouteLoader {
  /**
   * Load routes from a file path.
   * Format detection order:
   *   1. Extension: .yaml / .yml → yaml, .json → json
   *   2. Content sniff (passed to loadString): leading { or [ → json, else yaml
   * @param {string} filePath
   * @returns {Promise<RouteBuilder>}
   */
  static async loadFile(filePath) {
    const text = await readFile(filePath, 'utf8');
    let format;
    if (/\.ya?ml$/i.test(filePath)) {
      format = 'yaml';
    } else if (/\.json$/i.test(filePath)) {
      format = 'json';
    }
    // undefined → loadString will content-sniff
    if (format) {
      log.info(`RouteLoader: loading ${format} routes from ${filePath} (extension)`);
    } else {
      log.info(`RouteLoader: loading routes from ${filePath} (content-sniff)`);
    }
    return RouteLoader.loadString(text, format);
  }

  /**
   * Load routes from a readable stream (e.g. process.stdin).
   * Reads the stream to completion, then delegates to loadString with content-sniff.
   * @param {NodeJS.ReadableStream} stream
   * @returns {Promise<RouteBuilder>}
   */
  static async loadStream(stream) {
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    }
    const text = chunks.join('');
    log.info('RouteLoader: loading routes from stream (content-sniff)');
    return RouteLoader.loadString(text);
  }

  /**
   * Load routes from an already-parsed JavaScript object.
   * Use this when the route definition comes from a config system that
   * deserialises YAML/JSON at load time (e.g. @alt-javascript/config).
   *
   * Accepts the same shapes as loadString:
   *   { route: { from: { uri, steps } } }
   *   { routes: [ ... ] }
   *   [ { route: ... }, ... ]
   *   { from: { uri, steps } }   ← bare single route
   *
   * @param {object|Array} obj - already-parsed route definition object
   * @returns {RouteBuilder}
   */
  static loadObject(obj) {
    if (obj === null || obj === undefined) {
      throw new Error('RouteLoader.loadObject: obj must be a non-null object');
    }
    if (typeof obj !== 'object') {
      throw new Error(`RouteLoader.loadObject: expected object, got ${typeof obj}`);
    }
    log.info('RouteLoader: loading routes from object');
    const routeDefs = RouteLoader.#extractRoutes(obj);
    const builder = new RouteBuilder();
    for (const routeDef of routeDefs) {
      RouteLoader.#buildRoute(builder, routeDef);
    }
    log.info(`RouteLoader: loaded ${routeDefs.length} route(s)`);
    return builder;
  }

  /**
   * Load routes from a string.
   * @param {string} text    - YAML or JSON string
   * @param {'yaml'|'json'} [format]  - omit to auto-detect: leading { or [ → json, else yaml
   * @returns {RouteBuilder}
   */
  static loadString(text, format) {
    let parsed;
    const fmt = format ?? (text.trimStart().startsWith('{') || text.trimStart().startsWith('[') ? 'json' : 'yaml');

    if (fmt === 'json') {
      parsed = JSON.parse(text);
    } else {
      parsed = yamlLoad(text);
    }

    const routeDefs = RouteLoader.#extractRoutes(parsed);
    const builder = new RouteBuilder();

    for (const routeDef of routeDefs) {
      RouteLoader.#buildRoute(builder, routeDef);
    }

    log.info(`RouteLoader: loaded ${routeDefs.length} route(s)`);
    return builder;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Normalise the parsed top-level structure into an array of route definition objects.
   * Each element is { id?, from: { uri, steps } }.
   */
  static #extractRoutes(parsed) {
    // Array of { route: {...} } objects
    if (Array.isArray(parsed)) {
      return parsed.map(item => item.route ?? item);
    }
    // { routes: [...] }
    if (parsed.routes) {
      return parsed.routes.map(item => item.route ?? item);
    }
    // { route: { ... } }
    if (parsed.route) {
      return [parsed.route];
    }
    // bare single route object with 'from'
    if (parsed.from) {
      return [parsed];
    }
    return [];
  }

  /**
   * Build a RouteDefinition on the given builder from a parsed route object.
   */
  static #buildRoute(builder, routeDef) {
    const fromDef = routeDef.from;
    if (!fromDef || !fromDef.uri) {
      log.warn('RouteLoader: route missing from.uri — skipping');
      return;
    }

    const routeId = routeDef.id ?? null;
    const routeDefinition = builder.from(fromDef.uri);

    if (routeId) {
      log.info(`RouteLoader: building route id='${routeId}' from='${fromDef.uri}'`);
    }

    const steps = fromDef.steps ?? [];
    RouteLoader.#applySteps(routeDefinition, steps);
  }

  /**
   * Apply an array of step objects to a RouteDefinition (or ChoiceBuilder sub-chain).
   */
  static #applySteps(target, steps) {
    for (const stepObj of steps) {
      // Each step is { <key>: <value> } — exactly one key
      const keys = Object.keys(stepObj);
      if (keys.length === 0) continue;

      const key = keys[0];
      const value = stepObj[key];

      RouteLoader.#applyStep(target, key, value, stepObj);
    }
  }

  /**
   * Apply a single step to the target RouteDefinition.
   */
  static #applyStep(target, key, value, stepObj) {
    switch (key) {
      case 'to': {
        const uri = typeof value === 'string' ? value : value?.uri;
        if (uri) target.to(uri);
        break;
      }

      case 'process': {
        // value is a js code string
        const code = typeof value === 'string' ? value : value?.js;
        if (code) target.process(js(code));
        break;
      }

      case 'filter': {
        const expr = RouteLoader.#parseExpr(value);
        target.filter(expr);
        // Nested steps appended as siblings (RouteDefinition compile handles remaining)
        if (value?.steps) {
          RouteLoader.#applySteps(target, value.steps);
        }
        break;
      }

      case 'transform': {
        const expr = RouteLoader.#parseExpr(value);
        target.transform(expr);
        break;
      }

      case 'setBody': {
        const expr = RouteLoader.#parseExpr(value);
        target.setBody(expr);
        break;
      }

      case 'setHeader': {
        const name = value?.name;
        if (!name) { log.warn(`RouteLoader: setHeader missing 'name' — skipping`); break; }
        const expr = RouteLoader.#parseExpr(value, ['name']); // exclude 'name' from expr lookup
        target.setHeader(name, expr);
        break;
      }

      case 'setProperty': {
        const name = value?.name;
        if (!name) { log.warn(`RouteLoader: setProperty missing 'name' — skipping`); break; }
        const expr = RouteLoader.#parseExpr(value, ['name']);
        target.setProperty(name, expr);
        break;
      }

      case 'removeHeader': {
        const name = typeof value === 'string' ? value : value?.name;
        if (name) target.removeHeader(name);
        break;
      }

      case 'log': {
        if (typeof value === 'string') {
          target.log(value);
        } else {
          const expr = RouteLoader.#parseExpr(value);
          target.log(expr);
        }
        break;
      }

      case 'marshal': {
        const format = value?.format ?? 'json';
        target.marshal(format);
        break;
      }

      case 'unmarshal': {
        const format = value?.format ?? 'json';
        target.unmarshal(format);
        break;
      }

      case 'convertBodyTo': {
        const type = typeof value === 'string' ? value : value?.type ?? 'String';
        target.convertBodyTo(type);
        break;
      }

      case 'stop': {
        target.stop();
        break;
      }

      case 'bean': {
        const name = typeof value === 'string' ? value : value?.ref ?? value?.name;
        if (name) target.bean(name);
        break;
      }

      case 'choice': {
        RouteLoader.#applyChoice(target, value);
        break;
      }

      case 'split': {
        const expr = RouteLoader.#parseExpr(value);
        target.split(expr);
        if (value?.steps) {
          RouteLoader.#applySteps(target, value.steps);
        }
        break;
      }

      default:
        log.warn(`RouteLoader: unknown step key '${key}' — skipping`);
    }
  }

  /**
   * Parse an expression node into a simple/js/constant expression object.
   * excludeKeys: property names on the node that are NOT expression keys (e.g. 'name').
   */
  static #parseExpr(node, excludeKeys = []) {
    if (node == null) return constant(null);

    // If node is a plain string, treat as constant
    if (typeof node === 'string') {
      return constant(node);
    }

    // If it's a number or boolean, treat as constant
    if (typeof node === 'number' || typeof node === 'boolean') {
      return constant(node);
    }

    // Object — look for expression language keys
    if (typeof node === 'object') {
      if (node.simple != null) return simple(String(node.simple));
      if (node.js != null) return js(String(node.js));
      if ('constant' in node) return constant(node.constant);

      // Check for expression nested under 'expression' key
      if (node.expression) return RouteLoader.#parseExpr(node.expression, excludeKeys);

      // Fall back: if there are non-excluded keys left, treat whole object as constant
      const exprKeys = Object.keys(node).filter(k => !excludeKeys.includes(k));
      if (exprKeys.length === 0) return constant(null);
    }

    return constant(node);
  }

  /**
   * Apply a choice/when/otherwise structure to the target.
   */
  static #applyChoice(target, value) {
    let choiceBuilder = target.choice();

    const whens = Array.isArray(value?.when) ? value.when : (value?.when ? [value.when] : []);
    for (const whenDef of whens) {
      const expr = RouteLoader.#parseExpr(whenDef, ['to', 'steps']);
      const toUri = typeof whenDef.to === 'string' ? whenDef.to : whenDef.to?.uri;
      choiceBuilder = choiceBuilder.when(expr);
      if (toUri) choiceBuilder = choiceBuilder.to(toUri);
    }

    const otherwise = value?.otherwise;
    if (otherwise) {
      const toUri = typeof otherwise === 'string' ? otherwise
        : typeof otherwise.to === 'string' ? otherwise.to
          : otherwise.to?.uri;
      choiceBuilder = choiceBuilder.otherwise();
      if (toUri) choiceBuilder = choiceBuilder.to(toUri);
    }

    choiceBuilder.end();
  }
}

export { RouteLoader };
export default RouteLoader;
