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

import {McpHttpTransportV20260728} from '../../src/toolbox_core/mcp/v20260728/mcp.js';
import {jest} from '@jest/globals';
import axios, {AxiosInstance, AxiosError} from 'axios';

import {Protocol} from '../../src/toolbox_core/protocol.js';
import {ProtocolNegotiationError} from '../../src/toolbox_core/errorUtils.js';

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

describe('McpHttpTransportV20260728', () => {
  const testBaseUrl = 'http://test.loc';
  let mockSession: jest.Mocked<AxiosInstance>;
  let transport: McpHttpTransportV20260728;
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
    transport = new McpHttpTransportV20260728(
      testBaseUrl,
      mockSession,
      Protocol.MCP_DRAFT_2026_v1,
    );
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleWarnSpy.mockRestore();
  });

  describe('initialization', () => {
    it('should not perform initialize handshake (no-op)', async () => {
      const listResponse = {
        data: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            tools: [],
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(listResponse);

      await transport.toolsList();

      // Only tools/list request should be made, no initialize or initialized notification
      expect(mockSession.post).toHaveBeenCalledTimes(1);
      expect(mockSession.post).toHaveBeenLastCalledWith(
        `${testBaseUrl}/mcp/`,
        expect.objectContaining({
          method: 'tools/list',
          params: {
            _meta: expect.objectContaining({
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            }),
          },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'MCP-Protocol-Version': '2026-07-28',
          }),
        }),
      );
    });
  });

  describe('toolsList', () => {
    it('should return converted tools', async () => {
      const listResponse = {
        data: {
          jsonrpc: '2.0',
          id: '1',
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

      expect(mockSession.post).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'MCP-Protocol-Version': '2026-07-28',
            'Mcp-Method': 'tools/list',
          }),
        }),
      );
      expect(
        mockSession.post.mock.calls[0][2]?.headers?.['Mcp-Name'],
      ).toBeUndefined();

      expect(manifest.tools['testTool']).toBeDefined();
      expect(manifest.tools['testTool'].description).toBe('A test tool');
      expect(manifest.tools['testTool'].parameters).toBeDefined();
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
          id: '1',
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
          id: '1',
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
          id: '2',
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
          params: {
            name: 'testTool',
            arguments: {arg: 'val'},
            _meta: expect.objectContaining({
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            }),
          },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'MCP-Protocol-Version': '2026-07-28',
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
          id: '2',
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

    it('should throw if toolInvoke returns invalid JSON-RPC structure', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const invalidResponse = {
        data: {
          foo: 'bar',
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(invalidResponse);

      await expect(transport.toolInvoke('testTool', {}, {})).rejects.toThrow(
        'Failed to parse JSON-RPC response structure',
      );
      errorSpy.mockRestore();
    });
  });

  describe('version negotiation', () => {
    it('should throw ProtocolNegotiationError if server returns code -32022 with supported list', async () => {
      const rpcError = {
        jsonrpc: '2.0',
        id: '1',
        error: {
          code: -32022,
          message: 'Unsupported protocol version',
          data: {
            supported: ['2025-11-25'],
          },
        },
      };

      const config =
        {} as unknown as import('axios').InternalAxiosRequestConfig;
      const response = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config,
        data: rpcError,
      } as unknown as import('axios').AxiosResponse;

      const axiosError = new AxiosError(
        'Request failed with status code 400',
        'ERR_BAD_REQUEST',
        config,
        {},
        response,
      );

      mockSession.post.mockRejectedValueOnce(axiosError);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(transport.toolsList()).rejects.toThrow(
        new ProtocolNegotiationError(Protocol.MCP_v20251125),
      );

      errorSpy.mockRestore();
    });

    it('should throw ProtocolNegotiationError on -32004 with supported array', async () => {
      const config =
        {} as unknown as import('axios').InternalAxiosRequestConfig;
      const response = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config,
        data: {
          error: {
            code: -32004,
            message: 'Protocol version not supported',
            data: {
              supported: ['2025-11-25'],
            },
          },
        },
      } as unknown as import('axios').AxiosResponse;

      const axiosError = new AxiosError(
        'Request failed with status code 400',
        'ERR_BAD_REQUEST',
        config,
        {},
        response,
      );

      mockSession.post.mockRejectedValueOnce(axiosError);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(transport.toolsList()).rejects.toThrow(
        new ProtocolNegotiationError(Protocol.MCP_v20251125),
      );
      errorSpy.mockRestore();
    });

    it('should throw ProtocolNegotiationError on -32004 with no intersection', async () => {
      const config =
        {} as unknown as import('axios').InternalAxiosRequestConfig;
      const response = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config,
        data: {
          error: {
            code: -32004,
            message: 'Protocol version not supported',
            data: {
              supported: ['9999-01-01'],
            },
          },
        },
      } as unknown as import('axios').AxiosResponse;

      const axiosError = new AxiosError(
        'Request failed with status code 400',
        'ERR_BAD_REQUEST',
        config,
        {},
        response,
      );

      mockSession.post.mockRejectedValueOnce(axiosError);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(transport.toolsList()).rejects.toThrow(
        /No mutually supported protocol version/,
      );
      errorSpy.mockRestore();
    });

    it('should throw ProtocolNegotiationError if server returns HTTP 200 with code -32022 and supported list', async () => {
      const initResponse = {
        data: {
          jsonrpc: '2.0',
          id: '1',
          error: {
            code: -32022,
            message: 'Unsupported protocol version',
            data: {
              supported: ['2025-11-25'],
            },
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(initResponse);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(transport.toolsList()).rejects.toThrow(
        new ProtocolNegotiationError(Protocol.MCP_v20251125),
      );
      errorSpy.mockRestore();
    });

    it('should throw ProtocolNegotiationError if server returns HTTP 200 with code -32004 and supported list', async () => {
      const initResponse = {
        data: {
          jsonrpc: '2.0',
          id: '1',
          error: {
            code: -32004,
            message: 'Protocol version not supported',
            data: {
              supported: ['2025-11-25'],
            },
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(initResponse);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(transport.toolsList()).rejects.toThrow(
        new ProtocolNegotiationError(Protocol.MCP_v20251125),
      );
      errorSpy.mockRestore();
    });

    it('should throw error if server returns HTTP 200 with code -32004 and no intersection', async () => {
      const initResponse = {
        data: {
          jsonrpc: '2.0',
          id: '1',
          error: {
            code: -32004,
            message: 'Protocol version not supported',
            data: {
              supported: ['9999-01-01'],
            },
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(initResponse);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(transport.toolsList()).rejects.toThrow(
        /No mutually supported protocol version/,
      );
      errorSpy.mockRestore();
    });

    it('should throw ProtocolNegotiationError (legacy fallback) if server returns HTTP 200 with invalid protocol version string', async () => {
      const initResponse = {
        data: {
          jsonrpc: '2.0',
          id: '1',
          error: 'invalid protocol version',
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(initResponse);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(transport.toolsList()).rejects.toThrow(
        new ProtocolNegotiationError(Protocol.MCP_v20251125),
      );
      errorSpy.mockRestore();
    });

    it('should throw ProtocolNegotiationError (legacy fallback) if server returns invalid protocol version string', async () => {
      const rpcError = {
        jsonrpc: '2.0',
        id: '1',
        error: 'invalid protocol version',
      };

      const config =
        {} as unknown as import('axios').InternalAxiosRequestConfig;
      const response = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config,
        data: rpcError,
      } as unknown as import('axios').AxiosResponse;

      const axiosError = new AxiosError(
        'Request failed with status code 400',
        'ERR_BAD_REQUEST',
        config,
        {},
        response,
      );

      mockSession.post.mockRejectedValueOnce(axiosError);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(transport.toolsList()).rejects.toThrow(
        new ProtocolNegotiationError(Protocol.MCP_v20251125),
      );

      errorSpy.mockRestore();
    });

    it('should throw ProtocolNegotiationError (legacy fallback) if server returns a raw plain text string error (invalid protocol version)', async () => {
      const config =
        {} as unknown as import('axios').InternalAxiosRequestConfig;
      const response = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config,
        data: 'invalid protocol version',
      } as unknown as import('axios').AxiosResponse;

      const axiosError = new AxiosError(
        'Request failed with status code 400',
        'ERR_BAD_REQUEST',
        config,
        {},
        response,
      );

      mockSession.post.mockRejectedValueOnce(axiosError);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(transport.toolsList()).rejects.toThrow(
        ProtocolNegotiationError,
      );

      errorSpy.mockRestore();
    });

    it('should throw ProtocolNegotiationError (legacy fallback) if server returns a raw plain text string error (invalid protocol version / fallback)', async () => {
      const config =
        {} as unknown as import('axios').InternalAxiosRequestConfig;
      const response = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config,
        data: 'invalid protocol version',
      } as unknown as import('axios').AxiosResponse;

      const axiosError = new AxiosError(
        'Request failed with status code 400',
        'ERR_BAD_REQUEST',
        config,
        {},
        response,
      );

      mockSession.post.mockRejectedValueOnce(axiosError);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(transport.toolsList()).rejects.toThrow(
        ProtocolNegotiationError,
      );

      errorSpy.mockRestore();
    });

    it('should throw Error if server returns code -32022 with no mutually supported version', async () => {
      const rpcError = {
        jsonrpc: '2.0',
        id: '1',
        error: {
          code: -32022,
          message: 'Unsupported protocol version',
          data: {
            supported: ['invalid-older-version'],
          },
        },
      };

      const config =
        {} as unknown as import('axios').InternalAxiosRequestConfig;
      const response = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config,
        data: rpcError,
      } as unknown as import('axios').AxiosResponse;

      const axiosError = new AxiosError(
        'Request failed with status code 400',
        'ERR_BAD_REQUEST',
        config,
        {},
        response,
      );

      mockSession.post.mockRejectedValueOnce(axiosError);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(transport.toolsList()).rejects.toThrow(
        /No mutually supported protocol version/,
      );

      errorSpy.mockRestore();
    });

    it('should throw Error if server returns invalid protocol version but no fallback remains', async () => {
      const oldestTransport = new McpHttpTransportV20260728(
        testBaseUrl,
        mockSession,
        Protocol.MCP_v20241105,
      );

      const rpcError = {
        jsonrpc: '2.0',
        id: '1',
        error: 'invalid protocol version',
      };

      const config =
        {} as unknown as import('axios').InternalAxiosRequestConfig;
      const response = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config,
        data: rpcError,
      } as unknown as import('axios').AxiosResponse;

      const axiosError = new AxiosError(
        'Request failed with status code 400',
        'ERR_BAD_REQUEST',
        config,
        {},
        response,
      );

      mockSession.post.mockRejectedValueOnce(axiosError);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(oldestTransport.toolsList()).rejects.toThrow(
        /no fallback versions remain/,
      );

      errorSpy.mockRestore();
    });
  });

  describe('security and headers', () => {
    it('should warn if sending headers over HTTP', async () => {
      const invokeResponse = {
        data: {
          jsonrpc: '2.0',
          id: '1',
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
          id: '1',
          result: {content: []},
        },
        status: 200,
      };
      // Create HTTPS transport
      const httpsTransport = new McpHttpTransportV20260728(
        'https://secure.test.loc',
        mockSession,
        Protocol.MCP_DRAFT_2026_v1,
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
