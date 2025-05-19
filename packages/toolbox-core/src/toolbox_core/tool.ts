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

import {ZodObject, ZodError} from 'zod';
import {AxiosInstance, AxiosResponse} from 'axios';

function ToolboxTool(
  session: AxiosInstance,
  baseUrl: string,
  name: string,
  description: string,
  paramSchema: ZodObject<any>
) {
  const toolUrl = `${baseUrl}/api/tool/${name}/invoke`;

  const callable = async function (callArguments: Record<string, any> = {}) {
    let validatedPayload: Record<string, any>;
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
      console.error(
        `Error posting data to ${toolUrl}:`,
        (error as any).response?.data || (error as any).message
      );
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
