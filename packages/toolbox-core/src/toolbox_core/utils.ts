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

type RequiredAuthnParams = Record<string, string[]>;

/**
 * Asynchronously or synchronously resolves a given source to its value.
 * @param source The value, a callable returning a value, or a callable returning an awaitable value.
 * @returns The resolved value.
 */
export async function resolveValue<T>(
  source: (() => T | Promise<T>) | T
): Promise<T> {
  if (typeof source === 'function') {
    const fn = source as () => T | Promise<T>;
    return await Promise.resolve(fn());
  }
  return source;
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
  let requiredAuthzTokensResult: string[] = [];

  if (matchedAuthzServices.length > 0) {
    matchedAuthzServices.forEach(s => usedServices.add(s));
  } else {
    requiredAuthzTokensResult = [...reqAuthzTokens];
  }

  return [requiredAuthnParams, requiredAuthzTokensResult, usedServices];
}
