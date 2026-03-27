class CamelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CamelError';
  }
}

export { CamelError };
export default CamelError;
