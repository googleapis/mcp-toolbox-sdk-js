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

import {ProtocolNegotiationError} from '../../src/toolbox_core/errorUtils.js';
import {McpHttpTransportV20260618} from '../../src/toolbox_core/mcp/v20260618/mcp.js';
import {jest} from '@jest/globals';
import axios, {AxiosInstance} from 'axios';

import {Protocol} from '../../src/toolbox_core/protocol.js';

jest.mock('axios', () => {
  const actual = jest.requireActual('axios') as {
    default: typeof import('axios');
  };
  return {
    __esModule: true,
    ...actual,
    default: {
      ...actual.default,
      create: jest.fn(),
    },
  };
});
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('McpHttpTransportV20260618', () => {
  const testBaseUrl = 'http://test.loc';
  let mockSession: jest.Mocked<AxiosInstance>;
  let transport: McpHttpTransportV20260618;
  let consoleWarnSpy: ReturnType<typeof jest.spyOn>;

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
    transport = new McpHttpTransportV20260618(
      testBaseUrl,
      mockSession,
      Protocol.MCP_DRAFT,
    );
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleWarnSpy.mockRestore();
  });

  describe('initialization', () => {
    it('should not perform handshake but directly send the request', async () => {
      const listResponse = {
        data: {
          jsonrpc: '2.0',
          id: '2',
          result: {
            tools: [],
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(listResponse);

      await transport.toolsList();

      // Only one request was made, the actual tools/list request
      expect(mockSession.post).toHaveBeenCalledTimes(1);

      expect(mockSession.post).toHaveBeenNthCalledWith(
        1,
        `${testBaseUrl}/mcp/`,
        expect.objectContaining({
          method: 'tools/list',
          params: expect.objectContaining({
            _meta: expect.objectContaining({
              'io.modelcontextprotocol/protocolVersion': Protocol.MCP_DRAFT,
              'io.modelcontextprotocol/clientInfo': expect.any(Object),
            }),
          }),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'MCP-Protocol-Version': Protocol.MCP_DRAFT,
            'Mcp-Method': 'tools/list',
          }),
        }),
      );
    });

    it('should throw error on protocol version mismatch from first request', async () => {
      const errorResponse = {
        data: {
          jsonrpc: '2.0',
          id: '1',
          error: {
            code: -32004,
            message: 'Unsupported Protocol Version',
            data: {
              supported: ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'],
            },
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(errorResponse);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      try {
        await transport.toolsList();
        fail('Expected error to be thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ProtocolNegotiationError);
        expect((err as ProtocolNegotiationError).fallbackVersion).toBe('2025-11-25');
      }
      errorSpy.mockRestore();
    });
  });

  describe('toolsList', () => {
    it('should return converted tools', async () => {
      const listResponse = {
        data: {
          jsonrpc: '2.0',
          id: '2',
          result: {
            tools: [
              {
                name: 'testTool',
                description: 'A test tool',
                inputSchema: {
                  type: 'object',
                  properties: {
                    x: {type: 'string'},
                  },
                },
              },
            ],
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(listResponse);

      const manifest = await transport.toolsList();

      expect(manifest.tools['testTool']).toBeDefined();
      expect(manifest.tools['testTool'].description).toBe('A test tool');
      expect(manifest.tools['testTool'].parameters).toBeDefined();
    });

    it('should correctly map auth fields', async () => {
      const listResponse = {
        data: {
          jsonrpc: '2.0',
          id: '2',
          result: {
            tools: [
              {
                name: 'authTool',
                description: 'Tool with auth',
                inputSchema: {
                  type: 'object',
                  properties: {
                    x: {
                      type: 'string',
                    },
                  },
                },
                _meta: {
                  'toolbox/authInvoke': ['service-auth'],
                  'toolbox/authParam': {
                    x: ['param-auth'],
                  },
                },
              },
            ],
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(listResponse);

      const manifest = await transport.toolsList();
      const tool = manifest.tools['authTool'];

      expect(tool).toBeDefined();
      expect(tool.authRequired).toEqual(['service-auth']);
      expect(tool.parameters[0].authSources).toEqual(['param-auth']);
    });

    it('should throw if toolsList returns no response (204)', async () => {
      mockSession.post.mockResolvedValueOnce({
        status: 204,
        data: null,
      });

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      await expect(transport.toolsList()).rejects.toThrow(
        'Failed to list tools: No response from server.',
      );
      errorSpy.mockRestore();
    });
  });

  describe('toolGet', () => {
    it('should return specific tool manifest', async () => {
      const listResponse = {
        data: {
          jsonrpc: '2.0',
          id: '2',
          result: {
            tools: [
              {
                name: 'targetTool',
                description: 'desc',
                inputSchema: {type: 'object'},
              },
              {
                name: 'otherTool',
                description: 'desc2',
                inputSchema: {type: 'object'},
              },
            ],
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(listResponse);

      const manifest = await transport.toolGet('targetTool');

      expect(manifest.tools).toHaveProperty('targetTool');
      expect(Object.keys(manifest.tools).length).toBe(1);
    });

    it('should throw if tool not found', async () => {
      const listResponse = {
        data: {
          jsonrpc: '2.0',
          id: '2',
          result: {tools: []},
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(listResponse);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      await expect(transport.toolGet('missing')).rejects.toThrow(
        /Tool 'missing' not found/,
      );
      errorSpy.mockRestore();
    });
  });

  describe('toolInvoke', () => {
    it('should invoke tool and return text content', async () => {
      const invokeResponse = {
        data: {
          jsonrpc: '2.0',
          id: '3',
          result: {
            content: [{type: 'text', text: 'Result output'}],
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(invokeResponse);

      const result = await transport.toolInvoke('testTool', {arg: 'val'}, {});

      expect(mockSession.post).toHaveBeenLastCalledWith(
        `${testBaseUrl}/mcp/`,
        expect.objectContaining({
          method: 'tools/call',
          params: expect.objectContaining({
            name: 'testTool',
            arguments: {arg: 'val'},
            _meta: expect.objectContaining({
              'io.modelcontextprotocol/protocolVersion': Protocol.MCP_DRAFT,
              'io.modelcontextprotocol/clientInfo': expect.any(Object),
            }),
          }),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'MCP-Protocol-Version': Protocol.MCP_DRAFT,
            'Mcp-Method': 'tools/call',
            'Mcp-Name': 'testTool',
          }),
        }),
      );
      expect(result).toBe('Result output');
    });

    it('should handle JSON-RPC errors', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const errorResponse = {
        data: {
          jsonrpc: '2.0',
          id: '3',
          error: {
            code: -32601,
            message: 'Method not found',
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(errorResponse);

      await expect(transport.toolInvoke('badTool', {}, {})).rejects.toThrow(
        /MCP request failed with code -32601: Method not found/,
      );
      errorSpy.mockRestore();
    });

    it('should handle HTTP errors', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const httpErrorResponse = {
        data: 'Server Error',
        status: 500,
        statusText: 'Internal Server Error',
      };

      mockSession.post.mockResolvedValueOnce(httpErrorResponse);

      await expect(transport.toolInvoke('testTool', {}, {})).rejects.toThrow(
        /API request failed with status 500/,
      );
      errorSpy.mockRestore();
    });

    it('should return "null" if content is empty', async () => {
      const invokeResponse = {
        data: {
          jsonrpc: '2.0',
          id: '3',
          result: {
            content: [],
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(invokeResponse);

      const result = await transport.toolInvoke('testTool', {}, {});
      expect(result).toBe('null');
    });

    it('should throw if toolInvoke returns no response (204)', async () => {
      mockSession.post.mockResolvedValueOnce({
        status: 204,
        data: null,
      });

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      await expect(transport.toolInvoke('testTool', {}, {})).rejects.toThrow(
        "Failed to invoke tool 'testTool': No response from server.",
      );
      errorSpy.mockRestore();
    });

    it('should throw if JSON-RPC response structure is invalid', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const invalidResponse = {
        data: {
          jsonrpc: '2.0',
          id: '3',
          somethingElse: true,
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(invalidResponse);

      await expect(transport.toolInvoke('testTool', {}, {})).rejects.toThrow(
        'Failed to parse JSON-RPC response structure',
      );
      errorSpy.mockRestore();
    });

    it('should merge multiple valid JSON text chunks into a JSON list', async () => {
      const invokeResponse = {
        data: {
          jsonrpc: '2.0',
          id: '3',
          result: {
            content: [
              {type: 'text', text: '{"id": 1, "val": "a"}'},
              {type: 'text', text: '{"id": 2, "val": "b"}'},
            ],
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(invokeResponse);

      const result = await transport.toolInvoke('testTool', {}, {});

      expect(result).toBe('[{"id": 1, "val": "a"},{"id": 2, "val": "b"}]');
    });

    it('should warn if sending headers over HTTP', async () => {
      const invokeResponse = {
        data: {
          jsonrpc: '2.0',
          id: '3',
          result: {content: []},
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(invokeResponse);

      await transport.toolInvoke(
        'testTool',
        {arg: 'val'},
        {Authorization: 'Bearer token'},
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'This connection is using HTTP. To prevent credential exposure, please ensure all communication is sent over HTTPS.',
        ),
      );
    });

    it('should not warn if using HTTPS', async () => {
      const invokeResponse = {
        data: {
          jsonrpc: '2.0',
          id: '3',
          result: {content: []},
        },
        status: 200,
      };

      const httpsTransport = new McpHttpTransportV20260618(
        'https://secure.test.loc',
        mockSession,
        Protocol.MCP_DRAFT,
      );

      mockSession.post.mockResolvedValueOnce(invokeResponse);

      await httpsTransport.toolInvoke(
        'testTool',
        {arg: 'val'},
        {Authorization: 'Bearer token'},
      );

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });
});
