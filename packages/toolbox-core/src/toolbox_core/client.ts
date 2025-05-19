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

import {ToolboxTool} from './tool';
import axios from 'axios';
import type {AxiosInstance, AxiosResponse} from 'axios';
import {
  ZodManifestSchema,
  createZodObjectSchemaFromParameters,
} from './protocol';

class ToolboxClient {
  /** @private */ private _baseUrl: string;
  /** @private */ private _session: AxiosInstance;

  /**
   * @param {string} url - The base URL for the Toolbox service API.
   */
  constructor(url: string, session?: AxiosInstance) {
    this._baseUrl = url;
    this._session = session || axios.create({baseURL: url});
  }

  /**
   * @param {string} toolName - Name of the tool.
   * @returns {ToolboxTool} - A ToolboxTool instance.
   */
  async loadTool(toolName: string): Promise<ReturnType<typeof ToolboxTool>> {
    const url = `${this._baseUrl}/api/tool/${toolName}`;
    try {
      const response: AxiosResponse = await this._session.get(url);
      const responseData = response.data;

      const manifestResponse = ZodManifestSchema.safeParse(responseData);
      if (manifestResponse.success) {
        const manifest = manifestResponse.data;
        if (
          manifest.tools &&
          Object.prototype.hasOwnProperty.call(manifest.tools, toolName)
        ) {
          const specificToolSchema = manifest.tools[toolName];
          const paramZodSchema = createZodObjectSchemaFromParameters(
            specificToolSchema.parameters
          );
          return ToolboxTool(
            this._session,
            this._baseUrl,
            toolName,
            specificToolSchema.description,
            paramZodSchema
          );
        } else {
          throw new Error(`Tool "${toolName}" not found in manifest.`);
        }
      } else {
        throw new Error(
          `Invalid manifest structure received: ${manifestResponse.error.message}`
        );
      }
    } catch (error) {
      console.error(
        `Error fetching data from ${url}:`,
        (error as any).response?.data || (error as any).message
      );
      throw error;
    }
  }
}

export {ToolboxClient};