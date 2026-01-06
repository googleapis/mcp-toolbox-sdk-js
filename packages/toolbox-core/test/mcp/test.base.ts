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
  public toolGetMock = jest.fn<
    (
      toolName: string,
      headers?: Record<string, string>,
    ) => Promise<ZodManifest>
  >();
  public toolsListMock = jest.fn<
    (
      toolsetName?: string,
      headers?: Record<string, string>,
    ) => Promise<ZodManifest>
  >();
  public toolInvokeMock = jest.fn<
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
  ) {
    super(baseUrl, session, protocol);
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

  public testConvertToolSchema(toolData: any) {
    return this.convertToolSchema(toolData);
  }

  // Helper to access protected ensureInitialized
  public async testEnsureInitialized() {
    return this.ensureInitialized();
  }

  public getSession(): AxiosInstance {
    return this._session;
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
      const transport = new TestMcpTransport(
        testBaseUrl,
        undefined,
        Protocol.MCP_v20241105,
      );
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
  });
});
