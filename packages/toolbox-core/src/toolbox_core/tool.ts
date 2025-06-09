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
import {AxiosInstance, AxiosResponse} from 'axios';
import {logApiError} from './errorUtils.js';
import {
  BoundParams,
  BoundValue,
  identifyAuthRequirements,
  resolveValue,
} from './utils.js';

export type AuthTokenGetter = () => string | Promise<string>;
export type AuthTokenGetters = Record<string, AuthTokenGetter>;
export type RequiredAuthnParams = Record<string, string[]>;

/**
 * Creates a callable tool function representing a specific tool on a remote
 * Toolbox server.
 *
 * @param {AxiosInstance} session - The Axios session for making HTTP requests.
 * @param {string} baseUrl - The base URL of the Toolbox Server API.
 * @param {string} name - The name of the remote tool.
 * @param {string} description - A description of the remote tool.
 * @param {ZodObject<any>} paramSchema - The Zod schema for validating the tool's parameters.
 * @param {BoundParams} [boundParams] - Optional parameters to pre-bind to the tool.
 * @param {AuthTokenGetters} [authTokenGetters] - Optional map of auth service names to token getters.
 * @param {RequiredAuthnParams} [requiredAuthnParams] - Optional map of auth params that still need satisfying.
 * @param {string[]} [requiredAuthzTokens] - Optional list of auth tokens that still need satisfying.
 * @returns {CallableTool & CallableToolProperties} An async function that, when
 * called, invokes the tool with the provided arguments.
 */
function ToolboxTool(
  session: AxiosInstance,
  baseUrl: string,
  name: string,
  description: string,
  paramSchema: ZodObject<ZodRawShape>,
  boundParams: BoundParams = {},
  authTokenGetters: AuthTokenGetters = {},
  requiredAuthnParams: RequiredAuthnParams = {},
  requiredAuthzTokens: string[] = []
) {
  const toolUrl = `${baseUrl}/api/tool/${name}/invoke`;
  const boundKeys = Object.keys(boundParams);
  const userParamSchema = paramSchema.omit(
    Object.fromEntries(boundKeys.map(k => [k, true]))
  );

  const callable = async function (
    callArguments: Record<string, unknown> = {}
  ) {
    if (
      Object.keys(requiredAuthnParams).length > 0 ||
      requiredAuthzTokens.length > 0
    ) {
      const reqAuthServices = new Set<string>();
      Object.values(requiredAuthnParams).forEach(services =>
        services.forEach(s => reqAuthServices.add(s))
      );
      requiredAuthzTokens.forEach(s => reqAuthServices.add(s));
      throw new Error(
        `One or more of the following authn services are required to invoke this tool: ${[
          ...reqAuthServices,
        ].join(',')}`
      );
    }

    let validatedUserArgs: Record<string, unknown>;
    try {
      validatedUserArgs = userParamSchema.parse(callArguments);
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map(
          e => `${e.path.join('.') || 'payload'}: ${e.message}`
        );
        throw new Error(
          `Argument validation failed for tool "${name}":\n - ${errorMessages.join('\n - ')}`
        );
      }
      throw new Error(`Argument validation failed: ${String(error)}`);
    }

    const resolvedEntries = await Promise.all(
      Object.entries(boundParams).map(async ([key, value]) => {
        const resolved = await resolveValue(value);
        return [key, resolved];
      })
    );
    const resolvedBoundParams = Object.fromEntries(resolvedEntries);

    const payload = {...validatedUserArgs, ...resolvedBoundParams};

    const headers: Record<string, string> = {};
    for (const [authService, tokenGetter] of Object.entries(
      authTokenGetters
    )) {
      const token = await resolveValue(tokenGetter);
      if (typeof token !== 'string') {
        throw new Error(
          `Auth token getter for '${authService}' did not return a string.`
        );
      }
      headers[`${authService}_token`] = token;
    }

    try {
      const response: AxiosResponse = await session.post(toolUrl, payload, {
        headers,
      });
      return response.data;
    } catch (error) {
      logApiError(`Error posting data to ${toolUrl}:`, error);
      throw error;
    }
  };
  callable.toolName = name;
  callable.description = description;
  callable.params = paramSchema;
  callable.boundParams = boundParams;
  callable.authTokenGetters = authTokenGetters;
  callable.requiredAuthnParams = requiredAuthnParams;
  callable.requiredAuthzTokens = requiredAuthzTokens;

  callable.getName = function () {
    return this.toolName;
  };
  callable.getDescription = function () {
    return this.description;
  };
  callable.getParamSchema = function () {
    return this.params;
  };

  callable.addAuthTokenGetters = function (
    newAuthTokenGetters: AuthTokenGetters
  ) {
    const existingServices = Object.keys(this.authTokenGetters);
    const incomingServices = Object.keys(newAuthTokenGetters);
    const duplicates = existingServices.filter(s =>
      incomingServices.includes(s)
    );
    if (duplicates.length > 0) {
      throw new Error(
        `Authentication source(s) \`${duplicates.join(', ')}\` already registered in tool \`${this.toolName}\`.`
      );
    }

    const combinedGetters = {...this.authTokenGetters, ...newAuthTokenGetters};

    const [newReqAuthnParams, newReqAuthzTokens, usedServices] =
      identifyAuthRequirements(
        this.requiredAuthnParams,
        this.requiredAuthzTokens,
        Object.keys(newAuthTokenGetters)
      );

    const unusedAuth = incomingServices.filter(s => !usedServices.has(s));
    if (unusedAuth.length > 0) {
      throw new Error(
        `Authentication source(s) \`${unusedAuth.join(', ')}\` unused by tool \`${this.toolName}\`.`
      );
    }

    return ToolboxTool(
      session,
      baseUrl,
      this.toolName,
      this.description,
      this.params,
      this.boundParams,
      combinedGetters,
      newReqAuthnParams,
      newReqAuthzTokens
    );
  };

  callable.addAuthTokenGetter = function (
    authSource: string,
    getIdToken: AuthTokenGetter
  ) {
    return this.addAuthTokenGetters({[authSource]: getIdToken});
  };

  callable.bindParams = function (paramsToBind: BoundParams) {
    const originalParamKeys = Object.keys(this.params.shape);
    for (const paramName of Object.keys(paramsToBind)) {
      if (paramName in this.boundParams) {
        throw new Error(
          `Cannot re-bind parameter: parameter '${paramName}' is already bound in tool '${this.toolName}'.`
        );
      }
      if (!originalParamKeys.includes(paramName)) {
        throw new Error(
          `Unable to bind parameter: no parameter named '${paramName}' in tool '${this.toolName}'.`
        );
      }
    }

    const newBoundParams = {...this.boundParams, ...paramsToBind};
    return ToolboxTool(
      session,
      baseUrl,
      this.toolName,
      this.description,
      this.params,
      newBoundParams,
      this.authTokenGetters,
      this.requiredAuthnParams,
      this.requiredAuthzTokens
    );
  };

  callable.bindParam = function (paramName: string, paramValue: BoundValue) {
    return this.bindParams({[paramName]: paramValue});
  };
  return callable;
}

export {ToolboxTool};