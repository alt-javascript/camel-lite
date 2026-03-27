/**
 * boot-camel-lite-starter
 *
 * CDI auto-configuration for camel-lite.
 * Bundles: core + direct, seda, log, file, http, ftp, timer, cron.
 *
 * Usage:
 *   import { camelLiteStarter } from '@alt-javascript/boot-camel-lite-starter';
 *
 *   const { applicationContext } = await camelLiteStarter({
 *     config: {
 *       'boot.camel-lite.routes': [
 *         { definition: { route: { from: { uri: 'direct:hello', steps: [{ log: { simple: '${body}' } }] } } } }
 *       ]
 *     },
 *     contexts: [new Context([new Singleton(MyRouteBuilder)])],
 *   });
 *
 *   const ctx = applicationContext.get('camelLiteContext');
 *   await ctx.ready();
 *
 *   const pt = applicationContext.get('camelProducerTemplate');
 *   await pt.sendBody('direct:hello', 'world');
 *
 * Config keys (prefix: boot.camel-lite):
 *   boot.camel-lite.<scheme>.enabled     — enable/disable bundled component (default: true)
 *   boot.camel-lite.routes[n].definition — already-parsed route definition object
 */

import { ApplicationContext } from '@alt-javascript/cdi';
import { EphemeralConfig } from '@alt-javascript/config';
import {
  camelLiteAutoConfiguration,
  CamelLiteContext,
  RouteRegistry,
  CdiProducerTemplate,
  CdiConsumerTemplate,
} from './src/CamelLiteAutoConfiguration.js';

export {
  camelLiteAutoConfiguration,
  CamelLiteContext,
  RouteRegistry,
  CdiProducerTemplate,
  CdiConsumerTemplate,
};

export { PREFIX } from './src/CamelLiteAutoConfiguration.js';

/**
 * Boot the application with camel-lite auto-configuration.
 *
 * @param {object} options
 * @param {Array}   [options.contexts]    — CDI Context array (your beans)
 * @param {object}  [options.config]      — config object or POJO
 * @param {object}  [options.startOptions] — forwarded to ApplicationContext.start()
 * @returns {Promise<{applicationContext: ApplicationContext}>}
 */
export async function camelLiteStarter(options = {}) {
  const { contexts = [], config, startOptions = {} } = options;

  const cfg = config instanceof Object && typeof config.has === 'function'
    ? config
    : new EphemeralConfig(config ?? {});

  const autoConfig = await camelLiteAutoConfiguration(options);

  const applicationContext = new ApplicationContext({
    config: cfg,
    contexts: [...contexts, autoConfig],
    ...startOptions,
  });

  await applicationContext.start();
  return { applicationContext };
}
