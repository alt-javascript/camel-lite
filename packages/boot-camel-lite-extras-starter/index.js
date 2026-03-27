/**
 * boot-camel-lite-extras-starter
 *
 * CDI auto-configuration for camel-lite extras: amqp, sql, nosql, master.
 * Extends boot-camel-lite-starter (core + direct/seda/log/file/http/ftp/timer/cron).
 *
 * Usage:
 *   import { camelLiteExtrasStarter } from 'boot-camel-lite-extras-starter';
 *
 *   const { applicationContext } = await camelLiteExtrasStarter({
 *     config: new EphemeralConfig({
 *       boot: {
 *         'camel-lite': {
 *           nosql: { enabled: true },
 *           routes: [{
 *             definition: { route: { from: { uri: 'nosql:myCollection?url=jsnosqlc:memory:', steps: [] } } }
 *           }]
 *         }
 *       }
 *     })
 *   });
 *
 * Config keys:
 *   boot.camel-lite.amqp.enabled    — enable AMQP component (default: true)
 *   boot.camel-lite.sql.enabled     — enable SQL component (default: true)
 *   boot.camel-lite.nosql.enabled   — enable NoSQL component (default: true)
 *   boot.camel-lite.master.enabled  — enable master: leader election (default: true)
 */

import { ApplicationContext } from '@alt-javascript/cdi';
import { EphemeralConfig } from '@alt-javascript/config';
import {
  camelLiteAutoConfiguration,
} from 'boot-camel-lite-starter';
import {
  camelLiteExtrasAutoConfiguration,
} from './src/CamelLiteExtrasAutoConfiguration.js';

export { camelLiteExtrasAutoConfiguration };

/**
 * Boot the application with camel-lite core + extras auto-configuration.
 *
 * @param {object} options
 * @param {Array}   [options.contexts]    — CDI Context array (your beans)
 * @param {object}  [options.config]      — config object or POJO
 * @param {object}  [options.startOptions] — forwarded to ApplicationContext.start()
 * @returns {Promise<{applicationContext: ApplicationContext}>}
 */
export async function camelLiteExtrasStarter(options = {}) {
  const { contexts = [], config, startOptions = {} } = options;

  const cfg = config instanceof Object && typeof config.has === 'function'
    ? config
    : new EphemeralConfig(config ?? {});

  const [coreConfig, extrasConfig] = await Promise.all([
    camelLiteAutoConfiguration(options),
    camelLiteExtrasAutoConfiguration(options),
  ]);

  const applicationContext = new ApplicationContext({
    config: cfg,
    contexts: [...contexts, coreConfig, extrasConfig],
    ...startOptions,
  });

  await applicationContext.start();
  return { applicationContext };
}
