class MammalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MammalError';
  }
}

export { MammalError };
export default MammalError;
