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

/**
 * Creates a callable tool function representing a specific tool on a remote
 * Toolbox server.
 *
 * @param {AxiosInstance} session - The Axios session for making HTTP requests.
 * @param {string} baseUrl - The base URL of the Toolbox Server API.
 * @param {string} name - The name of the remote tool.
 * @param {string} description - A description of the remote tool.
 * @param {ZodObject<any>} paramSchema - The Zod schema for validating the tool's parameters.
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
  paramSchema: ZodObject<ZodRawShape>
) {
  const toolUrl = `${baseUrl}/api/tool/${name}/invoke`;

  const callable = async function (callArguments: Record<string, unknown> = {}) {
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
      const response: AxiosResponse = await session.post(
        toolUrl,
        validatedPayload
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
  return callable;
}

export {ToolboxTool};
