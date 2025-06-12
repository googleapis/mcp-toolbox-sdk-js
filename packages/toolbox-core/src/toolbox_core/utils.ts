// Copyright 2025 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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

  // Determine remaining authorization tokens and update usedServices
  const remainingAuthzTokens = reqAuthzTokens.filter(token => {
    if (availableServices.has(token)) {
      usedServices.add(token);
      return false;
    }
    return true;
  });

  return [requiredAuthnParams, remainingAuthzTokens, usedServices];
}
