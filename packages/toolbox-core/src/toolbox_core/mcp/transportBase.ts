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

import axios, {AxiosInstance, AxiosResponse, isAxiosError} from 'axios';
import {ITransport} from '../transport.types.js';
import {
  ParameterSchema,
  PrimitiveTypeSchema,
  TypeSchema,
  ZodManifest,
  Protocol,
  isVersionAtLeast,
} from '../protocol.js';

interface JsonSchema {
  type?: string;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  description?: string;
  required?: string[];
  default?: unknown;
}

interface ToolDefinition {
  description?: string;
  inputSchema?: JsonSchema;
  secureInputSchema?: JsonSchema;
  _meta?: {
    'com.google.cloud/authParam'?: Record<string, string[]>;
    'com.google.cloud/authInvoke'?: string[];
    'toolbox/authParam'?: Record<string, string[]>;
    'toolbox/authInvoke'?: string[];
  };
}

/**
 * Characters that are percent-encoded in toolset names: '%', '/', '\', '?',
 * '#', space and the ASCII control characters (U+0000 to U+001F and U+007F).
 */
// eslint-disable-next-line no-control-regex
const TOOLSET_NAME_CHARS_TO_ENCODE = /[%/\\?#\x00-\x20\x7F]/g;

/**
 * Extracts a `Location` header value via `headers.get` when available, or by
 * case-insensitive key lookup on plain header objects.
 */
function getLocationHeader(headers: unknown): string | undefined {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }
  const maybeGet = (headers as {get?: unknown}).get;
  if (typeof maybeGet === 'function') {
    const val = (maybeGet as (name: string) => unknown).call(
      headers,
      'location',
    );
    if (typeof val === 'string' && val.length > 0) {
      return val;
    }
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'location') {
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
      if (
        Array.isArray(value) &&
        typeof value[0] === 'string' &&
        value[0].length > 0
      ) {
        return value[0];
      }
    }
  }
  return undefined;
}

function redirectError(status: number, headers: unknown): Error {
  const location = getLocationHeader(headers);
  const target = location ? ` to '${location}'` : '';
  return new Error(
    `Toolbox server responded with HTTP ${status} redirect${target}. Automatic redirects are disabled for security. Configure the client with the final server URL.`,
  );
}

/**
 * Node HTTP (`follow-redirects`) hook that blocks redirects even if a custom
 * Axios request interceptor overrides `maxRedirects`.
 */
function rejectRedirect(
  _options: Record<string, unknown>,
  responseDetails: {headers: Record<string, string>; statusCode: number},
): void {
  throw redirectError(responseDetails.statusCode, responseDetails.headers);
}

/**
 * Throws a descriptive error if the response is an HTTP redirect (3xx).
 */
function throwIfRedirect(response: AxiosResponse): void {
  if (response.status >= 300 && response.status < 400) {
    throw redirectError(response.status, response.headers);
  }
}

export abstract class McpHttpTransportBase implements ITransport {
  protected _mcpBaseUrl: string;
  protected _protocolVersion: string;
  protected _serverVersion: string | null = null;
  public supportedProtocols?: string[];

  protected _manageSession: boolean;
  protected _session: AxiosInstance;
  protected _clientName?: string;
  protected _clientVersion?: string;

  private _initPromise: Promise<void> | null = null;

  constructor(
    baseUrl: string,
    session?: AxiosInstance,
    protocol: Protocol = Protocol.MCP,
    clientName?: string,
    clientVersion?: string,
  ) {
    const parsed = new URL(baseUrl);
    let path = parsed.pathname;
    if (path.endsWith('/mcp')) {
      path += '/';
    } else if (!path.includes('/mcp/')) {
      path = path.replace(/\/+$/, '') + '/mcp/';
    }
    parsed.pathname = path;
    this._mcpBaseUrl = parsed.toString();

    this._protocolVersion = protocol;
    this._clientName = clientName;
    this._clientVersion = clientVersion;

    this._manageSession = !session;
    this._session = session || axios.create();
  }

  protected async ensureInitialized(
    headers?: Record<string, string>,
  ): Promise<void> {
    if (!this._initPromise) {
      this._initPromise = this.initializeSession(headers);
    }
    await this._initPromise;
  }

