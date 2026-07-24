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
import {AxiosInstance} from 'axios';
import {ITransport} from './transport.types.js';
import {
  createZodSchemaFromParams,
  ParameterSchema,
  ZodManifestSchema,
  Protocol,
  getSupportedMcpVersions,
} from './protocol.js';
import {McpHttpTransportV20241105} from './mcp/v20241105/mcp.js';
import {McpHttpTransportV20250618} from './mcp/v20250618/mcp.js';
import {McpHttpTransportV20250326} from './mcp/v20250326/mcp.js';
import {McpHttpTransportV20251125} from './mcp/v20251125/mcp.js';
import {McpHttpTransportV20260728} from './mcp/v20260728/mcp.js';
import {ProtocolNegotiationError} from './errorUtils.js';
import {
  BoundParams,
  identifyAuthRequirements,
  resolveValue,
  warnIfHttpAndHeaders,
} from './utils.js';
import {AuthTokenGetters, RequiredAuthnParams} from './tool.js';

type Manifest = import('zod').infer<typeof ZodManifestSchema>;
type ToolSchemaFromManifest = Manifest['tools'][string];

// Types for dynamic headers
export type HeaderFunction = () => string | Promise<string>;
export type ClientHeaderProvider = string | HeaderFunction;
export type ClientHeadersConfig = Record<string, ClientHeaderProvider>;

/**
 * An asynchronous client for interacting with a Toolbox service.
 */
class ToolboxClient {
  #transport: ITransport;
  #clientHeaders: ClientHeadersConfig;
  #session: AxiosInstance | undefined;
  #baseUrl: string;
  #supportedProtocols: string[];

  /**
   * The negotiated protocol version currently in use.
   */
  get protocolVersion(): Protocol {
    return this.#transport.protocolVersion as Protocol;
  }
  /**
   * Initializes the ToolboxClient.
   * @param {string} url - The base URL for the Toolbox service API (e.g., "http://localhost:5000").
   * @param {AxiosInstance} [session] - Optional Axios instance for making HTTP
   * requests. If not provided, a new one will be created.
   * @param {ClientHeadersConfig} [clientHeaders] - Optional initial headers to
   * be included in each request.
   * @param {string} [clientName] - Optional name of the client package.
   * @param {string} [clientVersion] - Optional version of the client package.
   */
  constructor(
    url: string,
    session?: AxiosInstance | null,
    clientHeaders?: ClientHeadersConfig | null,
    protocol: Protocol | Protocol[] | string[] | string = Protocol.MCP,
    clientName?: string,
    clientVersion?: string,
  ) {
    this.#baseUrl = url;
    this.#clientHeaders = clientHeaders || {};
    this.#session = session || undefined;
    warnIfHttpAndHeaders(url, this.#clientHeaders);

    let initialProtocol: Protocol;
    if (Array.isArray(protocol)) {
      if (protocol.length === 0) {
        throw new Error('Protocol array cannot be empty');
      }

      const globalSupported = getSupportedMcpVersions();

      for (const p of protocol) {
        if (!globalSupported.includes(p as Protocol)) {
          throw new Error(
            `Invalid protocol version '${p}'. Must be one of: ${globalSupported.join(', ')}`,
          );
        }
      }

      const requestedSet = new Set<string>(protocol);
      const sorted = globalSupported.filter(globalVer =>
        requestedSet.has(globalVer),
      );

      if (sorted.length === 0) {
        throw new Error('None of the provided protocols are supported');
      }

      this.#supportedProtocols = sorted;
      initialProtocol = sorted[0] as Protocol; // Start with the highest requested version
    } else {
      initialProtocol = protocol as Protocol;
      const globalSupported = getSupportedMcpVersions();
      if (!globalSupported.includes(initialProtocol)) {
        throw new Error(`Invalid protocol version '${initialProtocol}'`);
      }
      this.#supportedProtocols = globalSupported;
    }

    this.#transport = this.#createTransportWithProtocols(
      url,
      session || undefined,
      initialProtocol,
      clientName,
      clientVersion,
    );
  }

