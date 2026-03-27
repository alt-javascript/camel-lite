/**
 * CamelRoutes — CDI RouteBuilder bean.
 *
 * Auto-discovered by RouteRegistry because it has a configure(camelContext) method.
 * Defines three routes:
 *   1. direct:inbound   — receives messages from the REST controller
 *   2. timer:heartbeat  — fires every 5 seconds
 *   3. master:example   — leader election; logs when this node becomes leader
 */
import { RouteBuilder } from 'camel-lite-core';

export class CamelRoutes extends RouteBuilder {
  static qualifier = 'example-boot-camel-lite-hono/CamelRoutes';

  constructor() {
    super();
    this.logger = null; // autowired
  }

  configure(camelContext) {
    // Route 1: inbound message from REST controller
    this.from('direct:inbound')
      .process(ex => {
        const body = ex.in.body;
        this.logger?.info(`[direct:inbound] received: ${JSON.stringify(body)}`);
        // Echo the body back (controller reads exchange.in.body as result)
      });

    // Route 2: heartbeat timer — fires every 5 seconds
    this.from('timer:heartbeat?period=5000')
      .process(ex => {
        const counter = ex.in.getHeader('CamelTimerCounter');
        this.logger?.info(`[timer:heartbeat] tick #${counter}`);
      });

    // Route 3: master: leader election — file backend, polls every 3 seconds
    this.from('master:example-app?backend=file&pollInterval=3000')
      .process(ex => {
        const isLeader = ex.in.getHeader('CamelMasterIsLeader');
        const nodeId   = ex.in.getHeader('CamelMasterNodeId');
        if (isLeader) {
          this.logger?.info(`[master:example-app] *** LEADER ELECTED — nodeId: ${nodeId} ***`);
        } else {
          this.logger?.info(`[master:example-app] leader lost — nodeId: ${nodeId}`);
        }
      });
  }
}
