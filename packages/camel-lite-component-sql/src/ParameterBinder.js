/**
 * ParameterBinder — normalises named `:param` placeholders to driver-specific syntax.
 *
 * Supported dialects:
 *   'pg'      → $1, $2, ...  (positional, params returned as array)
 *   'mysql2'  → ?, ?, ...    (positional, params returned as array)
 *   'sqlite'  → ?, ?, ...    (positional, params returned as array)
 *   'named'   → :param       (pass-through, params returned as object)
 *
 * Input template uses :paramName placeholders:
 *   SELECT * FROM users WHERE id = :id AND status = :status
 *
 * Params are sourced from (in order):
 *   1. exchange.in.body  if it is a plain object
 *   2. exchange.in.headers (as key→value Map)
 *   3. Empty object if neither is a plain object
 */
export const ParameterBinder = {
  /**
   * Extract bind params from the exchange.
   * @param {import('camel-lite-core').Exchange} exchange
   * @returns {object}  key→value map
   */
  extractParams(exchange) {
    const body = exchange.in.body;
    if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
      return body;
    }
    // Fallback: collect all headers as params
    const params = {};
    if (exchange.in.headers instanceof Map) {
      for (const [k, v] of exchange.in.headers) {
        params[k] = v;
      }
    }
    return params;
  },

  /**
   * Replace :paramName placeholders according to the dialect.
   * @param {string} template  - SQL with :paramName placeholders
   * @param {object} params    - key→value map of bind values
   * @param {'pg'|'mysql2'|'sqlite'|'named'} dialect
   * @returns {{ sql: string, values: Array|object }}
   */
  replaceParams(template, params, dialect = 'sqlite') {
    if (dialect === 'named') {
      return { sql: template, values: params };
    }

    const values = [];
    let counter = 0;
    const sql = template.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
      values.push(params[name] ?? null);
      counter++;
      return dialect === 'pg' ? `$${counter}` : '?';
    });

    return { sql, values };
  },
};

export default ParameterBinder;
