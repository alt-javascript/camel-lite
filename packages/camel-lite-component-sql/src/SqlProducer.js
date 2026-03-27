import { Producer } from 'camel-lite-core';
import { LoggerFactory } from '@alt-javascript/logger';
import { ParameterBinder } from './ParameterBinder.js';

const log = LoggerFactory.getLogger('@alt-javascript/camel-lite/SqlProducer');

/**
 * SqlProducer — executes the endpoint's SQL query against the registered datasource.
 *
 * Result mapping:
 *   SELECT (outputType='rows')     → exchange.in.body = array of row objects
 *   INSERT/UPDATE/DELETE           → exchange.in.body = { rowCount: N }
 *   outputType='rowCount' forced   → exchange.in.body = { rowCount: N }
 *
 * Driver detection (via endpoint.dialect):
 *   'sqlite'  → better-sqlite3 sync API: db.prepare(sql).all(values) / .run(values)
 *   'pg'      → pg async API: pool.query(sql, values) → { rows, rowCount }
 *   'mysql2'  → mysql2 async API: pool.query(sql, values) → [rows, fields]
 *   'named'   → better-sqlite3 named API: db.prepare(sql).all(namedObj)
 */
class SqlProducer extends Producer {
  #endpoint;

  constructor(endpoint) {
    super();
    this.#endpoint = endpoint;
  }

  async send(exchange) {
    const { datasourceName, query, outputType, dialect, component, context } = this.#endpoint;

    const db = component.getDatasource(datasourceName, context);
    const params = ParameterBinder.extractParams(exchange);
    const { sql, values } = ParameterBinder.replaceParams(query, params, dialect);

    log.debug(`SqlProducer [${dialect}] executing: ${sql}`);

    let result;
    if (dialect === 'sqlite' || dialect === 'named') {
      result = await SqlProducer.#execSqlite(db, sql, values, outputType);
    } else if (dialect === 'pg') {
      result = await SqlProducer.#execPg(db, sql, values, outputType);
    } else if (dialect === 'mysql2') {
      result = await SqlProducer.#execMysql2(db, sql, values, outputType);
    } else {
      throw new Error(`SqlProducer: unknown dialect '${dialect}'`);
    }

    exchange.in.body = result;
    log.debug(`SqlProducer done: outputType=${outputType}`);
  }

  static async #execSqlite(db, sql, values, outputType) {
    const stmt = db.prepare(sql);
    const sqlTrimmed = sql.trimStart().toUpperCase();
    const isSelect = sqlTrimmed.startsWith('SELECT') || sqlTrimmed.startsWith('WITH');

    if (outputType === 'rows' && isSelect) {
      // node:sqlite StatementSync.all() takes spread args, not an array.
      // We spread values so both [] and [...items] forms work.
      return stmt.all(...(Array.isArray(values) ? values : Object.values(values)));
    } else {
      const info = stmt.run(...(Array.isArray(values) ? values : Object.values(values)));
      return { rowCount: info.changes };
    }
  }

  static async #execPg(pool, sql, values, outputType) {
    const result = await pool.query(sql, values);
    if (outputType === 'rows') {
      return result.rows;
    }
    return { rowCount: result.rowCount };
  }

  static async #execMysql2(pool, sql, values, outputType) {
    const [rows] = await pool.query(sql, values);
    if (outputType === 'rows' && Array.isArray(rows)) {
      return rows;
    }
    return { rowCount: rows.affectedRows ?? 0 };
  }
}

export { SqlProducer };
export default SqlProducer;