  #createTransport(
    url: string,
    session: AxiosInstance | undefined,
    protocol: Protocol,
    clientName?: string,
    clientVersion?: string,
  ): ITransport {
    switch (protocol) {
      case Protocol.MCP_v20241105:
        return new McpHttpTransportV20241105(
          url,
          session,
          protocol,
          clientName,
          clientVersion,
        );
      case Protocol.MCP_v20250326:
        return new McpHttpTransportV20250326(
          url,
          session,
          protocol,
          clientName,
          clientVersion,
        );
      case Protocol.MCP_v20250618:
        return new McpHttpTransportV20250618(
          url,
          session,
          protocol,
          clientName,
          clientVersion,
        );
      case Protocol.MCP_v20251125:
        return new McpHttpTransportV20251125(
          url,
          session,
          protocol,
          clientName,
          clientVersion,
        );
      case Protocol.MCP_v20260728:
      case Protocol.MCP_DRAFT_2026_v1:
        return new McpHttpTransportV20260728(
          url,
          session,
          protocol,
          clientName,
          clientVersion,
        );
      default:
        throw new Error(`Unsupported MCP protocol version: ${protocol}`);
    }
  }

  #createTransportWithProtocols(
    url: string,
    session: AxiosInstance | undefined,
    protocol: Protocol,
    clientName?: string,
    clientVersion?: string,
  ): ITransport {
    const transport = this.#createTransport(
      url,
      session,
      protocol,
      clientName,
      clientVersion,
    );
    if (this.#supportedProtocols) {
      transport.supportedProtocols = this.#supportedProtocols;
    }
    return transport;
  }

  /**
   * Resolves client headers from their provider functions.
   * @returns {Promise<Record<string, string>>} A promise that resolves to the resolved headers.
   */
  async #resolveClientHeaders(): Promise<Record<string, string>> {
    const resolvedEntries = await Promise.all(
      Object.entries(this.#clientHeaders).map(async ([key, value]) => {
        const resolved = await resolveValue(value);
        return [key, String(resolved)];
      }),
    );
    return Object.fromEntries(resolvedEntries);
  }

  /**
   * Creates a ToolboxTool instance from its schema.
   * @param {string} toolName - The name of the tool.
   * @param {ToolSchemaFromManifest} toolSchema - The schema definition of the tool from the manifest.
   * @param {BoundParams} [boundParams] - A map of all candidate parameters to bind.
   * @returns {ToolboxTool} A ToolboxTool function.
   */
  #createToolInstance(
    toolName: string,
    toolSchema: ToolSchemaFromManifest,
    authTokenGetters: AuthTokenGetters = {},
    boundParams: BoundParams = {},
  ): {
    tool: ToolboxTool;
    usedAuthKeys: Set<string>;
    usedBoundKeys: Set<string>;
  } {
    const params: ParameterSchema[] = [];
    const authParams: RequiredAuthnParams = {};
    const currBoundParams: BoundParams = {};

    for (const p of toolSchema.parameters) {
      if (p.authSources && p.authSources.length > 0) {
        authParams[p.name] = p.authSources;
      } else if (boundParams && p.name in boundParams) {
        currBoundParams[p.name] = boundParams[p.name];
      } else {
        params.push(p);
      }
    }

    const [remainingAuthnParams, remainingAuthzTokens, usedAuthKeys] =
      identifyAuthRequirements(
        authParams,
        toolSchema.authRequired || [],
        authTokenGetters ? Object.keys(authTokenGetters) : [],
      );

    const paramZodSchema = createZodSchemaFromParams(params);

    const tool = ToolboxTool(
      this.#transport,
      toolName,
      toolSchema.description,
      paramZodSchema,
      authTokenGetters,
      remainingAuthnParams,
      remainingAuthzTokens,
      currBoundParams,
      this.#clientHeaders,
    );

    const usedBoundKeys = new Set(Object.keys(currBoundParams));

    return {tool, usedAuthKeys, usedBoundKeys};
  }

  async #executeWithFallback<T>(action: () => Promise<T>): Promise<T> {
    while (true) {
      try {
        return await action();
      } catch (e: unknown) {
        if (e instanceof ProtocolNegotiationError) {
          const serverVersion = e.fallbackVersion as string;
          let mutuallySupported: string[] | null = null;

          if (this.#supportedProtocols.includes(serverVersion as Protocol)) {
            mutuallySupported = [serverVersion];
          } else {
            const allVersions = getSupportedMcpVersions();
            if (allVersions.includes(serverVersion as Protocol)) {
              const idx = allVersions.indexOf(serverVersion as Protocol);
              const serverSupported = allVersions.slice(idx);
              mutuallySupported = this.#supportedProtocols.filter(v =>
                serverSupported.includes(v as Protocol),
              );
            }
          }

          if (!mutuallySupported || mutuallySupported.length === 0) {
            throw new Error('No mutually supported protocol version');
          }

          const fallbackProtocol = mutuallySupported[0] as Protocol;
          if (fallbackProtocol === this.#transport.protocolVersion) {
            throw e;
          }

          this.#transport = this.#createTransportWithProtocols(
            this.#baseUrl,
            this.#session,
            fallbackProtocol,
          );
        } else {
          throw e;
        }
      }
    }
  }

  /**
   * Asynchronously loads a tool from the server.
   * Retrieves the schema for the specified tool from the Toolbox server and
   * returns a callable (`ToolboxTool`) that can be used to invoke the
   * tool remotely.
   *
   * @param {string} name - The unique name or identifier of the tool to load.
   * @param {AuthTokenGetters | null} [authTokenGetters] - Optional map of auth service names to token getters.
   * @param {BoundParams | null} [boundParams] - Optional parameters to pre-bind to the tool.
   * @returns {Promise<ToolboxTool>} A promise that resolves
   * to a ToolboxTool function, ready for execution.
   * @throws {Error} If the tool is not found in the manifest, the manifest structure is invalid,
   * or if there's an error fetching data from the API.
   */
  async loadTool(
    name: string,
    authTokenGetters: AuthTokenGetters | null = {},
    boundParams: BoundParams | null = {},
  ): Promise<ToolboxTool> {
    warnIfHttpAndHeaders(this.#transport.baseUrl, authTokenGetters);
    const headers = await this.#resolveClientHeaders();
    const manifest = await this.#executeWithFallback(() =>
      this.#transport.toolGet(name, headers),
    );

    if (
      manifest.tools &&
      Object.prototype.hasOwnProperty.call(manifest.tools, name)
    ) {
      const specificToolSchema = manifest.tools[name];
      const {tool, usedAuthKeys, usedBoundKeys} = this.#createToolInstance(
        name,
        specificToolSchema,
        authTokenGetters || undefined,
        boundParams || {},
      );

      const providedAuthKeys = new Set(
        authTokenGetters ? Object.keys(authTokenGetters) : [],
      );
      const providedBoundKeys = new Set(
        boundParams ? Object.keys(boundParams) : [],
      );
      const unusedAuth = [...providedAuthKeys].filter(
        key => !usedAuthKeys.has(key),
      );
      const unusedBound = [...providedBoundKeys].filter(
        key => !usedBoundKeys.has(key),
      );

      const errorMessages: string[] = [];
      if (unusedAuth.length > 0) {
        errorMessages.push(`unused auth tokens: ${unusedAuth.join(', ')}`);
      }
      if (unusedBound.length > 0) {
        errorMessages.push(
          `unused bound parameters: ${unusedBound.join(', ')}`,
        );
      }

      if (errorMessages.length > 0) {
        throw new Error(
          `Validation failed for tool '${name}': ${errorMessages.join('; ')}.`,
        );
      }
      return tool;
    } else {
      throw new Error(
        `Tool "${name}" not found in manifest from ${this.#transport.baseUrl}/api/tool/${name}.`,
      );
    }
  }

  /**
   * Asynchronously fetches a toolset and loads all tools defined within it.
   *
   * @param {string | null} [name] - Name of the toolset to load. If null or undefined, loads the default toolset.
   * @param {AuthTokenGetters | null} [authTokenGetters] - Optional map of auth service names to token getters.
   * @param {BoundParams | null} [boundParams] - Optional parameters to pre-bind to the tools in the toolset.
   * @param {boolean} [strict=false] - If true, throws an error if any provided auth token or bound param is not used by at least one tool.
   * @returns {Promise<ToolboxTool[]>} A promise that resolves
   * to a list of ToolboxTool functions, ready for execution.
   * @throws {Error} If the manifest structure is invalid or if there's an error fetching data from the API.
   */
  async loadToolset(
    name?: string,
    authTokenGetters: AuthTokenGetters | null = {},
    boundParams: BoundParams | null = {},
    strict = false,
  ): Promise<ToolboxTool[]> {
    warnIfHttpAndHeaders(this.#transport.baseUrl, authTokenGetters);
    const toolsetName = name || '';
    const headers = await this.#resolveClientHeaders();

    const manifest = await this.#executeWithFallback(() =>
      this.#transport.toolsList(toolsetName, headers),
    );
    const tools: ToolboxTool[] = [];

    const overallUsedAuthKeys: Set<string> = new Set();
    const overallUsedBoundParams: Set<string> = new Set();
    const providedAuthKeys = new Set(
      authTokenGetters ? Object.keys(authTokenGetters) : [],
    );
    const providedBoundKeys = new Set(
      boundParams ? Object.keys(boundParams) : [],
    );

    for (const [toolName, toolSchema] of Object.entries(manifest.tools)) {
      const {tool, usedAuthKeys, usedBoundKeys} = this.#createToolInstance(
        toolName,
        toolSchema,
        authTokenGetters || {},
        boundParams || {},
      );
      tools.push(tool);

      if (strict) {
        const unusedAuth = [...providedAuthKeys].filter(
          key => !usedAuthKeys.has(key),
        );
        const unusedBound = [...providedBoundKeys].filter(
          key => !usedBoundKeys.has(key),
        );
        const errorMessages: string[] = [];
        if (unusedAuth.length > 0) {
          errorMessages.push(`unused auth tokens: ${unusedAuth.join(', ')}`);
        }
        if (unusedBound.length > 0) {
          errorMessages.push(
            `unused bound parameters: ${unusedBound.join(', ')}`,
          );
        }
        if (errorMessages.length > 0) {
          throw new Error(
            `Validation failed for tool '${toolName}': ${errorMessages.join('; ')}.`,
          );
        }
      } else {
        usedAuthKeys.forEach(key => overallUsedAuthKeys.add(key));
        usedBoundKeys.forEach(key => overallUsedBoundParams.add(key));
      }
    }

    if (!strict) {
      const unusedAuth = [...providedAuthKeys].filter(
        key => !overallUsedAuthKeys.has(key),
      );
      const unusedBound = [...providedBoundKeys].filter(
        key => !overallUsedBoundParams.has(key),
      );
      const errorMessages: string[] = [];
      if (unusedAuth.length > 0) {
        errorMessages.push(
          `unused auth tokens could not be applied to any tool: ${unusedAuth.join(', ')}`,
        );
      }
      if (unusedBound.length > 0) {
        errorMessages.push(
          `unused bound parameters could not be applied to any tool: ${unusedBound.join(', ')}`,
        );
      }
      if (errorMessages.length > 0) {
        throw new Error(
          `Validation failed for toolset '${name || 'default'}': ${errorMessages.join('; ')}.`,
        );
      }
    }

    return tools;
  }
}

export {ToolboxClient};
