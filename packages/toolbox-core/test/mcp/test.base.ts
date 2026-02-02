// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {McpHttpTransportBase} from '../../src/toolbox_core/mcp/transportBase.js';
import {Protocol, ZodManifest} from '../../src/toolbox_core/protocol.js';
import axios, {AxiosInstance} from 'axios';
import {jest} from '@jest/globals';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

class TestMcpTransport extends McpHttpTransportBase {
  public initializeSessionMock = jest.fn<() => Promise<void>>();
  public toolGetMock =
    jest.fn<
      (
        toolName: string,
        headers?: Record<string, string>,
      ) => Promise<ZodManifest>
    >();
  public toolsListMock =
    jest.fn<
      (
        toolsetName?: string,
        headers?: Record<string, string>,
      ) => Promise<ZodManifest>
    >();
  public toolInvokeMock =
    jest.fn<
      (
        toolName: string,
        arguments_: Record<string, unknown>,
        headers: Record<string, string>,
      ) => Promise<string>
    >();

  constructor(
    baseUrl: string,
    session?: AxiosInstance,
    protocol: Protocol = Protocol.MCP,
    clientName?: string,
    clientVersion?: string,
  ) {
    super(baseUrl, session, protocol, clientName, clientVersion);
  }

  public getClientName(): string | undefined {
    return this._clientName;
  }

  public getClientVersion(): string | undefined {
    return this._clientVersion;
  }

  protected async initializeSession(): Promise<void> {
    return this.initializeSessionMock();
  }

  async toolGet(
    toolName: string,
    headers?: Record<string, string>,
  ): Promise<ZodManifest> {
    return this.toolGetMock(toolName, headers);
  }

  async toolsList(
    toolsetName?: string,
    headers?: Record<string, string>,
  ): Promise<ZodManifest> {
    return this.toolsListMock(toolsetName, headers);
  }

  async toolInvoke(
    toolName: string,
    arguments_: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<string> {
    return this.toolInvokeMock(toolName, arguments_, headers);
  }

  public testConvertToolSchema(toolData: Record<string, unknown>) {
    return this.convertToolSchema(toolData);
  }

  // Helper to access protected ensureInitialized
  public async testEnsureInitialized() {
    return this.ensureInitialized();
  }

  public getSession(): AxiosInstance {
    return this._session;
  }

  public testProcessToolResultContent(
    content: {type?: string; text?: string}[],
  ): string {
    return this.processToolResultContent(content);
  }
}

describe('McpHttpTransportBase', () => {
  const testBaseUrl = 'http://test.loc';
  let mockSession: jest.Mocked<AxiosInstance>;

  beforeEach(() => {
    mockSession = {
      get: jest.fn(),
      post: jest.fn(),
      defaults: {headers: {}},
      interceptors: {
        request: {use: jest.fn()},
        response: {use: jest.fn()},
      },
    } as unknown as jest.Mocked<AxiosInstance>;

    mockedAxios.create.mockReturnValue(mockSession);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided session', () => {
      const transport = new TestMcpTransport(testBaseUrl, mockSession);
      expect(transport.getSession()).toBe(mockSession);
      expect(transport.baseUrl).toBe(`${testBaseUrl}/mcp/`);
    });

    it('should create new session if not provided', () => {
      const transport = new TestMcpTransport(testBaseUrl);
      expect(mockedAxios.create).toHaveBeenCalled();
      expect(transport.getSession()).toBe(mockSession);
      expect(transport.baseUrl).toBe(`${testBaseUrl}/mcp/`);
    });

    it('should set protocol version', () => {
      new TestMcpTransport(testBaseUrl, undefined, Protocol.MCP_v20241105);
    });

    it('should set client name and version', () => {
      const transport = new TestMcpTransport(
        testBaseUrl,
        undefined,
        undefined,
        'my-client',
        '1.2.3',
      );
      expect(transport.getClientName()).toBe('my-client');
      expect(transport.getClientVersion()).toBe('1.2.3');
    });
  });

