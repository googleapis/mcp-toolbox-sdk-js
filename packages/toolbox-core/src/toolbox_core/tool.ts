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

import {ZodObject, ZodError, ZodRawShape} from 'zod';

import {ITransport} from './transport.types.js';
import {ParameterSchema} from './protocol.js';
import {
  BoundParams,
  BoundValue,
  identifyAuthRequirements,
  resolveValue,
  warnIfHttpAndHeaders,
} from './utils.js';
import {ClientHeadersConfig} from './client.js';

export type AuthTokenGetter = () => string | Promise<string>;
export type AuthTokenGetters = Record<string, AuthTokenGetter>;
export type RequiredAuthnParams = Record<string, string[]>;

/**
 * A loaded, callable tool. Invoke it with an arguments object to run the tool on
 * the remote Toolbox server. The attached methods return new ToolboxTool
 * instances with additional auth-token getters or pre-bound parameters.
 */
export interface ToolboxTool {
  (callArguments?: Record<string, unknown>): Promise<string>;
  toolName: string;
  description: string;
  params: ZodObject<ZodRawShape>;
  boundParams: BoundParams;
  authTokenGetters: AuthTokenGetters;
  requiredAuthnParams: RequiredAuthnParams;
  requiredAuthzTokens: string[];
  clientHeaders: ClientHeadersConfig;
  secureParams: ParameterSchema[];
  boundSecureParams: BoundParams;
  getName(): string;
  getDescription(): string;
  getParamSchema(): ZodObject<ZodRawShape>;
  getSecureParams(): ParameterSchema[];
  getBoundSecureParams(): BoundParams;
  addAuthTokenGetters(newAuthTokenGetters: AuthTokenGetters): ToolboxTool;
  addAuthTokenGetter(
    authSource: string,
    getIdToken: AuthTokenGetter,
  ): ToolboxTool;
  bindParams(paramsToBind: BoundParams): ToolboxTool;
  bindParam(paramName: string, paramValue: BoundValue): ToolboxTool;
  bindSecureParams(paramsToBind: BoundParams): ToolboxTool;
  bindSecureParam(paramName: string, paramValue: BoundValue): ToolboxTool;
}

/**
 * A helper function to get the formatted auth token header name.
 * @param {string} authTokenName - The name of the authentication service.
 * @returns {string} The formatted header name.
 */
function getAuthHeaderName(authTokenName: string): string {
  return `${authTokenName}_token`;
}

/**
 * Creates a callable tool function representing a specific tool on a remote
 * Toolbox server.
 *
 * @param {ITransport} transport - The transport for making API requests.
 * @param {string} name - The name of the remote tool.
 * @param {string} description - A description of the remote tool.
 * @param {ZodObject<any>} paramSchema - The Zod schema for validating the tool's parameters.
 * @param {AuthTokenGetters} [authTokenGetters] - Optional map of auth service names to token getters.
 * @param {RequiredAuthnParams} [requiredAuthnParams] - Optional map of auth params that still need satisfying.
 * @param {string[]} [requiredAuthzTokens] - Optional list of auth tokens that still need satisfying.
 * @param {BoundParams} [boundParams] - Optional parameters to pre-bind to the tool.
 * @param {ClientHeadersConfig} [clientHeaders] - Optional client-specific headers.
 * @param {ParameterSchema[]} [secureParams] - Optional secure parameters of the tool.
 * @param {BoundParams} [boundSecureParams] - Optional secure parameters to pre-bind to the tool.
 * @returns {ToolboxTool} An async function that, when
 * called, invokes the tool with the provided arguments.
 */
