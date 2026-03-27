/**
 * CamelLiteAutoConfiguration — CDI auto-configuration for camel-lite.
 *
 * Registers the following CDI beans:
 *
 *   camelLiteContext      — wraps CamelContext; async start via init()/ready()/destroy()
 *   routeRegistry         — discovers CDI RouteBuilder beans + config route objects
 *   direct/seda/log/...   — one ConfiguredComponent per scheme (8 bundled)
 *   camelProducerTemplate — ProducerTemplate CDI bean
 *   camelConsumerTemplate — ConsumerTemplate CDI bean
 *
 * Config prefix: boot.camel-lite
 *
 * Per-scheme enable/disable:
 *   boot.camel-lite.direct.enabled = false   → DirectComponent not registered
 *   (default: true for all bundled schemes)
 *
 * Route definitions from config:
 *   boot.camel-lite.routes[0].definition: { route: { from: { uri: ..., steps: [...] } } }
 *   (already-parsed JS object — @alt-javascript/config deserialises at load time)
 *
 * CDI RouteBuilder discovery:
 *   Any CDI bean with a configure(camelContext) method is treated as a RouteBuilder.
 */

import { LoggerFactory } from '@alt-javascript/logger';
import { CamelContext, RouteLoader, ProducerTemplate, ConsumerTemplate } from 'camel-lite-core';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/boot/CamelLiteAutoConfiguration');

export const PREFIX = 'boot.camel-lite';

// ---------------------------------------------------------------------------
// CamelLiteContext
// ---------------------------------------------------------------------------

export class CamelLiteContext {
  constructor() {
    this._applicationContext = null;
    this._camelContext = null;
    this._startPromise = null;
  }

  setApplicationContext(ctx) {
    this._applicationContext = ctx;
  }

  get camelContext() {
    return this._camelContext;
  }

  init() {
    this._camelContext = new CamelContext();

    // Wire registered components from CDI context into the CamelContext
    const registry = this._applicationContext.get('routeRegistry');
    registry.applyComponents(this._camelContext, this._applicationContext);
    registry.applyRoutes(this._camelContext, this._applicationContext.config);

    this._startPromise = this._camelContext.start();
    log.info('CamelLiteContext: starting CamelContext (async)');
    return this._startPromise;
  }

  /**
   * Await full CamelContext start (routes active, consumers registered).
   * @returns {Promise<void>}
   */
  async ready() {
    if (this._startPromise) await this._startPromise;
  }

  async destroy() {
    if (this._camelContext) {
      await this._camelContext.stop();
      log.info('CamelLiteContext: CamelContext stopped');
    }
  }
}

// ---------------------------------------------------------------------------
// RouteRegistry
// ---------------------------------------------------------------------------

export class RouteRegistry {
  constructor() {
    this._applicationContext = null;
  }

  setApplicationContext(ctx) {
    this._applicationContext = ctx;
  }

  init() {
    // No-op at init time — applyComponents and applyRoutes are called by CamelLiteContext.init()
  }

  /**
   * Register camel-lite components from CDI beans into the CamelContext.
   * Each CDI bean named 'camelComponent.<scheme>' has already registered itself;
   * this just ensures the CamelContext receives them in the right order.
   * Component beans call camelContext.addComponent() themselves in their init(),
   * but since CamelLiteContext.init() runs after them (via dependsOn), the
   * CamelContext doesn't exist yet. So we store the registrations here and
   * apply them when CamelLiteContext calls applyComponents().
   *
   * @param {CamelContext} camelContext
   * @param {ApplicationContext} appCtx
   */
  applyComponents(camelContext, appCtx) {
    const components = appCtx.components;
    let count = 0;
    for (const [name, def] of Object.entries(components)) {
      if (name.startsWith('camelComponent.')) {
        const scheme = name.slice('camelComponent.'.length);
        const wrapper = appCtx.get(name);
        const component = typeof wrapper.getComponent === 'function'
          ? wrapper.getComponent()
          : wrapper;
        camelContext.addComponent(scheme, component);
        log.debug(`RouteRegistry: registered component '${scheme}'`);
        count++;
      }
    }
    log.info(`RouteRegistry: registered ${count} component(s)`);
  }

  /**
   * Discover CDI RouteBuilder beans and config-driven route definitions,
   * register all on the CamelContext.
   *
   * @param {CamelContext} camelContext
   * @param {import('@alt-javascript/config').IConfig} config
   */
  applyRoutes(camelContext, config) {
    let count = 0;
    const appCtx = this._applicationContext;

    // 1. CDI RouteBuilder beans — any bean with a configure(ctx) method
    for (const [name, def] of Object.entries(appCtx.components)) {
      // Skip internal camel-lite beans
      if (name === 'camelLiteContext' || name === 'routeRegistry' ||
          name === 'camelProducerTemplate' || name === 'camelConsumerTemplate' ||
          name.startsWith('camelComponent.')) continue;

      const bean = appCtx.get(name);
      if (bean && typeof bean.configure === 'function') {
        log.debug(`RouteRegistry: discovered CDI RouteBuilder '${name}'`);
        camelContext.addRoutes(bean);
        count++;
      }
    }

    // 2. Config-driven route definition objects
    // boot.camel-lite.routes is an array; each entry has a .definition property
    // that is an already-parsed JS object (deserialized by @alt-javascript/config)
    const routesKey = `${PREFIX}.routes`;
    if (config.has(routesKey)) {
      const routes = config.get(routesKey);
      const arr = Array.isArray(routes) ? routes : [routes];
      for (let i = 0; i < arr.length; i++) {
        const entry = arr[i];
        const defKey = `${routesKey}[${i}].definition`;
        const definition = config.has(defKey) ? config.get(defKey) : entry?.definition;
        if (!definition) {
          log.warn(`RouteRegistry: boot.camel-lite.routes[${i}] has no definition — skipping`);
          continue;
        }
        try {
          const builder = RouteLoader.loadObject(definition);
          camelContext.addRoutes(builder);
          log.info(`RouteRegistry: loaded config route[${i}]`);
          count++;
        } catch (err) {
          log.warn(`RouteRegistry: failed to load config route[${i}]: ${err.message}`);
        }
      }
    }

    log.info(`RouteRegistry: registered ${count} route builder(s)`);
  }
}

