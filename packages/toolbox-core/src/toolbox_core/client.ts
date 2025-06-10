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

import {ToolboxTool} from './tool.js';
import axios from 'axios';
import {type AxiosInstance, type AxiosResponse} from 'axios';
import {ZodManifestSchema, createZodSchemaFromParams} from './protocol.js';
import {logApiError} from './errorUtils.js';
import {ZodError} from 'zod';
import {BoundParams, BoundValue} from './utils.js';

type Manifest = import('zod').infer<typeof ZodManifestSchema>;
type ToolSchemaFromManifest = Manifest['tools'][string];

/**
 * An asynchronous client for interacting with a Toolbox service.
 * Manages an Axios Client Session, if not provided.
 */
class ToolboxClient {
  #baseUrl: string;
  #session: AxiosInstance;

  /**
   * Initializes the ToolboxClient.
   * @param {string} url - The base URL for the Toolbox service API (e.g., "http://localhost:5000").
   * @param {AxiosInstance} [session] - Optional Axios instance for making HTTP
   * requests. If not provided, a new one will be created.
   */
  constructor(url: string, session?: AxiosInstance) {
    this.#baseUrl = url;
    this.#session = session || axios.create({baseURL: this.#baseUrl});
  }

  /**
   * Fetches and parses the manifest from a given API path.
   * @param {string} apiPath - The API path to fetch the manifest from (e.g., "/api/tool/mytool").
   * @returns {Promise<Manifest>} A promise that resolves to the parsed manifest.
   * @throws {Error} If there's an error fetching data or if the manifest structure is invalid.
   */
  async #fetchAndParseManifest(apiPath: string): Promise<Manifest> {
    const url = `${this.#baseUrl}${apiPath}`;
    try {
      const response: AxiosResponse = await this.#session.get(url);
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
   * @param {BoundParams} [boundParams] - A map of all candidate parameters to bind.
   * @returns {ReturnType<typeof ToolboxTool>} A ToolboxTool function.
   */
  #createToolInstance(
    toolName: string,
    toolSchema: ToolSchemaFromManifest,
    boundParams: BoundParams = {}
  ): {
    tool: ReturnType<typeof ToolboxTool>;
    usedBoundKeys: Set<string>;
  } {
    const toolParamNames = new Set(toolSchema.parameters.map(p => p.name));
    const applicableBoundParams: Record<string, BoundValue> = {};
    const usedBoundKeys = new Set<string>();

    for (const key in boundParams) {
      if (toolParamNames.has(key)) {
        applicableBoundParams[key] = boundParams[key];
        usedBoundKeys.add(key);
      }
    }

    const paramZodSchema = createZodSchemaFromParams(toolSchema.parameters);
    const tool = ToolboxTool(
      this.#session,
      this.#baseUrl,
      toolName,
      toolSchema.description,
      paramZodSchema,
      boundParams
    );
    return {tool, usedBoundKeys};
  }

  /**
   * Asynchronously loads a tool from the server.
   * Retrieves the schema for the specified tool from the Toolbox server and
   * returns a callable (`ToolboxTool`) that can be used to invoke the
   * tool remotely.
   *
   * @param {BoundParams} [boundParams] - Optional parameters to pre-bind to the tool.
   * @param {string} name - The unique name or identifier of the tool to load.
   * @returns {Promise<ReturnType<typeof ToolboxTool>>} A promise that resolves
   * to a ToolboxTool function, ready for execution.
   * @throws {Error} If the tool is not found in the manifest, the manifest structure is invalid,
   * or if there's an error fetching data from the API.
   */
  async loadTool(
    name: string,
    boundParams: BoundParams = {}
  ): Promise<ReturnType<typeof ToolboxTool>> {
    const apiPath = `/api/tool/${name}`;
    const manifest = await this.#fetchAndParseManifest(apiPath);

    if (
      manifest.tools && // Zod ensures manifest.tools exists if schema requires it
      Object.prototype.hasOwnProperty.call(manifest.tools, name)
    ) {
      const specificToolSchema = manifest.tools[name];
      const {tool, usedBoundKeys} = this.#createToolInstance(
        name,
        specificToolSchema,
        boundParams
      );

      const providedBoundKeys = Object.keys(boundParams);
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
   * @param {string | null} [name] - Name of the toolset to load. If null or undefined, loads the default toolset.
   * @param {BoundParams} [boundParams] - Optional parameters to pre-bind to the tools in the toolset.
   * @returns {Promise<Array<ReturnType<typeof ToolboxTool>>>} A promise that resolves
   * to a list of ToolboxTool functions, ready for execution.
   * @throws {Error} If the manifest structure is invalid or if there's an error fetching data from the API.
   */
  async loadToolset(
    name?: string,
    boundParams: BoundParams = {}
  ): Promise<Array<ReturnType<typeof ToolboxTool>>> {
    const toolsetName = name || '';
    const apiPath = `/api/toolset/${toolsetName}`;

    const manifest = await this.#fetchAndParseManifest(apiPath);
    const tools: Array<ReturnType<typeof ToolboxTool>> = [];

    const providedBoundKeys = new Set(Object.keys(boundParams));
    const overallUsedBoundParams: Set<string> = new Set();

    for (const [toolName, toolSchema] of Object.entries(manifest.tools)) {
      const {tool, usedBoundKeys} = this.#createToolInstance(
        toolName,
        toolSchema,
        boundParams
      );
      tools.push(tool);
      usedBoundKeys.forEach((key: string) => overallUsedBoundParams.add(key));
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
