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
import {BoundParams, BoundValue, resolveValue} from './utils.js';

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
 * @returns {CallableTool & CallableToolProperties} An async function that, when
 * called, invokes the tool with the provided arguments. Validates arguments
 * against the tool's signature, then sends them
 * as a JSON payload in a POST request to the tool's invoke URL.
 */

function ToolboxTool(
  session: AxiosInstance,
  baseUrl: string,
  name: string,
  description: string,
  paramSchema: ZodObject<ZodRawShape>,
  boundParams: BoundParams = {}
) {
  const toolUrl = `${baseUrl}/api/tool/${name}/invoke`;
  const boundKeys = Object.keys(boundParams);
  const userParamSchema = paramSchema.omit(
    Object.fromEntries(boundKeys.map(k => [k, true]))
  );

  const callable = async function (
    callArguments: Record<string, unknown> = {}
  ) {
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

    // Resolve any bound parameters that are functions.
    const resolvedEntries = await Promise.all(
      Object.entries(boundParams).map(async ([key, value]) => {
        const resolved = await resolveValue(value);
        return [key, resolved];
      })
    );
    const resolvedBoundParams = Object.fromEntries(resolvedEntries);
    const payload = {...validatedUserArgs, ...resolvedBoundParams};
    try {
      const response: AxiosResponse = await session.post(toolUrl, payload);
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

  callable.getName = function () {
    return this.toolName;
  };
  callable.getDescription = function () {
    return this.description;
  };
  callable.getParamSchema = function () {
    return this.params;
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
      newBoundParams
    );
  };

  callable.bindParam = function (paramName: string, paramValue: BoundValue) {
    return this.bindParams({[paramName]: paramValue});
  };
  return callable;
}

export {ToolboxTool};
