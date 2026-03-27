import { Exchange } from './Exchange.js';

/**
 * Built-in aggregation strategy helpers.
 * Each factory returns a strategy function: (exchanges[]) => Exchange
 */
const AggregationStrategies = {
  /**
   * Collects exchange bodies into an array.
   * aggregated.in.body = [body1, body2, ...]
   */
  collectBodies() {
    return (exchanges) => {
      const agg = new Exchange();
      agg.in.body = exchanges.map(e => e.in.body);
      return agg;
    };
  },

  /**
   * Returns the last exchange in the batch (latest-wins).
   */
  latest() {
    return (exchanges) => exchanges[exchanges.length - 1];
  },

  /**
   * Concatenates string bodies with a separator (default '').
   */
  joinBodies(separator = '') {
    return (exchanges) => {
      const agg = new Exchange();
      agg.in.body = exchanges.map(e => String(e.in.body ?? '')).join(separator);
      return agg;
    };
  },
};

export { AggregationStrategies };
export default AggregationStrategies;