  describe('ensureInitialized', () => {
    it('should call initializeSession only once', async () => {
      const transport = new TestMcpTransport(testBaseUrl);
      transport.initializeSessionMock.mockResolvedValue(undefined);

      await transport.testEnsureInitialized();
      await transport.testEnsureInitialized();

      expect(transport.initializeSessionMock).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent initialization calls', async () => {
      const transport = new TestMcpTransport(testBaseUrl);
      let resolveInit: () => void;
      const initPromise = new Promise<void>(resolve => {
        resolveInit = resolve;
      });
      transport.initializeSessionMock.mockReturnValue(initPromise);

      const p1 = transport.testEnsureInitialized();
      const p2 = transport.testEnsureInitialized();

      resolveInit!();
      await Promise.all([p1, p2]);

      expect(transport.initializeSessionMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('convertToolSchema', () => {
    let transport: TestMcpTransport;

    beforeEach(() => {
      transport = new TestMcpTransport(testBaseUrl);
    });

    it('should convert simple tool schema correctly', () => {
      const toolData = {
        name: 'testTool',
        description: 'Test Description',
        inputSchema: {
          type: 'object',
          properties: {
            arg1: {type: 'string', description: 'desc1'},
            arg2: {type: 'integer'},
          },
          required: ['arg1'],
        },
      };

      const result = transport.testConvertToolSchema(toolData);

      expect(result.description).toBe('Test Description');
      expect(result.parameters).toHaveLength(2);
      expect(result.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'arg1',
            type: 'string',
            description: 'desc1',
            required: true,
          }),
          expect.objectContaining({
            name: 'arg2',
            type: 'integer',
            description: '',
            required: false,
          }),
        ]),
      );
    });

    it('should handle array parameters', () => {
      const toolData = {
        description: 'Array Tool',
        inputSchema: {
          properties: {
            tags: {
              type: 'array',
              items: {type: 'string'},
            },
          },
        },
      };

      const result = transport.testConvertToolSchema(toolData);
      expect(result.parameters[0]).toEqual(
        expect.objectContaining({
          name: 'tags',
          type: 'array',
          items: {type: 'string'},
        }),
      );
    });

    it('should handle object parameters', () => {
      const toolData = {
        description: 'Object Tool',
        inputSchema: {
          properties: {
            config: {
              type: 'object',
              additionalProperties: {type: 'boolean'},
            },
            meta: {
              type: 'object',
            },
          },
        },
      };

      const result = transport.testConvertToolSchema(toolData);
      const configParam = result.parameters.find(p => p.name === 'config');
      const metaParam = result.parameters.find(p => p.name === 'meta');

      expect(configParam).toEqual(
        expect.objectContaining({
          name: 'config',
          type: 'object',
          additionalProperties: {type: 'boolean'},
        }),
      );

      expect(metaParam).toEqual(
        expect.objectContaining({
          name: 'meta',
          type: 'object',
          additionalProperties: true,
        }),
      );
    });

    it('should handle tool with auth metadata', () => {
      const toolData = {
        name: 'authTool',
        description: 'Auth required',
        inputSchema: {
          properties: {
            secureParam: {type: 'string'},
          },
        },
        _meta: {
          'toolbox/authInvoke': ['scope:read'],
          'toolbox/authParam': {
            secureParam: ['scope:admin'],
          },
        },
      };

      const result = transport.testConvertToolSchema(toolData);
      expect(result.authRequired).toEqual(['scope:read']);
      const param = result.parameters.find(p => p.name === 'secureParam');
      expect(param?.authSources).toEqual(['scope:admin']);
    });

    it('should handle minimal tool definition (defaults)', () => {
      const toolData = {
        name: 'minimal',
        // No description, no inputSchema
      };

      const result = transport.testConvertToolSchema(toolData);
      expect(result.description).toBe('');
      expect(result.parameters).toEqual([]);
      expect(result.authRequired).toBeUndefined();
    });

    it('should handle array without items (default to string)', () => {
      const toolData = {
        name: 'arrayDefault',
        inputSchema: {
          properties: {
            list: {type: 'array'}, // No items defined
          },
        },
      };

      const result = transport.testConvertToolSchema(toolData);
      expect(result.parameters[0]).toEqual(
        expect.objectContaining({
          type: 'array',
          items: {type: 'string'},
        }),
      );
    });

    it('should handle partial auth metadata', () => {
      const toolData = {
        name: 'partialAuth',
        inputSchema: {properties: {a: {type: 'string'}}},
        _meta: {
          'toolbox/authInvoke': 'not-an-array', // Should be ignored
          'toolbox/authParam': 'not-an-object', // Should be ignored
        },
      };
      const result = transport.testConvertToolSchema(toolData);
      expect(result.authRequired).toBeUndefined();
      expect(result.parameters[0].authSources).toBeUndefined();
    });
  });

  describe('processToolResultContent', () => {
    let transport: TestMcpTransport;

    beforeEach(() => {
      transport = new TestMcpTransport(testBaseUrl);
    });

    it('should return single text content directly', () => {
      const content = [{type: 'text', text: 'hello'}];
      expect(transport.testProcessToolResultContent(content)).toBe('hello');
    });

    it('should concatenate multiple text contents if not all valid JSON objects', () => {
      const content = [
        {type: 'text', text: 'part1'},
        {type: 'text', text: 'part2'},
      ];
      expect(transport.testProcessToolResultContent(content)).toBe(
        'part1part2',
      );
    });

    it('should merge multiple valid JSON object contents into a list', () => {
      const content = [
        {type: 'text', text: '{"a": 1}'},
        {type: 'text', text: '{"b": 2}'},
      ];
      expect(transport.testProcessToolResultContent(content)).toBe(
        '[{"a": 1},{"b": 2}]',
      );
    });

    it('should fallback to concatenation if any content is invalid JSON', () => {
      const content = [
        {type: 'text', text: '{"a": 1}'},
        {type: 'text', text: 'invalid-json'},
      ];
      expect(transport.testProcessToolResultContent(content)).toBe(
        '{"a": 1}invalid-json',
      );
    });

    it('should fallback to concatenation if JSON is not an object (e.g. array)', () => {
      const content = [
        {type: 'text', text: '{"a": 1}'},
        {type: 'text', text: '[1, 2]'}, // Array, not object
      ];
      expect(transport.testProcessToolResultContent(content)).toBe(
        '{"a": 1}[1, 2]',
      );
    });

    it('should filter out non-text content', () => {
      const content = [
        {type: 'text', text: 'hello'},
        {type: 'image', text: 'ignore me'}, // Should be ignored (or handled as non-text)
      ];
      // Note: non-text types might not have 'text' field, but if they do, our filter checks type='text'
      expect(transport.testProcessToolResultContent(content)).toBe('hello');
    });

    it('should return "null" if content is empty', () => {
      expect(transport.testProcessToolResultContent([])).toBe('null');
    });

    it('should return "null" if no text content is found', () => {
      const content = [{type: 'image', data: '...'}];
      expect(transport.testProcessToolResultContent(content)).toBe('null');
    });
  });
});
