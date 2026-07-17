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

import {ProtocolNegotiationError} from '../../errorUtils.js';

export class McpHttpTransportV20260618 extends McpHttpTransportBase {
  #getMeta() {
    return {
      protocolVersion: this._protocolVersion,
      clientInfo: {
        name: this._clientName || 'toolbox-core-js',
        version: this._clientVersion || VERSION,
      },
      clientCapabilities: {},
    };
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
    }

    try {
      const response = await this._session.post(url, payload, {
        headers: reqHeaders,
      });

          `API request failed with status ${response.status} (${response.statusText}). Server response: ${errorText}`,
        );
      }

        const errResult = types.JSONRPCErrorSchema.safeParse(jsonResp);
        let message = `MCP request failed: ${JSON.stringify(jsonResp.error)}`;
        let code = 'MCP_ERROR';

            err.data &&
            typeof err.data === 'object' &&
            'supported' in err.data
          ) {
            const supported = (err.data as Record<string, unknown>).supported;
          message,
          code,
          response.config,
          response.request,
          response,
        );
      }

      // Parse Result
      }

      return null;
    } catch (error) {
      logApiError(`Error posting data to ${url}:`, error);
      throw error;
    }
  }

  protected async initializeSession(): Promise<void> {
    // Stateless MCP does not use initialize handshake
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


    return this.processToolResultContent(result.content);
  }
}
