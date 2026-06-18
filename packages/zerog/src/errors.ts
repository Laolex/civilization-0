export class ZeroGStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ZeroGStorageError";
  }
}
export class ZeroGBrainError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ZeroGBrainError";
  }
}
