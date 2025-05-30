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

import {ToolboxTool, CallableTool} from './tool';
import axios from 'axios';
import {type AxiosInstance, type AxiosResponse} from 'axios';
import {
  ZodManifestSchema,
  createZodSchemaFromParams,
  ParameterSchema,
} from './protocol';
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
   * Creates a ToolboxTool instance from its schema, applying only the relevant bound parameters.
   * @param {string} toolName - The name of the tool.
   * @param {ToolSchemaFromManifest} toolSchema - The schema definition of the tool.
   * @param {Record<string, unknown>} [allBoundParams] - A map of all candidate parameters to bind.
   * @returns {{tool: CallableTool, usedBoundKeys: Set<string>}} An object containing the
   * configured tool and a set of the bound parameter keys that were used.
   * @private
   */
  private _createToolInstance(
    toolName: string,
    toolSchema: ToolSchemaFromManifest,
    allBoundParams?: Record<string, unknown>
  ): {tool: CallableTool; usedBoundKeys: Set<string>} {
    const toolParamNames = new Set(
      toolSchema.parameters.map((p: ParameterSchema) => p.name)
    );
    const applicableBoundParams: Record<string, unknown> = {};
    const usedBoundKeys = new Set<string>();

    if (allBoundParams) {
      for (const key in allBoundParams) {
        if (
          Object.prototype.hasOwnProperty.call(allBoundParams, key) &&
          toolParamNames.has(key)
        ) {
          applicableBoundParams[key] = allBoundParams[key];
          usedBoundKeys.add(key);
        }
      }
    }

    const paramZodSchema = createZodSchemaFromParams(toolSchema.parameters);
    const tool = ToolboxTool(
      this._session,
      this._baseUrl,
      toolName,
      toolSchema.description,
      paramZodSchema,
      applicableBoundParams
    );

    return {tool, usedBoundKeys};
  }

  /**
   * Asynchronously loads a tool from the server.
   * Retrieves the schema for the specified tool from the Toolbox server and
   * returns a callable (`ToolboxTool`) that can be used to invoke the
   * tool remotely.
   *
   * @param {string} name - The unique name or identifier of the tool to load.
   * @param {Record<string, unknown>} [boundParams] - An optional mapping of parameter names to bind to specific values.
   * @returns {Promise<CallableTool>} A promise that resolves
   * to a ToolboxTool function, ready for execution.
   * @throws {Error} If the tool is not found, validation fails, or the API request fails.
   */
  async loadTool(
    name: string,
    boundParams?: Record<string, unknown>
  ): Promise<CallableTool> {
    const finalBoundParams = boundParams || {};
    const apiPath = `/api/tool/${name}`;
    const manifest = await this._fetchAndParseManifest(apiPath);

    if (
      manifest.tools &&
      Object.prototype.hasOwnProperty.call(manifest.tools, name)
    ) {
      const specificToolSchema = manifest.tools[name];
      const {tool, usedBoundKeys} = this._createToolInstance(
        name,
        specificToolSchema,
        finalBoundParams
      );

      const providedBoundKeys = Object.keys(finalBoundParams);
      const unusedBound = providedBoundKeys.filter(
        key => !usedBoundKeys.has(key)
      );

      if (unusedBound.length > 0) {
        throw new Error(
          `Validation failed for tool '${name}': unused bound parameters: ${unusedBound.join(', ')}.`
        );
      }
      return tool;
    } else {
      throw new Error(`Tool "${name}" not found in manifest from ${apiPath}.`);
    }
  }

  /**
   * Asynchronously fetches a toolset and loads all tools defined within it.
   *
   * @param {string} [name] - Name of the toolset to load. If null or undefined, loads the default toolset.
   * @param {Record<string, unknown>} [boundParams] - An optional mapping of parameter names to bind to specific values.
   * These parameters will be bound to any tool in the set that defines them.
   * @returns {Promise<Array<CallableTool>>} A promise that resolves
   * to a list of ToolboxTool functions, ready for execution.
   * @throws {Error} If validation fails or the API request fails.
   */
  async loadToolset(
    name?: string,
    boundParams?: Record<string, unknown>
  ): Promise<Array<CallableTool>> {
    const finalBoundParams = boundParams || {};
    const toolsetName = name || '';
    const apiPath = `/api/toolset/${toolsetName}`;
    const manifest = await this._fetchAndParseManifest(apiPath);
    const tools: Array<CallableTool> = [];

    const providedBoundKeys = new Set(Object.keys(finalBoundParams));
    const overallUsedBoundParams: Set<string> = new Set();

    for (const [toolName, toolSchema] of Object.entries(manifest.tools)) {
      const {tool, usedBoundKeys} = this._createToolInstance(
        toolName,
        toolSchema,
        finalBoundParams
      );
      tools.push(tool);
      usedBoundKeys.forEach(key => overallUsedBoundParams.add(key));
    }

    const unusedBound = [...providedBoundKeys].filter(
      k => !overallUsedBoundParams.has(k)
    );
    if (unusedBound.length > 0) {
      throw new Error(
        `Validation failed for toolset '${
          name || 'default'
        }': unused bound parameters could not be applied to any tool: ${unusedBound.join(', ')}.`
      );
    }

    return tools;
  }
}

export {ToolboxClient};