export function ToolboxTool(
  transport: ITransport,
  name: string,
  description: string,
  paramSchema: ZodObject<ZodRawShape>,
  authTokenGetters: AuthTokenGetters = {},
  requiredAuthnParams: RequiredAuthnParams = {},
  requiredAuthzTokens: string[] = [],
  boundParams: BoundParams = {},
  clientHeaders: ClientHeadersConfig = {},
  secureParams: ParameterSchema[] = [],
  boundSecureParams: BoundParams = {},
): ToolboxTool {
  const boundKeys = Object.keys(boundParams);
  const internalSecureParams = Object.freeze(
    secureParams.map(p => Object.freeze({...p})),
  );
  const internalBoundSecureParams = Object.freeze({...boundSecureParams});
  // Params bound at load time are already excluded from paramSchema by the
  // client, so only omit keys the schema actually has. zod v3 ignored absent
  // mask keys; v4 throws on them.
  const schemaKeys = new Set(Object.keys(paramSchema.shape));
  const userParamSchema = paramSchema.omit(
    Object.fromEntries(
      boundKeys.filter(k => schemaKeys.has(k)).map(k => [k, true]),
    ),
  );

  const callable = async function (
    callArguments: Record<string, unknown> = {},
  ) {
    if (
      Object.keys(requiredAuthnParams).length > 0 ||
      requiredAuthzTokens.length > 0
    ) {
      const reqAuthServices = new Set<string>();
      Object.values(requiredAuthnParams).forEach(services =>
        services.forEach(s => reqAuthServices.add(s)),
      );
      requiredAuthzTokens.forEach(s => reqAuthServices.add(s));
      throw new Error(
        `One or more of the following authn services are required to invoke this tool: ${[
          ...reqAuthServices,
        ].join(',')}`,
      );
    }

    // Fast-fail on missing required secure parameters before network request
    const missingSecure = internalSecureParams
      .filter(
        p =>
          p.required !== false &&
          (p.default === undefined || p.default === null) &&
          !(p.name in internalBoundSecureParams),
      )
      .map(p => p.name);
    if (missingSecure.length > 0) {
      throw new Error(
        `Missing required secure parameter(s) [${missingSecure.map(k => `'${k}'`).join(', ')}] for tool '${name}'`,
      );
    }

    // Prompt-injection defense: Reject bound keys or secure parameter names passed in callArguments
    const secureKeys = [
      ...internalSecureParams.map(p => p.name),
      ...Object.keys(internalBoundSecureParams),
    ];
    const providedSecureKeys = Object.keys(callArguments).filter(k =>
      secureKeys.includes(k),
    );
    if (providedSecureKeys.length > 0) {
      throw new Error(
        `unexpected parameter '${providedSecureKeys[0]}' provided`,
      );
    }

    const providedBoundKeys = Object.keys(callArguments).filter(k =>
      boundKeys.includes(k),
    );
    if (providedBoundKeys.length > 0) {
      throw new Error(
        `unexpected parameter '${providedBoundKeys[0]}' provided`,
      );
    }

    let validatedUserArgs: Record<string, unknown>;
    try {
      validatedUserArgs = userParamSchema.parse(callArguments);
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.issues.map(
          e => `${e.path.join('.') || 'payload'}: ${e.message}`,
        );
        throw new Error(
          `Argument validation failed for tool "${name}":\n - ${errorMessages.join(
            '\n - ',
          )}`,
        );
      }
      throw new Error(`Argument validation failed: ${String(error)}`);
    }

    const resolvedEntries = await Promise.all(
      Object.entries(boundParams).map(async ([key, value]) => {
        const resolved = await resolveValue(value);
        return [key, resolved];
      }),
    );
    const resolvedBoundParams = Object.fromEntries(resolvedEntries);

    const payload = {...validatedUserArgs, ...resolvedBoundParams};

    // Filter out null values from the payload
    const filteredPayload = Object.entries(payload).reduce(
      (acc, [key, value]) => {
        if (value !== null && value !== undefined) {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, unknown>,
    );

    // Resolve secure bound parameters
    const resolvedSecureEntries = await Promise.all(
      Object.entries(internalBoundSecureParams).map(async ([key, value]) => {
        const resolved = await resolveValue(value);
        return [key, resolved];
      }),
    );
    const resolvedBoundSecureParams = Object.fromEntries(
      resolvedSecureEntries.filter(
        ([, value]) => value !== null && value !== undefined,
      ),
    );

    const headers: Record<string, string> = {};
    for (const [headerName, headerValue] of Object.entries(clientHeaders)) {
      const resolvedHeaderValue = await resolveValue(headerValue);
      if (typeof resolvedHeaderValue !== 'string') {
        throw new Error(
          `Client header '${headerName}' did not resolve to a string.`,
        );
      }
      headers[headerName] = resolvedHeaderValue;
    }
    for (const [authService, tokenGetter] of Object.entries(authTokenGetters)) {
      const token = await resolveValue(tokenGetter);
      if (typeof token !== 'string') {
        throw new Error(
          `Auth token getter for '${authService}' did not return a string.`,
        );
      }
      headers[getAuthHeaderName(authService)] = token;
    }

    warnIfHttpAndHeaders(transport.baseUrl, headers);

    if (Object.keys(resolvedBoundSecureParams).length > 0) {
      return await transport.toolInvoke(
        name,
        filteredPayload,
        headers,
        resolvedBoundSecureParams,
      );
    }
    return await transport.toolInvoke(name, filteredPayload, headers);
  };
  callable.toolName = name;
  callable.description = description;
  callable.params = paramSchema;
  callable.boundParams = boundParams;
  callable.authTokenGetters = authTokenGetters;
  callable.requiredAuthnParams = requiredAuthnParams;
  callable.requiredAuthzTokens = requiredAuthzTokens;
  callable.clientHeaders = clientHeaders;
  callable.secureParams = internalSecureParams as ParameterSchema[];
  callable.boundSecureParams = internalBoundSecureParams as BoundParams;

  callable.getName = function () {
    return this.toolName;
  };
  callable.getDescription = function () {
    return this.description;
  };
  callable.getParamSchema = function () {
    return this.params;
  };
  callable.getSecureParams = function () {
    return structuredClone(this.secureParams);
  };
  callable.getBoundSecureParams = function () {
    return Object.freeze({...this.boundSecureParams});
  };

  callable.addAuthTokenGetters = function (
    newAuthTokenGetters: AuthTokenGetters,
  ) {
    const existingServices = Object.keys(this.authTokenGetters);
    const incomingServices = Object.keys(newAuthTokenGetters);
    const duplicates = existingServices.filter(s =>
      incomingServices.includes(s),
    );
    if (duplicates.length > 0) {
      throw new Error(
        `Authentication source(s) \`${duplicates.join(', ')}\` already registered in tool \`${this.toolName}\`.`,
      );
    }

    const requestHeaderNames = Object.keys(this.clientHeaders);
    const authTokenNames = incomingServices.map(getAuthHeaderName);
    const headerDuplicates = requestHeaderNames.filter(h =>
      authTokenNames.includes(h),
    );
    if (headerDuplicates.length > 0) {
      throw new Error(
        `Client header(s) \`${headerDuplicates.join(', ')}\` already registered in client. Cannot register the same headers in the client as well as tool.`,
      );
    }

    const combinedGetters = {...this.authTokenGetters, ...newAuthTokenGetters};

    const [newReqAuthnParams, newReqAuthzTokens, usedServices] =
      identifyAuthRequirements(
        this.requiredAuthnParams,
        this.requiredAuthzTokens,
        Object.keys(newAuthTokenGetters),
      );

    const unusedAuth = incomingServices.filter(s => !usedServices.has(s));
    if (unusedAuth.length > 0) {
      throw new Error(
        `Authentication source(s) \`${unusedAuth.join(', ')}\` unused by tool \`${this.toolName}\`.`,
      );
    }

    return ToolboxTool(
      transport,
      this.toolName,
      this.description,
      this.params,
      combinedGetters,
      newReqAuthnParams,
      newReqAuthzTokens,
      this.boundParams,
      this.clientHeaders,
      this.secureParams,
      this.boundSecureParams,
    );
  };

  callable.addAuthTokenGetter = function (
    authSource: string,
    getIdToken: AuthTokenGetter,
  ) {
    return this.addAuthTokenGetters({[authSource]: getIdToken});
  };

  callable.bindParams = function (paramsToBind: BoundParams) {
    const originalParamKeys = Object.keys(this.params.shape);
    const secureParamKeys = [
      ...this.secureParams.map(p => p.name),
      ...Object.keys(this.boundSecureParams),
    ];
    for (const paramName of Object.keys(paramsToBind)) {
      if (paramName in this.boundParams) {
        throw new Error(
          `Cannot re-bind parameter: parameter '${paramName}' is already bound in tool '${this.toolName}'.`,
        );
      }
      if (secureParamKeys.includes(paramName)) {
        throw new Error(
          `parameter '${paramName}' is a secure parameter; use bindSecureParam/bindSecureParams instead`,
        );
      }
      if (!originalParamKeys.includes(paramName)) {
        throw new Error(
          `Unable to bind parameter: no parameter named '${paramName}' in tool '${this.toolName}'.`,
        );
      }
    }

    const newBoundParams = {...this.boundParams, ...paramsToBind};
    return ToolboxTool(
      transport,
      this.toolName,
      this.description,
      this.params,
      this.authTokenGetters,
      this.requiredAuthnParams,
      this.requiredAuthzTokens,
      newBoundParams,
      this.clientHeaders,
      this.secureParams,
      this.boundSecureParams,
    );
  };

  callable.bindParam = function (paramName: string, paramValue: BoundValue) {
    return this.bindParams({[paramName]: paramValue});
  };

  callable.bindSecureParams = function (paramsToBind: BoundParams) {
    const secureParamKeys = this.secureParams.map(p => p.name);
    const regularParamKeys = [
      ...Object.keys(this.params.shape),
      ...Object.keys(this.boundParams),
    ];

    for (const paramName of Object.keys(paramsToBind)) {
      if (paramName in this.boundSecureParams) {
        throw new Error(
          `Cannot re-bind secure parameter: parameter '${paramName}' is already bound in tool '${this.toolName}'.`,
        );
      }
      if (regularParamKeys.includes(paramName)) {
        throw new Error(
          `parameter '${paramName}' is a regular parameter; use bindParam/bindParams instead`,
        );
      }
      if (!secureParamKeys.includes(paramName)) {
        throw new Error(
          `unable to bind secure parameters: no secure parameter named '${paramName}' in tool '${this.toolName}'.`,
        );
      }
    }

    const boundNames = new Set(Object.keys(paramsToBind));
    const newSecureParams = this.secureParams.filter(
      p => !boundNames.has(p.name),
    );
    const newBoundSecureParams = {...this.boundSecureParams, ...paramsToBind};

    return ToolboxTool(
      transport,
      this.toolName,
      this.description,
      this.params,
      this.authTokenGetters,
      this.requiredAuthnParams,
      this.requiredAuthzTokens,
      this.boundParams,
      this.clientHeaders,
      newSecureParams,
      newBoundSecureParams,
    );
  };

  callable.bindSecureParam = function (
    paramName: string,
    paramValue: BoundValue,
  ) {
    return this.bindSecureParams({[paramName]: paramValue});
  };

  return callable as unknown as ToolboxTool;
}
