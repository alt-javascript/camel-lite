import { LoggerFactory } from '@alt-javascript/logger';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/cli/components');

/**
 * Register all bundled camel-lite components into a CamelContext.
 *
 * Each component is wrapped in a try/catch so that a missing native dependency
 * (e.g. AMQP without a broker, FTP without basic-ftp installed) skips that
 * component with a warning rather than crashing the CLI for routes that don't
 * use it.
 *
 * @param {import('camel-lite-core').CamelContext} ctx
 */
async function registerAllComponents(ctx) {
  const registrations = [
    { scheme: 'direct',  loader: () => import('camel-lite-component-direct').then(m => new m.DirectComponent()) },
    { scheme: 'seda',    loader: () => import('camel-lite-component-seda').then(m => new m.SedaComponent()) },
    { scheme: 'log',     loader: () => import('camel-lite-component-log').then(m => new m.LogComponent()) },
    { scheme: 'file',    loader: () => import('camel-lite-component-file').then(m => new m.FileComponent()) },
    { scheme: 'http',    loader: () => import('camel-lite-component-http').then(m => new m.HttpComponent()) },
    { scheme: 'ftp',     loader: () => import('camel-lite-component-ftp').then(m => new m.FtpComponent()) },
    { scheme: 'amqp',    loader: () => import('camel-lite-component-amqp').then(m => new m.AmqpComponent()) },
    { scheme: 'sql',     loader: () => import('camel-lite-component-sql').then(m => new m.SqlComponent()) },
    { scheme: 'nosql',   loader: () => import('camel-lite-component-nosql').then(m => new m.NosqlComponent()) },
    { scheme: 'timer',   loader: () => import('camel-lite-component-timer').then(m => new m.TimerComponent()) },
    { scheme: 'cron',    loader: () => import('camel-lite-component-cron').then(m => new m.CronComponent()) },
    { scheme: 'master',  loader: () => import('camel-lite-component-master').then(m => new m.MasterComponent()) },
  ];

  for (const { scheme, loader } of registrations) {
    try {
      const component = await loader();
      ctx.addComponent(scheme, component);
      log.info(`Registered component: ${scheme}`);
    } catch (err) {
      log.warn(`Skipping component '${scheme}': ${err.message}`);
    }
  }
}

export { registerAllComponents };
