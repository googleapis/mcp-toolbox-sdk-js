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
import {
  ZodManifestSchema,
  createZodSchemaFromParams,
  ParameterSchema,
} from './protocol.js';
import {logApiError} from './errorUtils.js';
import {ZodError} from 'zod';
import {identifyAuthRequirements} from './utils.js';

type Manifest = import('zod').infer<typeof ZodManifestSchema>;
type ToolSchemaFromManifest = Manifest['tools'][string];
type AuthTokenGetter = () => string | Promise<string>;
type AuthTokenGetters = Record<string, AuthTokenGetter>;

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
   * @param {AuthTokenGetters} [authTokenGetters] - Optional map of auth token getters.
   * @returns {ReturnType<typeof ToolboxTool>} A ToolboxTool function.
   * @private
   */
  private _createToolInstance(
    toolName: string,
    toolSchema: ToolSchemaFromManifest,
    authTokenGetters: AuthTokenGetters = {}
  ): [ReturnType<typeof ToolboxTool>, Set<string>] {
    const params: ParameterSchema[] = [];
    const authnParams: Record<string, string[]> = {};
    for (const p of toolSchema.parameters) {
      if (p.authSources) {
        authnParams[p.name] = p.authSources;
      } else {
        params.push(p);
      }
    }

    const [requiredAuthnParams, requiredAuthzTokens, usedAuthKeys] =
      identifyAuthRequirements(
        authnParams,
        toolSchema.authRequired || [],
        Object.keys(authTokenGetters)
      );

    const paramZodSchema = createZodSchemaFromParams(params);
    const tool = ToolboxTool(
      this._session,
      this._baseUrl,
      toolName,
      toolSchema.description,
      paramZodSchema,
      requiredAuthnParams,
      requiredAuthzTokens,
      authTokenGetters
    );

    return [tool, usedAuthKeys];
  }

  /**
   * Asynchronously loads a tool from the server.
   * @param {string} name - The unique name or identifier of the tool to load.
   * @param {AuthTokenGetters} [authTokenGetters] - Optional map of auth token getters.
   * @returns {Promise<ReturnType<typeof ToolboxTool>>} A promise that resolves to a ToolboxTool function.
   * @throws {Error} If the tool is not found, manifest is invalid, or on fetch error.
   */
  async loadTool(
    name: string,
    authTokenGetters: AuthTokenGetters = {}
  ): Promise<ReturnType<typeof ToolboxTool>> {
    const apiPath = `/api/tool/${name}`;
    const manifest = await this._fetchAndParseManifest(apiPath);

    if (
      !manifest.tools ||
      !Object.prototype.hasOwnProperty.call(manifest.tools, name)
    ) {
      throw new Error(`Tool "${name}" not found in manifest from ${apiPath}.`);
    }

    const specificToolSchema = manifest.tools[name];
    const [tool, usedAuthKeys] = this._createToolInstance(
      name,
      specificToolSchema,
      authTokenGetters
    );

    const providedAuthKeys = Object.keys(authTokenGetters);
    const unusedAuth = providedAuthKeys.filter(k => !usedAuthKeys.has(k));

    if (unusedAuth.length > 0) {
      throw new Error(
        `Validation failed for tool '${name}': unused auth tokens: ${unusedAuth.join(', ')}.`
      );
    }

    return tool;
  }

  /**
   * Asynchronously fetches a toolset and loads all tools defined within it.
   * @param {string | null} [name] - Name of the toolset to load. If null or undefined, loads the default toolset.
   * @param {AuthTokenGetters} [authTokenGetters] - Optional map of auth token getters.
   * @returns {Promise<Array<ReturnType<typeof ToolboxTool>>>} A promise that resolves to a list of ToolboxTool functions.
   * @throws {Error} If the manifest is invalid or on fetch error.
   */
  async loadToolset(
    name?: string,
    authTokenGetters: AuthTokenGetters = {}
  ): Promise<Array<ReturnType<typeof ToolboxTool>>> {
    const toolsetName = name || '';
    const apiPath = `/api/toolset/${toolsetName}`;
    const manifest = await this._fetchAndParseManifest(apiPath);
    const tools: Array<ReturnType<typeof ToolboxTool>> = [];
    const overallUsedAuthKeys = new Set<string>();

    for (const [toolName, toolSchema] of Object.entries(manifest.tools)) {
      const [toolInstance, usedAuthKeys] = this._createToolInstance(
        toolName,
        toolSchema,
        authTokenGetters
      );
      tools.push(toolInstance);
      usedAuthKeys.forEach(key => overallUsedAuthKeys.add(key));
    }

    const providedAuthKeys = Object.keys(authTokenGetters);
    const unusedAuth = providedAuthKeys.filter(
      k => !overallUsedAuthKeys.has(k)
    );

    if (unusedAuth.length > 0) {
      throw new Error(
        `Validation failed for toolset '${
          toolsetName || 'default'
        }': unused auth tokens could not be applied to any tool: ${unusedAuth.join(', ')}.`
      );
    }
    return tools;
  }
}

export {ToolboxClient};
