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

import axios, {AxiosInstance} from 'axios';
import {ITransport} from '../transport.types.js';
import {
  ParameterSchema,
  PrimitiveTypeSchema,
  TypeSchema,
  ZodManifest,
  Protocol,
} from '../protocol.js';

interface JsonSchema {
  type?: string;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  description?: string;
  required?: string[];
}

interface ToolDefinition {
  description?: string;
  inputSchema?: JsonSchema;
  _meta?: {
    'toolbox/authParam'?: Record<string, string[]>;
    'toolbox/authInvoke'?: string[];
  };
}

export abstract class McpHttpTransportBase implements ITransport {
  protected _mcpBaseUrl: string;
  protected _protocolVersion: string;
  protected _serverVersion: string | null = null;

  protected _manageSession: boolean;
  protected _session: AxiosInstance;

  private _initPromise: Promise<void> | null = null;

  constructor(
    baseUrl: string,
    session?: AxiosInstance,
    protocol: Protocol = Protocol.MCP,
  ) {
    this._mcpBaseUrl = `${baseUrl}/mcp/`;
    this._protocolVersion = protocol;

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

  get baseUrl(): string {
    return this._mcpBaseUrl;
  }

  protected convertToolSchema(toolData: unknown): {
    description: string;
    parameters: ParameterSchema[];
    authRequired?: string[];
  } {
    const data = toolData as ToolDefinition;
    let paramAuth: Record<string, string[]> | null = null;
    let invokeAuth: string[] = [];

    if (data._meta && typeof data._meta === 'object') {
      const meta = data._meta;
      if (
        meta['toolbox/authParam'] &&
        typeof meta['toolbox/authParam'] === 'object'
      ) {
        paramAuth = meta['toolbox/authParam'];
      }
      if (
        meta['toolbox/authInvoke'] &&
        Array.isArray(meta['toolbox/authInvoke'])
      ) {
        invokeAuth = meta['toolbox/authInvoke'];
      }
    }

    const parameters: ParameterSchema[] = [];
    const inputSchema = data.inputSchema || {};
    const properties = inputSchema.properties || {};
    const required = new Set<string>(inputSchema.required || []);

    for (const [name, schema] of Object.entries(properties) as [
      string,
      JsonSchema,
    ][]) {
      const typeSchema = this._convertTypeSchema(schema);

      let authSources: string[] | undefined;
      if (paramAuth && paramAuth[name]) {
        authSources = paramAuth[name];
      }

      parameters.push({
        name,
        description: schema.description || '',
        required: required.has(name),
        authSources,
        ...typeSchema,
      } as ParameterSchema);
    }

    return {
      description: data.description || '',
      parameters,
      authRequired: invokeAuth.length > 0 ? invokeAuth : undefined,
    };
  }

  private _convertTypeSchema(schemaData: unknown): TypeSchema {
    const schema = schemaData as JsonSchema;
    if (schema.type === 'array') {
      return {
        type: 'array',
        items: this._convertTypeSchema(schema.items || {type: 'string'}),
      };
    } else if (schema.type === 'object') {
      let additionalProperties: boolean | PrimitiveTypeSchema | undefined;
      if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === 'object'
      ) {
        additionalProperties = {
          type: schema.additionalProperties.type as
            | 'string'
            | 'integer'
            | 'float'
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
        type: schema.type as
          | 'string'
          | 'integer'
          | 'float'
          | 'boolean'
          | undefined,
      } as PrimitiveTypeSchema;
    }
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
  ): Promise<string>;
}
