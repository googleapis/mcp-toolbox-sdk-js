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
import {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import {ZodManifestSchema, createZodSchemaFromParams} from './protocol.js';
import {logApiError} from './errorUtils.js';
import {ZodError} from 'zod';
import {BoundParams, identifyAuthRequirements} from './utils.js';
import {AuthTokenGetters, RequiredAuthnParams} from './tool.js';

type Manifest = import('zod').infer<typeof ZodManifestSchema>;
type ToolSchemaFromManifest = Manifest['tools'][string];

// Types for dynamic headers
export type HeaderFunction = () => string;
export type AsyncHeaderFunction = () => Promise<string>;
export type ClientHeaderProvider = HeaderFunction | AsyncHeaderFunction;
export type ClientHeadersConfig = Record<string, ClientHeaderProvider>;

/**
 * An asynchronous client for interacting with a Toolbox service.
 */
class ToolboxClient {
  private _baseUrl: string;
  private _session: AxiosInstance;
  private _clientHeaders: ClientHeadersConfig = {};
  private _headerInterceptorId: number | null = null;

  /**
   * Initializes the ToolboxClient.
   * @param {string} url - The base URL for the Toolbox service API (e.g., "http://localhost:5000").
   * @param {AxiosInstance} [session] - Optional Axios instance for making HTTP
   *   requests. If not provided, a new one will be created.
   * @param {ClientHeadersConfig} [clientHeaders] - Optional initial headers to
   *   be included in each request.
   */
  constructor(
    url: string,
    session?: AxiosInstance | null,
    clientHeaders?: ClientHeadersConfig | null
  ) {
    this._baseUrl = url;
    this._session = session || axios.create({baseURL: this._baseUrl});
    if (clientHeaders) {
      this._clientHeaders = {...clientHeaders}; // Initialize with a copy
    }
    this._applyHeaderInterceptor();
  }

  /**
   * Applies an Axios request interceptor to handle dynamic client headers.
   * The interceptor resolves header provider functions before each request sent
   * to toolbox server through this client.
   */
  private _applyHeaderInterceptor(): void {
    if (this._headerInterceptorId !== null) {
      this._session.interceptors.request.eject(this._headerInterceptorId);
    }

    this._headerInterceptorId = this._session.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        if (config.url && config.url.startsWith(this._baseUrl)) {
          config.headers = config.headers || {};
          for (const headerName in this._clientHeaders) {
            const headerProvider = this._clientHeaders[headerName];
            const result = headerProvider();
            if (result instanceof Promise) {
              config.headers[headerName] = await result;
            } else {
              config.headers[headerName] = result;
            }
          }
        }
        return config;
      },
      (error: Error) => Promise.reject(error)
    );
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
   * Add headers to be included in each request sent through this client.
   *
   * @param {ClientHeadersConfig} headers - Headers to include in each request.
   * Keys are header names, and values are functions (sync or async) that return the header string.
   * @throws {Error} If any of the header names are already registered in the client.
   */
  public addHeaders(headers: ClientHeadersConfig): void {
    const incomingHeaderKeys = Object.keys(headers);
    const existingHeaderKeys = Object.keys(this._clientHeaders);

    const duplicates = incomingHeaderKeys.filter(key =>
      existingHeaderKeys.includes(key)
    );

    if (duplicates.length > 0) {
      throw new Error(
        `Client header(s) \`${duplicates.join(', ')}\` already registered in the client.`
      );
    }

    this._clientHeaders = {...this._clientHeaders, ...headers};
  }

  /**
   * Creates a ToolboxTool instance from its schema.
   * @param {string} toolName - The name of the tool.
   * @param {ToolSchemaFromManifest} toolSchema - The schema definition of the tool from the manifest.
   * @param {BoundParams} [boundParams] - A map of all candidate parameters to bind.
   * @returns {ReturnType<typeof ToolboxTool>} A ToolboxTool function.
   * @private
   */
  private _createToolInstance(
    toolName: string,
    toolSchema: ToolSchemaFromManifest,
    authTokenGetters?: AuthTokenGetters,
    boundParams?: BoundParams
  ): {
    tool: ReturnType<typeof ToolboxTool>;
    usedAuthKeys: Set<string>;
    usedBoundKeys: Set<string>;
  } {
    const authnParamsDefinitions: RequiredAuthnParams = {};
    const actualBoundParams: BoundParams = {};

    for (const p of toolSchema.parameters) {
      if (p.authSources && p.authSources.length > 0) {
        authnParamsDefinitions[p.name] = p.authSources;
      } else if (boundParams && p.name in boundParams) {
        actualBoundParams[p.name] = boundParams[p.name];
      }
    }

    const [remainingAuthnParams, remainingAuthzTokens, usedAuthKeys] =
      identifyAuthRequirements(
        authnParamsDefinitions,
        toolSchema.authRequired || [],
        authTokenGetters ? Object.keys(authTokenGetters) : []
      );

    const paramZodSchema = createZodSchemaFromParams(toolSchema.parameters);

    const tool = ToolboxTool(
      this._session,
      this._baseUrl,
      toolName,
      toolSchema.description,
      paramZodSchema,
      actualBoundParams,
      authTokenGetters,
      remainingAuthnParams,
      remainingAuthzTokens
    );

    const usedBoundKeys = new Set(Object.keys(actualBoundParams));

    return {tool, usedAuthKeys, usedBoundKeys};
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
    authTokenGetters: AuthTokenGetters = {},
    boundParams: BoundParams = {}
  ): Promise<ReturnType<typeof ToolboxTool>> {
    const apiPath = `/api/tool/${name}`;
    const manifest = await this._fetchAndParseManifest(apiPath);

    if (
      manifest.tools &&
      Object.prototype.hasOwnProperty.call(manifest.tools, name)
    ) {
      const specificToolSchema = manifest.tools[name];
      const {tool, usedAuthKeys, usedBoundKeys} = this._createToolInstance(
        name,
        specificToolSchema,
        authTokenGetters,
        boundParams
      );

      const providedAuthKeys = new Set(Object.keys(authTokenGetters));
      const providedBoundKeys = new Set(Object.keys(boundParams));
      const unusedAuth = [...providedAuthKeys].filter(
        key => !usedAuthKeys.has(key)
      );
      const unusedBound = [...providedBoundKeys].filter(
        key => !usedBoundKeys.has(key)
      );

      const errorMessages: string[] = [];
      if (unusedAuth.length > 0) {
        errorMessages.push(`unused auth tokens: ${unusedAuth.join(', ')}`);
      }
      if (unusedBound.length > 0) {
        errorMessages.push(
          `unused bound parameters: ${unusedBound.join(', ')}`
        );
      }

      if (errorMessages.length > 0) {
        throw new Error(
          `Validation failed for tool '${name}': ${errorMessages.join('; ')}.`
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
   * @param {AuthTokenGetters} [authTokenGetters] - Optional map of auth service names to token getters.
   * @param {BoundParams} [boundParams] - Optional parameters to pre-bind to the tools in the toolset.
   * @param {boolean} [strict=false] - If true, throws an error if any provided auth token or bound param is not used by at least one tool.
   * @returns {Promise<Array<ReturnType<typeof ToolboxTool>>>} A promise that resolves
   * to a list of ToolboxTool functions, ready for execution.
   * @throws {Error} If the manifest structure is invalid or if there's an error fetching data from the API.
   */
  async loadToolset(
    name?: string,
    authTokenGetters: AuthTokenGetters = {},
    boundParams: BoundParams = {},
    strict: Boolean = false
  ): Promise<Array<ReturnType<typeof ToolboxTool>>> {
    const toolsetName = name || '';
    const apiPath = `/api/toolset/${toolsetName}`;

    const manifest = await this._fetchAndParseManifest(apiPath);
    const tools: Array<ReturnType<typeof ToolboxTool>> = [];

    const overallUsedAuthKeys: Set<string> = new Set();
    const overallUsedBoundParams: Set<string> = new Set();
    const providedAuthKeys = new Set(Object.keys(authTokenGetters));
    const providedBoundKeys = new Set(Object.keys(boundParams));

    for (const [toolName, toolSchema] of Object.entries(manifest.tools)) {
      const {tool, usedAuthKeys, usedBoundKeys} = this._createToolInstance(
        toolName,
        toolSchema,
        authTokenGetters,
        boundParams
      );
      tools.push(tool);

      if (strict) {
        const unusedAuth = [...providedAuthKeys].filter(
          key => !usedAuthKeys.has(key)
        );
        const unusedBound = [...providedBoundKeys].filter(
          key => !usedBoundKeys.has(key)
        );
        const errorMessages: string[] = [];
        if (unusedAuth.length > 0) {
          errorMessages.push(`unused auth tokens: ${unusedAuth.join(', ')}`);
        }
        if (unusedBound.length > 0) {
          errorMessages.push(
            `unused bound parameters: ${unusedBound.join(', ')}`
          );
        }
        if (errorMessages.length > 0) {
          throw new Error(
            `Validation failed for tool '${toolName}': ${errorMessages.join('; ')}.`
          );
        }
      } else {
        usedAuthKeys.forEach(key => overallUsedAuthKeys.add(key));
        usedBoundKeys.forEach(key => overallUsedBoundParams.add(key));
      }
    }

    if (!strict) {
      const unusedAuth = [...providedAuthKeys].filter(
        key => !overallUsedAuthKeys.has(key)
      );
      const unusedBound = [...providedBoundKeys].filter(
        key => !overallUsedBoundParams.has(key)
      );
      const errorMessages: string[] = [];
      if (unusedAuth.length > 0) {
        errorMessages.push(
          `unused auth tokens could not be applied to any tool: ${unusedAuth.join(', ')}`
        );
      }
      if (unusedBound.length > 0) {
        errorMessages.push(
          `unused bound parameters could not be applied to any tool: ${unusedBound.join(', ')}`
        );
      }
      if (errorMessages.length > 0) {
        throw new Error(
          `Validation failed for toolset '${name || 'default'}': ${errorMessages.join('; ')}.`
        );
      }
    }

    return tools;
  }
}

export {ToolboxClient};