// ---------------------------------------------------------------------------
// Component factory — creates a CDI singleton that holds a camel-lite component
// instance, retrievable by CamelLiteContext via applyComponents()
// ---------------------------------------------------------------------------

function makeComponentClass(scheme, ComponentClass) {
  class ConfiguredComponent {
    constructor() {
      this._component = new ComponentClass();
    }

    /** Returns the underlying camel-lite component instance. */
    getComponent() {
      return this._component;
    }
  }
  // Give the class a meaningful name for CDI
  Object.defineProperty(ConfiguredComponent, 'name', { value: `CamelComponent_${scheme}` });
  return ConfiguredComponent;
}

function isEnabled(config, scheme) {
  const key = `${PREFIX}.${scheme}.enabled`;
  if (config.has(key)) {
    const val = config.get(key);
    return val !== false && val !== 'false';
  }
  return true; // enabled by default
}

// ---------------------------------------------------------------------------
// ProducerTemplate / ConsumerTemplate CDI beans
// ---------------------------------------------------------------------------

export class CdiProducerTemplate {
  constructor() {
    this.camelLiteContext = null; // autowired
  }

  init() { /* wired by CDI property injection */ }

  async sendBody(uri, body, headers) {
    await this.camelLiteContext.ready();
    const pt = new ProducerTemplate(this.camelLiteContext.camelContext);
    return pt.sendBody(uri, body, headers);
  }

  async requestBody(uri, body, headers) {
    await this.camelLiteContext.ready();
    const pt = new ProducerTemplate(this.camelLiteContext.camelContext);
    return pt.requestBody(uri, body, headers);
  }
}

export class CdiConsumerTemplate {
  constructor() {
    this.camelLiteContext = null; // autowired
  }

  init() { /* wired by CDI property injection */ }

  async receiveBody(uri, timeoutMs) {
    await this.camelLiteContext.ready();
    const ct = new ConsumerTemplate(this.camelLiteContext.camelContext);
    return ct.receiveBody(uri, timeoutMs);
  }

  async receive(uri, timeoutMs) {
    await this.camelLiteContext.ready();
    const ct = new ConsumerTemplate(this.camelLiteContext.camelContext);
    return ct.receive(uri, timeoutMs);
  }
}

// ---------------------------------------------------------------------------
// camelLiteAutoConfiguration()
// ---------------------------------------------------------------------------

const BUNDLED_SCHEMES = ['direct', 'seda', 'log', 'file', 'http', 'ftp', 'timer', 'cron'];

const COMPONENT_IMPORTS = {
  direct: () => import('camel-lite-component-direct').then(m => m.DirectComponent),
  seda:   () => import('camel-lite-component-seda').then(m => m.SedaComponent),
  log:    () => import('camel-lite-component-log').then(m => m.LogComponent),
  file:   () => import('camel-lite-component-file').then(m => m.FileComponent),
  http:   () => import('camel-lite-component-http').then(m => m.HttpComponent),
  ftp:    () => import('camel-lite-component-ftp').then(m => m.FtpComponent),
  timer:  () => import('camel-lite-component-timer').then(m => m.TimerComponent),
  cron:   () => import('camel-lite-component-cron').then(m => m.CronComponent),
};

/**
 * Returns CDI component definitions for the core camel-lite starter.
 *
 * @param {object} [options]
 * @param {string[]} [options.schemes] — override bundled scheme list
 * @returns {Promise<Array>} CDI component definition array
 */
export async function camelLiteAutoConfiguration(options = {}) {
  const schemes = options.schemes ?? BUNDLED_SCHEMES;
  const defs = [];

  // --- Component beans (loaded eagerly so we have the class reference) ---
  const componentBeanNames = [];
  for (const scheme of schemes) {
    const beanName = `camelComponent.${scheme}`;
    componentBeanNames.push(beanName);

    const ComponentClass = await COMPONENT_IMPORTS[scheme]();
    const ConfiguredComponent = makeComponentClass(scheme, ComponentClass);

    defs.push({
      name: beanName,
      Reference: ConfiguredComponent,
      scope: 'singleton',
      condition: (config) => isEnabled(config, scheme),
    });
  }

  // --- RouteRegistry ---
  defs.push({
    name: 'routeRegistry',
    Reference: RouteRegistry,
    scope: 'singleton',
  });

  // --- CamelLiteContext (depends on routeRegistry only — component beans are
  //     optional and scanned dynamically by RouteRegistry.applyComponents()) ---
  defs.push({
    name: 'camelLiteContext',
    Reference: CamelLiteContext,
    scope: 'singleton',
    dependsOn: 'routeRegistry',
  });

  // --- ProducerTemplate ---
  defs.push({
    name: 'camelProducerTemplate',
    Reference: CdiProducerTemplate,
    scope: 'singleton',
    properties: [{ name: 'camelLiteContext', reference: 'camelLiteContext' }],
    dependsOn: 'camelLiteContext',
  });

  // --- ConsumerTemplate ---
  defs.push({
    name: 'camelConsumerTemplate',
    Reference: CdiConsumerTemplate,
    scope: 'singleton',
    properties: [{ name: 'camelLiteContext', reference: 'camelLiteContext' }],
    dependsOn: 'camelLiteContext',
  });

  return defs;
}