  get protocolVersion(): string {
    return this._protocolVersion;
  }

  get baseUrl(): string {
    return this._mcpBaseUrl;
  }

  protected appendToolsetPath(toolsetName?: string | null): string {
    if (toolsetName === undefined || toolsetName === null) {
      return this._mcpBaseUrl;
    }
    if (typeof toolsetName !== 'string') {
      throw new TypeError(
        `Invalid toolset name: expected string, got ${typeof toolsetName}.`,
      );
    }
    if (toolsetName === '') {
      return this._mcpBaseUrl;
    }
    if (toolsetName === '.' || toolsetName === '..') {
      throw new Error(
        `Invalid toolset name '${toolsetName}'. Toolset names must not be '.' or '..'.`,
      );
    }
    const parsed = new URL(this._mcpBaseUrl);
    // Keep the name in exactly one path segment by percent-encoding (as two
    // uppercase hex digits) only TOOLSET_NAME_CHARS_TO_ENCODE. Encoding '%'
    // keeps sequences such as '%2e' literal, and encoding the controls stops
    // the URL parser from stripping tab/LF/CR (which would turn '.\t.' into
    // '..'). The pathname setter handles every other character as before.
    const segment = toolsetName.replace(
      TOOLSET_NAME_CHARS_TO_ENCODE,
      c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'),
    );
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') + '/' + segment;
    return parsed.toString();
  }

  /**
   * Sends a POST request to the Toolbox server.
   *
   * Automatic redirects are disabled on every request, including when a
   * custom Axios instance is provided, so that auth headers and request
   * bodies (which may carry secure parameters) are never re-sent to another
   * URL. Any 3xx response is surfaced as an error instead.
   */
  protected async postToServer(
    url: string,
    payload: unknown,
    headers?: Record<string, string>,
  ): Promise<AxiosResponse> {
    let response: AxiosResponse;
    try {
      response = await this._session.post(url, payload, {
        headers,
        maxRedirects: 0,
        beforeRedirect: rejectRedirect,
      });
    } catch (error) {
      // The default `validateStatus` rejects 3xx responses.
      if (isAxiosError(error) && error.response) {
        throwIfRedirect(error.response);
      }
      throw error;
    }
    // A custom `validateStatus` may resolve 3xx responses instead.
    throwIfRedirect(response);
    return response;
  }

  protected convertToolSchema(toolData: unknown): {
    description: string;
    parameters: ParameterSchema[];
    secure_parameters?: ParameterSchema[];
    authRequired?: string[];
  } {
    const data = toolData as ToolDefinition;
    let paramAuth: Record<string, string[]> | null = null;
    let invokeAuth: string[] = [];

    if (data._meta && typeof data._meta === 'object') {
      const meta = data._meta as Record<string, unknown>;
      const is2026OrNewer = isVersionAtLeast(
        this._protocolVersion,
        Protocol.MCP_v20260728,
      );

      if (is2026OrNewer) {
        if (
          meta['com.google.cloud/authParam'] &&
          typeof meta['com.google.cloud/authParam'] === 'object'
        ) {
          paramAuth = meta['com.google.cloud/authParam'] as Record<
            string,
            string[]
          >;
        }
        if (
          meta['com.google.cloud/authInvoke'] &&
          Array.isArray(meta['com.google.cloud/authInvoke'])
        ) {
          invokeAuth = meta['com.google.cloud/authInvoke'] as string[];
        }
      } else {
        if (
          meta['toolbox/authParam'] &&
          typeof meta['toolbox/authParam'] === 'object'
        ) {
          paramAuth = meta['toolbox/authParam'] as Record<string, string[]>;
        }
        if (
          meta['toolbox/authInvoke'] &&
          Array.isArray(meta['toolbox/authInvoke'])
        ) {
          invokeAuth = meta['toolbox/authInvoke'] as string[];
        }
      }
    }

    const parameters = this._convertParameters(data.inputSchema, paramAuth);
    const secureParameters = this._convertParameters(data.secureInputSchema);

    return {
      description: data.description || '',
      parameters,
      secure_parameters: secureParameters,
      authRequired: invokeAuth.length > 0 ? invokeAuth : undefined,
    };
  }

