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

import {
  ZodManifest,
  Protocol,
  getSupportedMcpVersions,
} from '../../protocol.js';
import {logApiError} from '../../errorUtils.js';
import {warnIfHttpAndHeaders} from '../../utils.js';

import {v4 as uuidv4} from 'uuid';
import {VERSION} from '../../version.js';

import {ProtocolNegotiationError} from '../../errorUtils.js';

export class McpHttpTransportV20260728 extends McpHttpTransportBase {
  #getMeta() {
    return {
      'io.modelcontextprotocol/protocolVersion': this._protocolVersion,
      'io.modelcontextprotocol/clientInfo': {
        name: this._clientName || 'toolbox-core-js',
        version: this._clientVersion || VERSION,
      },
      'io.modelcontextprotocol/clientCapabilities': {},
    };
  }

  #checkProtocolNegotiationError(errVal: unknown): void {
    if (!errVal) return;

    // Check for unsupported protocol version error code (-32022 or -32004)
    if (
      typeof errVal === 'object' &&
      errVal !== null &&
      'code' in errVal &&
      ((errVal as Record<string, unknown>).code === -32022 ||
        (errVal as Record<string, unknown>).code === -32004)
    ) {
      const serverSupported = ((
        (errVal as Record<string, unknown>).data as Record<string, unknown>
      )?.supported || []) as string[];
      const clientSupported =
        this.supportedProtocols || getSupportedMcpVersions();
      const mutuallySupported = clientSupported.filter(v =>
        serverSupported.includes(v),
      );

      if (mutuallySupported.length > 0) {
        throw new ProtocolNegotiationError(mutuallySupported[0] as Protocol);
      } else {
        throw new Error(
          `No mutually supported protocol version. Client supports: ${clientSupported.join(
            ', ',
          )}, Server supports: ${serverSupported.join(', ')}`,
        );
      }
    }

    // Check for legacy fallback (string or object message matching)
    const errMsg =
      typeof errVal === 'string'
        ? errVal.toLowerCase()
        : typeof errVal === 'object' && errVal !== null && 'message' in errVal
          ? String((errVal as Record<string, unknown>).message).toLowerCase()
          : '';

    const isLegacyError =
      errMsg.includes('invalid protocol version') ||
      errMsg.includes('unsupported protocol version');

    if (isLegacyError) {
      // Cascading Fallback
      const clientSupported =
        this.supportedProtocols || getSupportedMcpVersions();
      const currentIdx = clientSupported.indexOf(
        this._protocolVersion as Protocol,
      );
      if (currentIdx !== -1 && currentIdx + 1 < clientSupported.length) {
        throw new ProtocolNegotiationError(
          clientSupported[currentIdx + 1] as Protocol,
        );
      } else {
        throw new Error(
          "Server threw 'invalid protocol version' but no fallback versions remain in the user's supported protocols array.",
        );
      }
    }
  }

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

    // Inject Protocol Version into headers as required by MCP spec
    const reqHeaders = {...(headers || {})};
    reqHeaders['MCP-Protocol-Version'] = this._protocolVersion;

    // Inject SEP-2243 routing headers
    reqHeaders['Mcp-Method'] = method;
    if (typeof params === 'object' && params !== null) {
      if (
        (method === 'tools/call' || method === 'prompts/get') &&
        'name' in params
      ) {
        reqHeaders['Mcp-Name'] = String(
          (params as Record<string, unknown>).name,
        );
      } else if (method === 'resources/read' && 'uri' in params) {
        reqHeaders['Mcp-Name'] = String(
          (params as Record<string, unknown>).uri,
        );
      }
    }

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

      if (jsonResp && typeof jsonResp === 'object' && jsonResp.error) {
        const errVal = jsonResp.error;
        this.#checkProtocolNegotiationError(errVal);

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
      if (error instanceof ProtocolNegotiationError) {
        throw error;
      }
      if (error instanceof AxiosError) {
        const jsonResp = error.response?.data;
        if (jsonResp) {
          if (typeof jsonResp === 'object' && 'error' in jsonResp) {
            const errVal = (jsonResp as Record<string, unknown>).error;
            this.#checkProtocolNegotiationError(errVal);
          } else if (typeof jsonResp === 'string') {
            this.#checkProtocolNegotiationError(jsonResp);
          }
        }
      }
      logApiError(`Error posting data to ${url}:`, error);
      throw error;
    }
  }

  protected async initializeSession(
    // Required to match McpHttpTransportBase signature, but unused because
    // Stateless MCP does not use an initialize handshake.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _headers?: Record<string, string>,
  ): Promise<void> {
    this._serverVersion = 'unknown';
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
      {_meta: this.#getMeta()},
      headers,
    );

    if (!result) {
      const error = new Error('Failed to list tools: No response from server.');
      logApiError(`Error listing tools from ${url}`, error);
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
      serverVersion: this._serverVersion ?? 'unknown',
      tools: toolsMap as unknown as ZodManifest['tools'],
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

    if (headers && Object.keys(headers).length > 0) {
      warnIfHttpAndHeaders(this._mcpBaseUrl, headers);
    }

    const params: types.CallToolRequestParams & {
      _meta?: Record<string, unknown>;
    } = {
      name: toolName,
      arguments: arguments_,
      _meta: this.#getMeta(),
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
