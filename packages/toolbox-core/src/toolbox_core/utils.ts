export type BoundValue = unknown | (() => unknown) | (() => Promise<unknown>);

export type BoundParams = Record<string, BoundValue>;
type RequiredAuthnParams = Record<string, string[]>;

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

/**
 * Identifies authentication requirements.
 * @param reqAuthnParams - A mapping of parameter names to lists of required auth services.
 * @param reqAuthzTokens - A list of required authorization tokens.
 * @param authServiceNames - An iterable of available auth service names.
 * @returns A tuple containing remaining required params, remaining required tokens, and used services.
 */
export function identifyAuthRequirements(
  reqAuthnParams: RequiredAuthnParams,
  reqAuthzTokens: string[],
  authServiceNames: Iterable<string>
): [RequiredAuthnParams, string[], Set<string>] {
  const requiredAuthnParams: RequiredAuthnParams = {};
  const usedServices = new Set<string>();
  const availableServices = new Set(authServiceNames);

  for (const [param, services] of Object.entries(reqAuthnParams)) {
    const matchedAuthnServices = services.filter(s => availableServices.has(s));

    if (matchedAuthnServices.length > 0) {
      matchedAuthnServices.forEach(s => usedServices.add(s));
    } else {
      requiredAuthnParams[param] = services;
    }
  }

  const matchedAuthzServices = reqAuthzTokens.filter(s =>
    availableServices.has(s)
  );
  let requiredAuthzTokens: string[] = [];

  if (matchedAuthzServices.length > 0) {
    matchedAuthzServices.forEach(s => usedServices.add(s));
  } else {
    requiredAuthzTokens = [...reqAuthzTokens];
  }

  return [requiredAuthnParams, requiredAuthzTokens, usedServices];
}
