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

/* eslint-disable @typescript-eslint/no-explicit-any */
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
        secureArguments?: Record<string, unknown>,
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
    secureArguments?: Record<string, unknown>,
  ): Promise<string> {
    return this.toolInvokeMock(toolName, arguments_, headers, secureArguments);
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

  public testAppendToolsetPath(toolsetName?: string | null): string {
    return this.appendToolsetPath(toolsetName);
  }

  public testPostToServer(
    url: string,
    payload: unknown,
    headers?: Record<string, string>,
  ) {
    return this.postToServer(url, payload, headers);
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

    const urlTestCases = [
      {input: 'http://api.com', expected: 'http://api.com/mcp/'},
      {input: 'http://api.com/', expected: 'http://api.com/mcp/'},
      {input: 'http://api.com/mcp', expected: 'http://api.com/mcp/'},
      {input: 'http://api.com/mcp/', expected: 'http://api.com/mcp/'},
      {
        input: 'http://api.com?proj=xyz',
        expected: 'http://api.com/mcp/?proj=xyz',
      },
      {
        input: 'http://api.com/mcp?proj=xyz',
        expected: 'http://api.com/mcp/?proj=xyz',
      },
      {
        input: 'http://api.com/mcp/?proj=xyz',
        expected: 'http://api.com/mcp/?proj=xyz',
      },
      {
        input: 'http://api.com/v1/api?proj=xyz',
        expected: 'http://api.com/v1/api/mcp/?proj=xyz',
      },
      {
        input: 'http://api.com?proj=xyz&env=prod',
        expected: 'http://api.com/mcp/?proj=xyz&env=prod',
      },
      {
        input: 'http://localhost:5000/mcp/sse?project=my-project',
        expected: 'http://localhost:5000/mcp/sse?project=my-project',
      },
    ];

    urlTestCases.forEach(({input, expected}) => {
      it(`should construct base URL correctly for ${input}`, () => {
        const transport = new TestMcpTransport(input);
        expect(transport.baseUrl).toBe(expected);
      });
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

    it('should handle tool with legacy toolbox auth metadata on pre-2026 version', () => {
      (transport as unknown as {_protocolVersion: string})._protocolVersion =
        Protocol.MCP_v20251125;
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

    it('should handle tool with 2026+ com.google.cloud auth metadata', () => {
      (transport as unknown as {_protocolVersion: string})._protocolVersion =
        Protocol.MCP_v20260728;
      const toolData = {
        name: 'authTool2026',
        description: 'Auth required 2026',
        inputSchema: {
          properties: {
            secureParam: {type: 'string'},
          },
        },
        _meta: {
          'com.google.cloud/authInvoke': ['scope:read'],
          'com.google.cloud/authParam': {
            secureParam: ['scope:admin'],
          },
        },
      };

      const result = transport.testConvertToolSchema(toolData);
      expect(result.authRequired).toEqual(['scope:read']);
      const param = result.parameters.find(p => p.name === 'secureParam');
      expect(param?.authSources).toEqual(['scope:admin']);
    });

    it('should ignore legacy toolbox auth metadata on 2026+ version', () => {
      (transport as unknown as {_protocolVersion: string})._protocolVersion =
        Protocol.MCP_v20260728;
      const toolData = {
        name: 'authToolLegacyOn2026',
        description: 'Legacy auth params on 2026 version',
        inputSchema: {
          properties: {
            secureParam: {type: 'string'},
          },
        },
        _meta: {
          'toolbox/authInvoke': ['scope:legacy'],
          'toolbox/authParam': {
            secureParam: ['scope:legacy'],
          },
        },
      };

      const result = transport.testConvertToolSchema(toolData);
      expect(result.authRequired).toBeUndefined();
      const param = result.parameters.find(p => p.name === 'secureParam');
      expect(param?.authSources).toBeUndefined();
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

    it('should handle array without items (default to any)', () => {
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
        }),
      );
      expect((result.parameters[0] as any).items).toBeUndefined();
    });

    it('should convert schema with recursive types (nested arrays, arrays of maps)', () => {
      const toolData = {
        name: 'recursive_tool',
        inputSchema: {
          type: 'object',
          properties: {
            // List[List[str]]
            nested_array: {
              type: 'array',
              items: {
                type: 'array',
                items: {type: 'string'},
              },
            },
            // List[Dict[str, int]]
            array_of_maps: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: {type: 'integer'},
              },
            },
            // Dict[str, List[int]]
            map_of_arrays: {
              type: 'object',
              additionalProperties: {
                type: 'array',
                items: {type: 'integer'},
              },
            },
          },
        },
      };

      const result = transport.testConvertToolSchema(toolData);

      // 1. Nested Array
      const pNested: any = result.parameters.find(
        p => p.name === 'nested_array',
      );
      expect(pNested.type).toBe('array');
      expect(pNested.items).toBeDefined();
      expect(pNested.items.type).toBe('array');
      expect(pNested.items.items).toBeDefined();
      expect(pNested.items.items.type).toBe('string');

      // 2. Array of Maps
      const pArrMap: any = result.parameters.find(
        p => p.name === 'array_of_maps',
      );
      expect(pArrMap.type).toBe('array');
      expect(pArrMap.items).toBeDefined();
      expect(pArrMap.items.type).toBe('object');
      expect(pArrMap.items.additionalProperties.type).toBe('integer');

      // 3. Map of Arrays
      const pMapArr: any = result.parameters.find(
        p => p.name === 'map_of_arrays',
      );
      expect(pMapArr.type).toBe('object');
      expect(pMapArr.additionalProperties.type).toBe('array');
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

  describe('appendToolsetPath', () => {
    it('should return the base URL if no toolset name is provided', () => {
      const transport = new TestMcpTransport(testBaseUrl);
      expect(transport.testAppendToolsetPath()).toBe(`${testBaseUrl}/mcp/`);
      expect(transport.testAppendToolsetPath(null)).toBe(`${testBaseUrl}/mcp/`);
      expect(transport.testAppendToolsetPath('')).toBe(`${testBaseUrl}/mcp/`);
    });

    it('should throw TypeError for non-string toolset names', () => {
      const transport = new TestMcpTransport(testBaseUrl);
      for (const invalid of [['..'], ['.'], 123, {toString: () => '..'}]) {
        expect(() => transport.testAppendToolsetPath(invalid as any)).toThrow(
          TypeError,
        );
      }
    });

    // Legitimate names must produce exactly the URL produced before toolset
    // names were encoded, when they were assigned to URL.pathname as is.
    const unchangedToolsetUrlTestCases = [
      {toolsetName: 'my-toolset', expected: 'http://test.loc/mcp/my-toolset'},
      {
        toolsetName: "a+b:c@d=e;f,g$h&i!j'k(l)m*n",
        expected: "http://test.loc/mcp/a+b:c@d=e;f,g$h&i!j'k(l)m*n",
      },
      {toolsetName: 'a b', expected: 'http://test.loc/mcp/a%20b'},
      {toolsetName: 'caf\u00e9', expected: 'http://test.loc/mcp/caf%C3%A9'},
    ];

    unchangedToolsetUrlTestCases.forEach(({toolsetName, expected}) => {
      it(`should keep the previous URL for toolset name ${JSON.stringify(toolsetName)}`, () => {
        const transport = new TestMcpTransport(testBaseUrl);
        expect(transport.testAppendToolsetPath(toolsetName)).toBe(expected);
      });
    });

    const encodedToolsetUrlTestCases = [
      {
        baseUrl: testBaseUrl,
        toolsetName: 'a/b',
        expected: 'http://test.loc/mcp/a%2Fb',
      },
      {
        baseUrl: testBaseUrl,
        toolsetName: '../../admin',
        expected: 'http://test.loc/mcp/..%2F..%2Fadmin',
      },
      {
        baseUrl: testBaseUrl,
        toolsetName: '..\\admin',
        expected: 'http://test.loc/mcp/..%5Cadmin',
      },
      {
        baseUrl: testBaseUrl,
        toolsetName: '%2e%2e',
        expected: 'http://test.loc/mcp/%252e%252e',
      },
      {
        baseUrl: testBaseUrl,
        toolsetName: 'a?b#c',
        expected: 'http://test.loc/mcp/a%3Fb%23c',
      },
      {
        baseUrl: testBaseUrl,
        toolsetName: '.\t.',
        expected: 'http://test.loc/mcp/.%09.',
      },
      {
        baseUrl: testBaseUrl,
        toolsetName: '\t..',
        expected: 'http://test.loc/mcp/%09..',
      },
      {
        baseUrl: testBaseUrl,
        toolsetName: '..\n',
        expected: 'http://test.loc/mcp/..%0A',
      },
      {
        baseUrl: testBaseUrl,
        toolsetName: '.\r.',
        expected: 'http://test.loc/mcp/.%0D.',
      },
      {
        baseUrl: testBaseUrl,
        toolsetName: '.\t',
        expected: 'http://test.loc/mcp/.%09',
      },
      {
        baseUrl: testBaseUrl,
        toolsetName: 'a\tb',
        expected: 'http://test.loc/mcp/a%09b',
      },
      {
        baseUrl: testBaseUrl,
        toolsetName: '.. ',
        expected: 'http://test.loc/mcp/..%20',
      },
      {
        baseUrl: testBaseUrl,
        toolsetName: '..\x00',
        expected: 'http://test.loc/mcp/..%00',
      },
      {
        baseUrl: testBaseUrl,
        toolsetName: '..\x1f',
        expected: 'http://test.loc/mcp/..%1F',
      },
      {
        baseUrl: 'http://test.loc/mcp/?proj=xyz',
        toolsetName: 'a/b',
        expected: 'http://test.loc/mcp/a%2Fb?proj=xyz',
      },
    ];

    encodedToolsetUrlTestCases.forEach(({baseUrl, toolsetName, expected}) => {
      it(`should keep toolset name ${JSON.stringify(toolsetName)} in a single path segment of ${baseUrl}`, () => {
        const transport = new TestMcpTransport(baseUrl);
        expect(transport.testAppendToolsetPath(toolsetName)).toBe(expected);
      });
    });

    ['.', '..'].forEach(toolsetName => {
      it(`should throw for toolset name '${toolsetName}'`, () => {
        const transport = new TestMcpTransport(testBaseUrl);
        expect(() => transport.testAppendToolsetPath(toolsetName)).toThrow(
          `Invalid toolset name '${toolsetName}'. Toolset names must not be '.' or '..'.`,
        );
      });
    });
  });

  describe('postToServer', () => {
    const url = `${testBaseUrl}/mcp/`;
    let transport: TestMcpTransport;

    beforeEach(() => {
      transport = new TestMcpTransport(testBaseUrl, mockSession);
    });

    it('should disable automatic redirects on the request', async () => {
      const response = {status: 200, data: {result: {}}, headers: {}};
      mockSession.post.mockResolvedValueOnce(response);
      const headers = {Authorization: 'Bearer token'};

      await expect(
        transport.testPostToServer(url, {method: 'tools/list'}, headers),
      ).resolves.toBe(response);

      expect(mockSession.post).toHaveBeenCalledWith(
        url,
        {method: 'tools/list'},
        {
          headers,
          maxRedirects: 0,
          beforeRedirect: expect.any(Function),
        },
      );
    });

    it('should block redirects via beforeRedirect if maxRedirects is overridden', async () => {
      mockSession.post.mockImplementationOnce((_u, _p, config: any) => {
        config.beforeRedirect(
          {},
          {statusCode: 307, headers: {Location: 'https://evil.example/'}},
        );
        return Promise.resolve({status: 200, data: {}, headers: {}} as any);
      });

      await expect(transport.testPostToServer(url, {})).rejects.toThrow(
        "Toolbox server responded with HTTP 307 redirect to 'https://evil.example/'. Automatic redirects are disabled for security.",
      );
    });

    it('should read Location header via headers.get or case-insensitive keys', async () => {
      mockSession.post.mockResolvedValueOnce({
        status: 301,
        data: '',
        headers: {Location: 'https://upper.example/'},
      } as any);
      await expect(transport.testPostToServer(url, {})).rejects.toThrow(
        "Toolbox server responded with HTTP 301 redirect to 'https://upper.example/'.",
      );

      mockSession.post.mockResolvedValueOnce({
        status: 302,
        data: '',
        headers: {
          get: (name: string) =>
            name === 'location' ? 'https://getter.example/' : undefined,
        },
      } as any);
      await expect(transport.testPostToServer(url, {})).rejects.toThrow(
        "Toolbox server responded with HTTP 302 redirect to 'https://getter.example/'.",
      );
    });

    it('should throw for a redirect response accepted by a custom validateStatus', async () => {
      mockSession.post.mockResolvedValueOnce({
        status: 308,
        data: '',
        headers: {location: 'https://evil.example/'},
      });

      await expect(transport.testPostToServer(url, {})).rejects.toThrow(
        "Toolbox server responded with HTTP 308 redirect to 'https://evil.example/'. Automatic redirects are disabled for security. Configure the client with the final server URL.",
      );
    });

    it('should throw for a redirect response without a Location header', async () => {
      mockSession.post.mockResolvedValueOnce({
        status: 302,
        data: '',
        headers: {},
      });

      await expect(transport.testPostToServer(url, {})).rejects.toThrow(
        'Toolbox server responded with HTTP 302 redirect. Automatic redirects are disabled for security.',
      );
    });

    it('should rethrow non-redirect errors unchanged', async () => {
      const error = new Error('Network Error');
      mockSession.post.mockRejectedValueOnce(error);

      await expect(transport.testPostToServer(url, {})).rejects.toBe(error);
    });
  });
});
