// Copyright 2026 Google LLC
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

import {AxiosError} from 'axios';
import {McpHttpTransportBase} from '../transportBase.js';
import * as types from './types.js';

import {ZodManifest} from '../../protocol.js';
import {logApiError} from '../../errorUtils.js';
import {warnIfHttpAndHeaders} from '../../utils.js';

import {v4 as uuidv4} from 'uuid';
import {VERSION} from '../../version.js';

export class McpHttpTransportV20251125 extends McpHttpTransportBase {
  async #sendRequest<T>(
    url: string,
    request: types.MCPRequest<T> | types.MCPNotification,
    paramsOverride?: unknown,
    headers?: Record<string, string>,
  ): Promise<T | null> {
    const params = paramsOverride || request.params;
    let payload: types.JSONRPCRequest | types.JSONRPCNotification;

    const isNotification = !('getResultModel' in request);
    const method = request.method;

    if (isNotification) {
      payload = {
        jsonrpc: '2.0',
        method,
        params: params as Record<string, unknown>,
      };
    } else {
      payload = {
        jsonrpc: '2.0',
        id: uuidv4(),
        method,
        params: params as Record<string, unknown>,
      };
    }

    // Inject Protocol Version into headers (v2025-06-18 specific)
    const reqHeaders = {...(headers || {})};
    reqHeaders['MCP-Protocol-Version'] = this._protocolVersion;

    try {
      const response = await this._session.post(url, payload, {
        headers: reqHeaders,
      });

      if (
        response.status !== 200 &&
        response.status !== 204 &&
        response.status !== 202
      ) {
        const errorText = JSON.stringify(response.data);
        throw new Error(
          `API request failed with status ${response.status} (${response.statusText}). Server response: ${errorText}`,
        );
      }

      if (response.status === 204 || response.status === 202) {
        return null;
      }

      const jsonResp = response.data;

      if (jsonResp.error) {
        const errResult = types.JSONRPCErrorSchema.safeParse(jsonResp);
        let message = `MCP request failed: ${JSON.stringify(jsonResp.error)}`;
        let code = 'MCP_ERROR';

        if (errResult.success) {
          const err = errResult.data.error;
          message = `MCP request failed with code ${err.code}: ${err.message}`;
          code = String(err.code);
        }

        throw new AxiosError(
          message,
          code,
          response.config,
          response.request,
          response,
        );
      }

      // Parse Result
      if (!isNotification && 'getResultModel' in request) {
        const rpcRespResult = types.JSONRPCResponseSchema.safeParse(jsonResp);
        if (rpcRespResult.success) {
          const resultModel = request.getResultModel();
          return resultModel.parse(rpcRespResult.data.result);
        }
        throw new Error('Failed to parse JSON-RPC response structure');
      }

      return null;
    } catch (error) {
      logApiError(`Error posting data to ${url}:`, error);
      throw error;
    }
  }

  protected async initializeSession(
    headers?: Record<string, string>,
  ): Promise<void> {
    const params: types.InitializeRequestParams = {
      protocolVersion: this._protocolVersion,
      capabilities: {},
      clientInfo: {
        name: this._clientName || 'toolbox-core-js',
        version: this._clientVersion || VERSION,
      },
    };

    const result = await this.#sendRequest(
      this._mcpBaseUrl,
      types.InitializeRequest,
      params,
      headers,
    );

    if (!result) {
      const error = new Error('Initialization failed: No response');
      logApiError('MCP Initialization Error', error);
      throw error;
    }

    this._serverVersion = result.serverInfo.version;

    if (result.protocolVersion !== this._protocolVersion) {
      const error = new Error(
        `MCP version mismatch: client does not support server version ${result.protocolVersion}`,
      );
      logApiError('MCP Initialization Error', error);
      throw error;
    }

    if (!result.capabilities.tools) {
      const error = new Error(
        "Server does not support the 'tools' capability.",
      );
      logApiError('MCP Initialization Error', error);
      throw error;
    }

    await this.#sendRequest(
      this._mcpBaseUrl,
      types.InitializedNotification,
      {},
      headers,
    );
  }

  async toolsList(
    toolsetName?: string,
    headers?: Record<string, string>,
  ): Promise<ZodManifest> {
    await this.ensureInitialized(headers);
    const url = `${this._mcpBaseUrl}${toolsetName || ''}`;

    const result = await this.#sendRequest(
      url,
      types.ListToolsRequest,
      {},
      headers,
    );

    if (!result) {
      const error = new Error('Failed to list tools: No response from server.');
      logApiError(`Error listing tools from ${url}`, error);
      throw error;
    }

    if (this._serverVersion === null) {
      const error = new Error('Server version not available.');
      logApiError('Error listing tools', error);
      throw error;
    }

    const toolsMap: Record<
      string,
      {
        description: string;
        parameters: import('../../protocol.js').ParameterSchema[];
        authRequired?: string[];
      }
    > = {};

    for (const tool of result.tools) {
      toolsMap[tool.name] = this.convertToolSchema(tool);
    }

    return {
      serverVersion: this._serverVersion,
      tools: toolsMap as unknown as ZodManifest['tools'], // Cast to verify structure compliance or rely on structural typing
    };
  }

  async toolGet(
    toolName: string,
    headers?: Record<string, string>,
  ): Promise<ZodManifest> {
    const manifest = await this.toolsList(undefined, headers);
    if (!manifest.tools[toolName]) {
      const error = new Error(`Tool '${toolName}' not found.`);
      logApiError(`Error getting tool ${toolName}`, error);
      throw error;
    }

    return {
      serverVersion: manifest.serverVersion,
      tools: {
        [toolName]: manifest.tools[toolName],
      },
    };
  }

  async toolInvoke(
    toolName: string,
    arguments_: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<string> {
    await this.ensureInitialized(headers);

    if (Object.keys(headers).length > 0) {
      warnIfHttpAndHeaders(this._mcpBaseUrl, headers);
    }

    const params: types.CallToolRequestParams = {
      name: toolName,
      arguments: arguments_,
    };

    const result = await this.#sendRequest(
      this._mcpBaseUrl,
      types.CallToolRequest,
      params,
      headers,
    );

    if (!result) {
      const error = new Error(
        `Failed to invoke tool '${toolName}': No response from server.`,
      );
      logApiError(`Error invoking tool ${toolName}`, error);
      throw error;
    }

    return this.processToolResultContent(result.content);
  }
}
