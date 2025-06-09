export type BoundValue = unknown | (() => unknown) | (() => Promise<unknown>);

export type BoundParams = Record<string, BoundValue>;

/**
 * Resolves a value that might be a literal, a function, or a promise-returning function.
 * @param {BoundValue} value The value to resolve.
 * @returns {Promise<unknown>} A promise that resolves to the final literal value.
 */
export async function resolveValue(value: BoundValue): Promise<unknown> {
  if (typeof value === 'function') {
    // Execute the function and await its result, correctly handling both sync and async functions.
    return await Promise.resolve(value());
  }
  return value;
}
