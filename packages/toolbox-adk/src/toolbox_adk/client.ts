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

import {
  ToolboxClient as CoreToolboxClient,
  AuthTokenGetters,
  BoundParams,
  ClientHeadersConfig,
  Protocol,
} from '@toolbox-sdk/core';
import {ToolboxTool, CoreTool} from './tool.js';
import type {AxiosInstance} from 'axios';
import {VERSION} from './version.js';

/**
 * An asynchronous client for interacting with a Toolbox service, specifically
 * designed to work with the Google ADK.
 *
 * This client mirrors the interface of the core ToolboxClient but returns
 * ADK-compatible `ToolboxTool` instances that can be used directly in an
 * ADK Agent.
 */
export class ToolboxClient {
  private readonly coreClient: CoreToolboxClient;

  /**
   * Initializes the ADK ToolboxClient.
   * @param {string} url - The base URL for the Toolbox service API (e.g., "http://localhost:5000").
   * @param {AxiosInstance} [session] - Optional Axios instance for making HTTP
   * requests. If not provided, a new one will be created.
   * @param {ClientHeadersConfig} [clientHeaders] - Optional initial headers to
   * be included in each request.
   */
  constructor(
    url: string,
    session?: AxiosInstance | null,
    clientHeaders?: ClientHeadersConfig | null,
    protocol: Protocol = Protocol.MCP,
  ) {
    this.coreClient = new CoreToolboxClient(
      url,
      session,
      clientHeaders,
      protocol,
      'toolbox-adk-js',
      VERSION,
    );
  }

  /**
   * Asynchronously loads a tool from the server.
   *
   * Retrieves the schema for the specified tool and returns an ADK-compatible
   * `ToolboxTool` adapter instance, ready to be used in an ADK Agent.
   *
   * @param {string} name - The unique name or identifier of the tool to load.
   * @param {AuthTokenGetters | null} [authTokenGetters] - Optional map of auth service names to token getters.
   * @param {BoundParams | null} [boundParams] - Optional parameters to pre-bind to the tool.
   * @returns {Promise<ToolboxTool>} A promise that resolves to an ADK ToolboxTool,
   * ready for execution.
   */
  async loadTool(
    name: string,
    authTokenGetters: AuthTokenGetters | null = {},
    boundParams: BoundParams | null = {},
  ): Promise<ToolboxTool> {
    const coreTool: CoreTool = await this.coreClient.loadTool(
      name,
      authTokenGetters,
      boundParams,
    );
    return new ToolboxTool(coreTool);
  }

  /**
   * Asynchronously fetches a toolset and loads all tools defined within it.
   *
   * @param {string | null} [name] - Name of the toolset to load. If null or undefined, loads the default toolset.
   * @param {AuthTokenGetters | null} [authTokenGetters] - Optional map of auth service names to token getters.
   * @param {BoundParams | null} [boundParams] - Optional parameters to pre-bind to the tools in the toolset.
   * @param {boolean} [strict=false] - If true, throws an error if any provided auth token or bound param is not used by at least one tool.
   * @returns {Promise<Array<ToolboxTool>>} A promise that resolves to a list of
   * ADK ToolboxTool instances, ready for execution.
   */
  async loadToolset(
    name?: string,
    authTokenGetters: AuthTokenGetters | null = {},
    boundParams: BoundParams | null = {},
    strict = false,
  ): Promise<Array<ToolboxTool>> {
    const coreTools: CoreTool[] = await this.coreClient.loadToolset(
      name,
      authTokenGetters,
      boundParams,
      strict,
    );
    return coreTools.map(coreTool => new ToolboxTool(coreTool));
  }
}
