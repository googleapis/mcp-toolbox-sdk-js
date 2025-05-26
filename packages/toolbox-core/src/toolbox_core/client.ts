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
import {type AxiosInstance, type AxiosResponse} from 'axios';
import {ZodManifestSchema, createZodSchemaFromParams} from './protocol';
import {logApiError} from './errorUtils';

/**
 * An asynchronous client for interacting with a Toolbox service.
 * Manages an Axios Client Session, if not provided.
 */
class ToolboxClient {
  private _baseUrl: string;
  private _session: AxiosInstance;

  /**
   * Initializes the ToolboxClient.
   * @param {string} url - The base URL for the Toolbox service API (e.g., "http://localhost:5000").
   * @param {AxiosInstance} [session] - Optional Axios instance for making HTTP
   * requests. If not provided, a new one will be created.
   */
  constructor(url: string, session?: AxiosInstance) {
    this._baseUrl = url;
    this._session = session || axios.create({baseURL: url});
  }

  /**
   * Asynchronously loads a tool from the server.
   * Retrieves the schema for the specified tool from the Toolbox server and
   * returns a callable (`ToolboxTool`) that can be used to invoke the
   * tool remotely.
   *
   * @param {string} name - The unique name or identifier of the tool to load.
   * @returns {Promise<ReturnType<typeof ToolboxTool>>} A promise that resolves
   * to a ToolboxTool function, ready for execution.
   * @throws {Error} If the tool is not found in the manifest, the manifest structure is invalid,
   * or if there's an error fetching data from the API.
   */
  async loadTool(name: string): Promise<ReturnType<typeof ToolboxTool>> {
    const url = `${this._baseUrl}/api/tool/${name}`;
    try {
      const response: AxiosResponse = await this._session.get(url);
      const responseData = response.data;

      try {
        const manifest = ZodManifestSchema.parse(responseData);
        if (
          manifest.tools &&
          Object.prototype.hasOwnProperty.call(manifest.tools, name)
        ) {
          const specificToolSchema = manifest.tools[name];
          const paramZodSchema = createZodSchemaFromParams(
            specificToolSchema.parameters
          );
          return ToolboxTool(
            this._session,
            this._baseUrl,
            name,
            specificToolSchema.description,
            paramZodSchema
          );
        } else {
          throw new Error(`Tool "${name}" not found in manifest.`);
        }
      } catch (validationError) {
        if (validationError instanceof Error) {
          throw new Error(
            `Invalid manifest structure received: ${validationError.message}`
          );
        }
        throw new Error(
          'Invalid manifest structure received: Unknown validation error.'
        );
      }
    } catch (error) {
      logApiError(`Error fetching data from ${url}:`, error);
      throw error;
    }
  }
}

export {ToolboxClient};
