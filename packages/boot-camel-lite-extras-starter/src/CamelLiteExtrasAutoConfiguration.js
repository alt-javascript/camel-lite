/**
 * CamelLiteExtrasAutoConfiguration — CDI auto-configuration for camel-lite extras.
 *
 * Extends boot-camel-lite-starter with four additional component auto-configurations:
 *   amqp:   camelComponent.amqp   — boot.camel-lite.amqp.enabled (default: true)
 *   sql:    camelComponent.sql    — boot.camel-lite.sql.enabled   (default: true)
 *   nosql:  camelComponent.nosql  — boot.camel-lite.nosql.enabled (default: true)
 *   master: camelComponent.master — boot.camel-lite.master.enabled (default: true)
 *
 * Config keys:
 *   boot.camel-lite.amqp.enabled    — enable AMQP component (default: true)
 *   boot.camel-lite.sql.enabled     — enable SQL component (default: true)
 *   boot.camel-lite.nosql.enabled   — enable NoSQL component (default: true)
 *   boot.camel-lite.master.enabled  — enable master: leader election component (default: true)
 *
 * All component-level parameters (connection URLs, backend selection, etc.) are
 * specified per-route in the URI, not at component registration time.
 * The components themselves are stateless at construction — state lives in
 * endpoints and consumers.
 */

import { LoggerFactory } from '@alt-javascript/logger';
import { PREFIX } from 'boot-camel-lite-starter';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/boot/CamelLiteExtrasAutoConfiguration');

// ---------------------------------------------------------------------------
// Generic wrapper factory (same pattern as boot-camel-lite-starter)
// ---------------------------------------------------------------------------

function makeComponentClass(scheme, ComponentClass) {
  class ConfiguredComponent {
    constructor() {
      this._component = new ComponentClass();
    }
    getComponent() { return this._component; }
  }
  Object.defineProperty(ConfiguredComponent, 'name', { value: `CamelExtrasComponent_${scheme}` });
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
// Extras component definitions
// ---------------------------------------------------------------------------

const EXTRAS_SCHEMES = ['amqp', 'sql', 'nosql', 'master'];

const EXTRAS_IMPORTS = {
  amqp:   () => import('camel-lite-component-amqp').then(m => m.AmqpComponent),
  sql:    () => import('camel-lite-component-sql').then(m => m.SqlComponent),
  nosql:  () => import('camel-lite-component-nosql').then(m => m.NosqlComponent),
  master: () => import('camel-lite-component-master').then(m => m.MasterComponent),
};

/**
 * Returns CDI component definitions for the extras camel-lite components.
 * These are merged with camelLiteAutoConfiguration() by camelLiteExtrasStarter().
 *
 * @param {object} [options]
 * @param {string[]} [options.schemes] — override extras scheme list
 * @returns {Promise<Array>} CDI component definition array
 */
export async function camelLiteExtrasAutoConfiguration(options = {}) {
  const schemes = options.schemes ?? EXTRAS_SCHEMES;
  const defs = [];

  for (const scheme of schemes) {
    const beanName = `camelComponent.${scheme}`;
    const ComponentClass = await EXTRAS_IMPORTS[scheme]();
    const ConfiguredComponent = makeComponentClass(scheme, ComponentClass);

    defs.push({
      name: beanName,
      Reference: ConfiguredComponent,
      scope: 'singleton',
      condition: (config) => isEnabled(config, scheme),
    });

    log.debug(`CamelLiteExtrasAutoConfiguration: registered definition for '${scheme}'`);
  }

  return defs;
}
