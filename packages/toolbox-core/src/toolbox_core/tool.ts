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
import {identifyAuthRequirements, resolveValue} from './utils.js';

type AuthTokenGetter = () => string | Promise<string>;
type AuthTokenGetters = Record<string, AuthTokenGetter>;
type RequiredAuthnParams = Record<string, string[]>;

/**
 * Creates a callable tool function representing a specific tool on a remote
 * Toolbox server.
 *
 * @param {AxiosInstance} session - The Axios session for making HTTP requests.
 * @param {string} baseUrl - The base URL of the Toolbox Server API.
 * @param {string} name - The name of the remote tool.
 * @param {string} description - A description of the remote tool.
 * @param {ZodObject<any>} paramSchema - The Zod schema for validating the tool's parameters.
 * @param {RequiredAuthnParams} requiredAuthnParams - A map of required authenticated parameters.
 * @param {string[]} requiredAuthzTokens - A sequence of alternative services for authorization.
 * @param {AuthTokenGetters} authServiceTokenGetters - A dict of authService to token getters.
 * @returns {CallableTool & CallableToolProperties} An async function that, when
 * called, invokes the tool with the provided arguments.
 */
function ToolboxTool(
  session: AxiosInstance,
  baseUrl: string,
  name: string,
  description: string,
  paramSchema: ZodObject<ZodRawShape>,
  requiredAuthnParams: RequiredAuthnParams = {},
  requiredAuthzTokens: string[] = [],
  authServiceTokenGetters: AuthTokenGetters = {}
) {
  const toolUrl = `${baseUrl}/api/tool/${name}/invoke`;

  const getAuthHeader = (authTokenName: string) => `${authTokenName}_token`;

  const callable = async function (
    callArguments: Record<string, unknown> = {}
  ) {
    if (
      Object.keys(requiredAuthnParams).length > 0 ||
      requiredAuthzTokens.length > 0
    ) {
      const reqAuthServices = new Set<string>();
      for (const services of Object.values(requiredAuthnParams)) {
        services.forEach(s => reqAuthServices.add(s));
      }
      requiredAuthzTokens.forEach(s => reqAuthServices.add(s));
      throw new Error(
        `One or more of the following authn services are required to invoke this tool: ${Array.from(
          reqAuthServices
        ).join(',')}`
      );
    }

    let validatedPayload: Record<string, unknown>;
    try {
      validatedPayload = paramSchema.parse(callArguments);
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

    try {
      const headers: Record<string, string> = {};
      for (const [authService, tokenGetter] of Object.entries(
        authServiceTokenGetters
      )) {
        headers[getAuthHeader(authService)] = await resolveValue(tokenGetter);
      }

      const response: AxiosResponse = await session.post(
        toolUrl,
        validatedPayload,
        {headers}
      );
      return response.data;
    } catch (error) {
      logApiError(`Error posting data to ${toolUrl}:`, error);
      throw error;
    }
  };

  callable.toolName = name;
  callable.description = description;
  callable.params = paramSchema;
  callable.getName = function () {
    return this.toolName;
  };
  callable.getDescription = function () {
    return this.description;
  };
  callable.getParamSchema = function () {
    return this.params;
  };
  callable.addAuthTokenGetters = (
    newAuthTokenGetters: AuthTokenGetters
  ): ReturnType<typeof ToolboxTool> => {
    const existingServices = Object.keys(authServiceTokenGetters);
    const incomingServices = Object.keys(newAuthTokenGetters);
    const duplicates = existingServices.filter(s =>
      incomingServices.includes(s)
    );
    if (duplicates.length > 0) {
      throw new Error(
        `Authentication source(s) \`${duplicates.join(
          ', '
        )}\` already registered in tool \`${name}\`.`
      );
    }

    const allGetters = {...authServiceTokenGetters, ...newAuthTokenGetters};
    const [
      newRequiredAuthnParams,
      newRequiredAuthzTokens,
      usedAuthTokenGetters,
    ] = identifyAuthRequirements(
      requiredAuthnParams,
      requiredAuthzTokens,
      Object.keys(newAuthTokenGetters)
    );

    const unusedAuth = incomingServices.filter(
      s => !usedAuthTokenGetters.has(s)
    );
    if (unusedAuth.length > 0) {
      throw new Error(
        `Authentication source(s) \`${unusedAuth.join(
          ', '
        )}\` unused by tool \`${name}\`.`
      );
    }
    return ToolboxTool(
      session,
      baseUrl,
      name,
      description,
      paramSchema,
      newRequiredAuthnParams,
      newRequiredAuthzTokens,
      allGetters
    );
  };

  return callable;
}

export {ToolboxTool};
