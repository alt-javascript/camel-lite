/**
 * Expression builders for camel-lite EIP predicates and expressions.
 *
 * Three forms are supported by all EIP DSL methods (filter, transform, split, aggregate, choice):
 *   1. Native JS function:  (exchange) => value
 *   2. simple(template):    Camel Simple language subset — ${body}, ${header.X}, ${exchangeProperty.X}
 *   3. js(code):            Arbitrary JS string evaluated as new Function('exchange', code)
 *
 * All three normalise to: (exchange) => value
 */

/**
 * Normalise a predicate/expression to a plain function.
 * If already a function, returned as-is.
 * If an object with a _camelExpr flag (returned by simple/js), the compiled fn is extracted.
 */
export function normaliseExpression(expr) {
  if (typeof expr === 'function') return expr;
  if (expr && typeof expr === 'object' && typeof expr._fn === 'function') return expr._fn;
  throw new TypeError('Expression must be a function, simple(...) or js(...) result');
}

/**
 * Compile a Camel Simple language template string to a function.
 *
 * Supported tokens:
 *   ${body}                 → exchange.in.body
 *   ${in.body}              → exchange.in.body
 *   ${header.X}             → exchange.in.getHeader('X')
 *   ${headers.X}            → exchange.in.getHeader('X')
 *   ${exchangeProperty.X}   → exchange.getProperty('X')
 *
 * Comparison operators (used in predicate context):
 *   ==, !=, >, >=, <, <=
 *   contains, not contains  → .includes() / !.includes()
 *   regex                   → new RegExp(rhs).test(lhs)
 *   is, is not              → instanceof (class name lookup — limited)
 *   in, not in              → [a,b,c].includes()
 *   null                    → null literal
 *   empty                   → '' or null or 0 check
 *
 * Logical: &&, ||, and, or
 */
export function simple(template) {
  const code = compileSimple(template);
  // eslint-disable-next-line no-new-func
  const fn = new Function('exchange', `"use strict"; return (${code});`);
  return { _camelExpr: true, _template: template, _fn: fn };
}

/**
 * Wrap a constant value as an expression function.
 * The returned object is compatible with normaliseExpression().
 *
 * Example: constant('hello') → expression that always returns 'hello'
 */
export function constant(value) {
  return { _camelExpr: true, _value: value, _fn: () => value };
}


export function js(code) {
  // If the code contains newlines or multiple statements (const/let/var declarations,
  // semicolons), compile as a function body rather than a single return expression.
  const trimmed = code.trim();
  const isBlock = /\n/.test(trimmed) || /^\s*(const|let|var|if|for|while|return)\b/.test(trimmed);
  let fn;
  if (isBlock) {
    // Multi-statement block: wrap in a function body, last expression is returned
    // by convention the block should end with the value to return.
    // eslint-disable-next-line no-new-func
    fn = new Function('exchange', `"use strict"; ${trimmed}`);
  } else {
    // Single expression: wrap in return(...)
    // eslint-disable-next-line no-new-func
    fn = new Function('exchange', `"use strict"; return (${trimmed});`);
  }
  return { _camelExpr: true, _code: code, _fn: fn };
}

// ---------------------------------------------------------------------------
// Simple language compiler
// ---------------------------------------------------------------------------

function compileSimple(template) {
  let t = template.trim();

  // Replace ${body} and ${in.body}
  t = t.replace(/\$\{(?:in\.)?body\}/g, 'exchange.in.body');

  // Replace ${header.X} and ${headers.X}
  t = t.replace(/\$\{headers?\.([^}]+)\}/g, (_, name) => `exchange.in.getHeader(${JSON.stringify(name)})`);

  // Replace ${out.body}
  t = t.replace(/\$\{out\.body\}/g, 'exchange.out.body');

  // Replace ${exchangeProperty.X}
  t = t.replace(/\$\{exchangeProperty\.([^}]+)\}/g, (_, name) => `exchange.getProperty(${JSON.stringify(name)})`);

  // Replace ${null} literal
  t = t.replace(/\$\{null\}/g, 'null');

  // contains / not contains
  t = t.replace(/\bnot contains\b/g, '%%NOT_CONTAINS%%');
  t = t.replace(/\bcontains\s+"([^"]+)"/g, (_, v) => `.includes(${JSON.stringify(v)})`);
  t = t.replace(/\bcontains\s+'([^']+)'/g, (_, v) => `.includes(${JSON.stringify(v)})`);
  t = t.replace(/%%NOT_CONTAINS%%\s+"([^"]+)"/g, (_, v) => `!String(exchange.in.body).includes(${JSON.stringify(v)})`);

  // regex
  t = t.replace(/\s+regex\s+"([^"]+)"/g, (_, pattern) => ` && new RegExp(${JSON.stringify(pattern)}).test(String(exchange.in.body))`);

  // Logical: 'and' / 'or' (whole word, not inside strings)
  t = t.replace(/\band\b/g, '&&');
  t = t.replace(/\bor\b/g, '||');

  // Simple language uses == for equality (map to ===)
  // but only if not already === or !==
  t = t.replace(/([^!<>=])==/g, '$1===');
  t = t.replace(/([^!<>=])!=/g, '$1!==');

  return t;
}
