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
import {logApiError} from './errorUtils';
import {resolveValue, BoundParams, BoundValue} from './utils';

export interface CallableTool {
  (callArguments?: Record<string, unknown>): Promise<any>;
  toolName: string;
  description: string;
  params: ZodObject<ZodRawShape>;
  boundParams: Readonly<BoundParams>;
  getName(): string;
  getDescription(): string;
  getParamSchema(): ZodObject<ZodRawShape>;
  /**
   * Binds parameters to values or functions that produce values.
   * @param {BoundParams} paramsToBind - A mapping of parameter names to values.
   * @returns {CallableTool} A new ToolboxTool instance with the specified parameters bound.
   * @throws {Error} If a parameter is already bound or is not defined by the tool's definition.
   */
  bindParams(paramsToBind: BoundParams): CallableTool;
  /**
   * Binds a single parameter to a value or a function that produces a value.
   * @param {string} paramName - The name of the parameter to bind.
   * @param {BoundValue} paramValue - The value to bind to the parameter.
   * @returns {CallableTool} A new ToolboxTool instance with the specified parameter bound.
   * @throws {Error} If the parameter is already bound or is not defined by the tool's definition.
   */
  bindParam(paramName: string, paramValue: BoundValue): CallableTool;
}

/**
 * Creates a callable tool function representing a specific tool on a remote
 * Toolbox server.
 *
 * @param {AxiosInstance} session - The Axios session for making HTTP requests.
 * @param {string} baseUrl - The base URL of the Toolbox Server API.
 * @param {string} name - The name of the remote tool.
 * @param {string} description - A description of the remote tool.
 * @param {ZodObject<any>} originalParamSchema - The Zod schema for validating the tool's parameters.
 * @param {Record<string, unknown>} [boundParams={}] - A map of already bound parameters.
 * @returns {CallableTool} An async function to invoke the tool.
 */

function ToolboxTool(
  session: AxiosInstance,
  baseUrl: string,
  name: string,
  description: string,
  originalParamSchema: ZodObject<ZodRawShape>,
  boundParams: BoundParams = {}
): CallableTool {
  const toolUrl = `${baseUrl}/api/tool/${name}/invoke`;

  const boundKeys = Object.keys(boundParams);
  const userParamSchema = originalParamSchema.omit(
    Object.fromEntries(boundKeys.map(k => [k, true]))
  );

  const callable = async function (
    callArguments: Record<string, unknown> = {}
  ): Promise<any> {
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

    // Merge the user-provided arguments with the resolved bound parameters to create the final payload.
    const payload = {...validatedUserArgs, ...resolvedBoundParams};

    try {
      const response: AxiosResponse = await session.post(toolUrl, payload);
      return response.data;
    } catch (error) {
      logApiError(`Error posting data to ${toolUrl}:`, error);
      throw error;
    }
  };
  
  const tool = callable as CallableTool;

  tool.toolName = name;
  tool.description = description;
  tool.params = originalParamSchema;
  tool.boundParams = Object.freeze({...boundParams});

  tool.getName = function () {
    return this.toolName;
  };
  tool.getDescription = function () {
    return this.description;
  };
  tool.getParamSchema = function () {
    return this.params;
  };

  tool.bindParams = function (paramsToBind: BoundParams): CallableTool {
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

  tool.bindParam = function (
    paramName: string,
    paramValue: BoundValue
  ): CallableTool {
    return this.bindParams({[paramName]: paramValue});
  };

  return tool;
}

export {ToolboxTool};