  private _convertParameters(
    inputSchema?: JsonSchema,
    paramAuth?: Record<string, string[]> | null,
  ): ParameterSchema[] {
    const parameters: ParameterSchema[] = [];
    const properties = inputSchema?.properties || {};
    const required = new Set<string>(inputSchema?.required || []);

    for (const [name, schema] of Object.entries(properties) as [
      string,
      JsonSchema,
    ][]) {
      const typeSchema = this._convertTypeSchema(schema);

      const param: ParameterSchema = {
        name,
        description: schema.description || '',
        required: required.has(name),
        default: schema.default,
        ...typeSchema,
      } as ParameterSchema;

      if (paramAuth && paramAuth[name]) {
        param.authSources = paramAuth[name];
      }

      parameters.push(param);
    }

    return parameters;
  }

  private _convertTypeSchema(schemaData: unknown): TypeSchema {
    const schema = schemaData as JsonSchema;
    const paramType = schema.type || 'string';

    if (paramType === 'array') {
      let itemsSchema: TypeSchema | undefined;

      // MCP strictly requires standard JSON Schema formatting:
      // https://modelcontextprotocol.io/specification/2025-11-25/server/tools#tool
      // This dictates using `items` for array types (https://json-schema.org/understanding-json-schema/reference/array#items)
      // and `additionalProperties` for maps (https://json-schema.org/understanding-json-schema/reference/object#additionalproperties).
      if (schema.items !== undefined && schema.items !== null) {
        // For third-party compatibility, skip strict typing if 'items' is a list (Draft 7 tuple validation).
        // Missing 'items' keys default natively to generic lists (list[Any]).
        if (typeof schema.items === 'object' && !Array.isArray(schema.items)) {
          itemsSchema = this._convertTypeSchema(schema.items);
        }
      }

      return {
        type: 'array',
        ...(itemsSchema ? {items: itemsSchema} : {}),
      };
    } else if (paramType === 'object') {
      let additionalProperties: boolean | PrimitiveTypeSchema | undefined;

      if (
        schema.additionalProperties !== undefined &&
        schema.additionalProperties !== null &&
        typeof schema.additionalProperties === 'object' &&
        !Array.isArray(schema.additionalProperties)
      ) {
        additionalProperties = {
          type: schema.additionalProperties.type as
            | 'string'
            | 'integer'
            | 'float'
            | 'number'
            | 'boolean',
        } as PrimitiveTypeSchema;
      } else {
        additionalProperties = schema.additionalProperties !== false;
      }

      return {
        type: 'object',
        additionalProperties,
      };
    } else {
      return {
        type: paramType as
          | 'string'
          | 'integer'
          | 'float'
          | 'number'
          | 'boolean'
          | undefined,
      } as PrimitiveTypeSchema;
    }
  }

  protected processToolResultContent(
    content: {type?: string; text?: string}[],
  ): string {
    const textContentItems = content
      .filter(c => c.type === 'text' && typeof c.text === 'string')
      .map(c => c.text as string);

    if (textContentItems.length > 1) {
      const allJsonObjects = textContentItems.every(item => {
        try {
          const parsed = JSON.parse(item);
          return (
            typeof parsed === 'object' &&
            parsed !== null &&
            !Array.isArray(parsed)
          );
        } catch {
          return false;
        }
      });

      if (allJsonObjects) {
        return `[${textContentItems.join(',')}]`;
      }
    }

    return textContentItems.join('') || 'null';
  }

  protected abstract initializeSession(
    headers?: Record<string, string>,
  ): Promise<void>;

  abstract toolGet(
    toolName: string,
    headers?: Record<string, string>,
  ): Promise<ZodManifest>;

  abstract toolsList(
    toolsetName?: string,
    headers?: Record<string, string>,
  ): Promise<ZodManifest>;

  abstract toolInvoke(
    toolName: string,
    arguments_: Record<string, unknown>,
    headers: Record<string, string>,
    secureArguments?: Record<string, unknown>,
  ): Promise<string>;
}
