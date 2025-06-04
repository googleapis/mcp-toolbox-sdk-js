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
import {ZodError} from 'zod';

type Manifest = import('zod').infer<typeof ZodManifestSchema>;
type ToolSchemaFromManifest = Manifest['tools'][string];

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
    this._session = session || axios.create({baseURL: this._baseUrl});
  }

  /**
   * Fetches and parses the manifest from a given API path.
   * @param {string} apiPath - The API path to fetch the manifest from (e.g., "/api/tool/mytool").
   * @returns {Promise<Manifest>} A promise that resolves to the parsed manifest.
   * @throws {Error} If there's an error fetching data or if the manifest structure is invalid.
   * @private
   */
  private async _fetchAndParseManifest(apiPath: string): Promise<Manifest> {
    const url = `${this._baseUrl}${apiPath}`;
    try {
      const response: AxiosResponse = await this._session.get(url);
      const responseData = response.data;

      try {
        const manifest = ZodManifestSchema.parse(responseData);
        return manifest;
      } catch (validationError) {
        let detailedMessage = `Invalid manifest structure received from ${url}: `;
        if (validationError instanceof ZodError) {
          const issueDetails = validationError.issues;
          detailedMessage += JSON.stringify(issueDetails, null, 2);
        } else if (validationError instanceof Error) {
          detailedMessage += validationError.message;
        } else {
          detailedMessage += 'Unknown validation error.';
        }
        throw new Error(detailedMessage);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('Invalid manifest structure received from')
      ) {
        throw error;
      }
      logApiError(`Error fetching data from ${url}:`, error);
      throw error;
    }
  }

  /**
   * Creates a ToolboxTool instance from its schema.
   * @param {string} toolName - The name of the tool.
   * @param {ToolSchemaFromManifest} toolSchema - The schema definition of the tool from the manifest.
   * @returns {ReturnType<typeof ToolboxTool>} A ToolboxTool function.
   * @private
   */
  private _createToolInstance(
    toolName: string,
    toolSchema: ToolSchemaFromManifest
  ): ReturnType<typeof ToolboxTool> {
    const paramZodSchema = createZodSchemaFromParams(toolSchema.parameters);
    return ToolboxTool(
      this._session,
      this._baseUrl,
      toolName,
      toolSchema.description,
      paramZodSchema
    );
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
    const apiPath = `/api/tool/${name}`;
    const manifest = await this._fetchAndParseManifest(apiPath);

    if (
      manifest.tools && // Zod ensures manifest.tools exists if schema requires it
      Object.prototype.hasOwnProperty.call(manifest.tools, name)
    ) {
      const specificToolSchema = manifest.tools[name];
      return this._createToolInstance(name, specificToolSchema);
    } else {
      throw new Error(`Tool "${name}" not found in manifest from ${apiPath}.`);
    }
  }

  /**
   * Asynchronously fetches a toolset and loads all tools defined within it.
   *
   * @param {string | null} [name] - Name of the toolset to load. If null or undefined, loads the default toolset.
   * @returns {Promise<Array<ReturnType<typeof ToolboxTool>>>} A promise that resolves
   * to a list of ToolboxTool functions, ready for execution.
   * @throws {Error} If the manifest structure is invalid or if there's an error fetching data from the API.
   */
  async loadToolset(
    name?: string
  ): Promise<Array<ReturnType<typeof ToolboxTool>>> {
    const toolsetName = name || '';
    const apiPath = `/api/toolset/${toolsetName}`;
    const manifest = await this._fetchAndParseManifest(apiPath);
    const tools: Array<ReturnType<typeof ToolboxTool>> = [];

    for (const [toolName, toolSchema] of Object.entries(manifest.tools)) {
      const toolInstance = this._createToolInstance(toolName, toolSchema);
      tools.push(toolInstance);
    }
    return tools;
  }
}

export {ToolboxClient};
