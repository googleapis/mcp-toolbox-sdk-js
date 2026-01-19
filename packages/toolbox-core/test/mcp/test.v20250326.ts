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

import {McpHttpTransportV20250326} from '../../src/toolbox_core/mcp/v20250326/mcp.js';
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

describe('McpHttpTransportV20250326', () => {
  const testBaseUrl = 'http://test.loc';
  let mockSession: jest.Mocked<AxiosInstance>;
  let transport: McpHttpTransportV20250326;

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
    transport = new McpHttpTransportV20250326(
      testBaseUrl,
      mockSession,
      Protocol.MCP_v20250326,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should perform handshake successfully', async () => {
      // Mock responses for initialization
      // 1. InitializeRequest -> result with tools capability
      // 2. InitializedNotification -> (no response needed usually, or empty)

      const initResponse = {
        headers: {'mcp-session-id': 'sess-1'},
        data: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            protocolVersion: '2025-03-26',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'test-server',
              version: '1.0.0',
            },
          },
        },
        status: 200,
      };

      const initializedNotificationResponse = {
        data: {
          jsonrpc: '2.0',
        },
        status: 200,
      };

      mockSession.post
        .mockResolvedValueOnce(initResponse)
        .mockResolvedValueOnce(initializedNotificationResponse);

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

      expect(mockSession.post).toHaveBeenNthCalledWith(
        1,
        `${testBaseUrl}/mcp/`,
        expect.objectContaining({
          method: 'initialize',
          params: expect.objectContaining({
            protocolVersion: '2025-03-26',
            clientInfo: expect.any(Object),
          }),
        }),
        expect.any(Object),
      );

      expect(mockSession.post).toHaveBeenNthCalledWith(
        2,
        `${testBaseUrl}/mcp/`,
        expect.objectContaining({
          method: 'notifications/initialized',
        }),
        expect.any(Object),
      );
    });

    it('should throw error on protocol version mismatch', async () => {
      const initResponse = {
        headers: {'mcp-session-id': 'sess-1'},
        data: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            protocolVersion: '2023-01-01', // Mismatch
            capabilities: {tools: {}},
            serverInfo: {name: 'old-server', version: '0.1'},
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(initResponse);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      await expect(transport.toolsList()).rejects.toThrow(
        /MCP version mismatch/,
      );
      errorSpy.mockRestore();
    });

    it('should throw error if tools capability missing', async () => {
      const initResponse = {
        headers: {'mcp-session-id': 'sess-1'},
        data: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            protocolVersion: '2025-03-26',
            capabilities: {}, // No tools
            serverInfo: {name: 'server', version: '1.0'},
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(initResponse);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      await expect(transport.toolsList()).rejects.toThrow(
        /Server does not support the 'tools' capability/,
      );
      errorSpy.mockRestore();
    });

    it('should throw error if initialization returns no response (204)', async () => {
      mockSession.post.mockResolvedValueOnce({
        status: 204,
        data: null,
        headers: {},
      });

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      await expect(transport.toolsList()).rejects.toThrow(
        'Initialization failed: No response',
      );
      errorSpy.mockRestore();
    });

    it('should throw error if Mcp-Session-Id header is missing', async () => {
      const initResponse = {
        headers: {}, // Missing session ID
        data: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            protocolVersion: '2025-03-26',
            capabilities: {tools: {}},
            serverInfo: {name: 'test-server', version: '1.0.0'},
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(initResponse);

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      await expect(transport.toolsList()).rejects.toThrow(
        'Server did not return a Mcp-Session-Id during initialization.',
      );
      errorSpy.mockRestore();
    });

    it('should handle initialized notification returning 202 without error', async () => {
      const initResponse = {
        headers: {'mcp-session-id': 'sess-1'},
        data: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            protocolVersion: '2025-03-26',
            capabilities: {tools: {}},
            serverInfo: {name: 'test-server', version: '1.0.0'},
          },
        },
        status: 200,
      };

      const initializedNotificationResponse = {
        data: '',
        status: 202,
        statusText: 'Accepted',
      };

      mockSession.post
        .mockResolvedValueOnce(initResponse)
        .mockResolvedValueOnce(initializedNotificationResponse);

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

      await expect(transport.toolsList()).resolves.not.toThrow();
    });

    it('should propagate headers during initialization', async () => {
      const initResponse = {
        headers: {'mcp-session-id': 'sess-1'},
        data: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            protocolVersion: '2025-03-26',
            capabilities: {tools: {}},
            serverInfo: {name: 'test-server', version: '1.0.0'},
          },
        },
        status: 200,
      };

      const initializedNotificationResponse = {
        data: {jsonrpc: '2.0'},
        status: 200,
      };

      const listResponse = {
        data: {
          jsonrpc: '2.0',
          id: '2',
          result: {tools: []},
        },
        status: 200,
      };

      mockSession.post
        .mockResolvedValueOnce(initResponse)
        .mockResolvedValueOnce(initializedNotificationResponse)
        .mockResolvedValueOnce(listResponse);

      const testHeaders = {'X-Test-Header': 'test-value'};
      // Note: Mcp-Session-Id is NOT sent on the initialize request itself, but subsequent requests.
      // However, the initialize request SHOULD have the propagated headers.

      await transport.toolsList(undefined, testHeaders);

      // Verify Initialize request has client headers
      expect(mockSession.post).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.anything(),
        expect.objectContaining({headers: testHeaders}),
      );

      // Verify Initialized notification has client headers + session ID
      expect(mockSession.post).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            ...testHeaders,
            'Mcp-Session-Id': 'sess-1',
          }),
        }),
      );
    });
  });

  describe('toolsList', () => {
    beforeEach(() => {
      // Setup successful init for tool tests
      const initResponse = {
        headers: {'mcp-session-id': 'sess-1'},
        data: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            protocolVersion: '2025-03-26',
            capabilities: {tools: {}},
            serverInfo: {name: 'test-server', version: '1.0.0'},
          },
        },
        status: 200,
      };
      const notifResponse = {data: {}, status: 200};

      mockSession.post
        .mockResolvedValueOnce(initResponse)
        .mockResolvedValueOnce(notifResponse);
    });

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

    it('should throw if server version is not available after init', async () => {
      mockSession.post.mockReset();
      mockSession.post.mockResolvedValueOnce({
        data: {
          jsonrpc: '2.0',
          id: '2',
          result: {
            tools: [],
          },
        },
        status: 200,
      });
      jest
        .spyOn(
          transport as unknown as {ensureInitialized: () => Promise<void>},
          'ensureInitialized',
        )
        .mockResolvedValue(undefined);
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      await expect(transport.toolsList()).rejects.toThrow(
        'Server version not available.',
      );
      errorSpy.mockRestore();
    });
  });

  describe('toolGet', () => {
    beforeEach(() => {
      const initResponse = {
        headers: {'mcp-session-id': 'sess-1'},
        data: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            protocolVersion: '2025-03-26',
            capabilities: {tools: {}},
            serverInfo: {name: 'test-server', version: '1.0.0'},
          },
        },
        status: 200,
      };
      mockSession.post
        .mockResolvedValueOnce(initResponse)
        .mockResolvedValueOnce({data: {}, status: 200});
    });

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
    beforeEach(() => {
      // Init sequence
      const initResponse = {
        headers: {'mcp-session-id': 'sess-1'},
        data: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            protocolVersion: '2025-03-26',
            capabilities: {tools: {}},
            serverInfo: {name: 'test-server', version: '1.0.0'},
          },
        },
        status: 200,
      };
      mockSession.post
        .mockResolvedValueOnce(initResponse)
        .mockResolvedValueOnce({data: {}, status: 200});
    });

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

      expect(mockSession.post).toHaveBeenCalledWith(
        `${testBaseUrl}/mcp/`,
        expect.objectContaining({
          method: 'tools/call',
          params: {
            name: 'testTool',
            arguments: {arg: 'val'},
          },
        }),
        expect.objectContaining({headers: {'Mcp-Session-Id': 'sess-1'}}),
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
          // Missing 'result' and 'error'
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

    it('should throw explicit error for malformed error object', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const malformedErrorResponse = {
        data: {
          jsonrpc: '2.0',
          id: '3',
          error: 'Just a string error', // Invalid, should be object with code/message
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(malformedErrorResponse);

      await expect(transport.toolInvoke('testTool', {}, {})).rejects.toThrow(
        'MCP request failed: "Just a string error"',
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

    it('should verify current broken behavior (concatenation) for non-JSON chunks', async () => {
      const invokeResponse = {
        data: {
          jsonrpc: '2.0',
          id: '3',
          result: {
            content: [
              {type: 'text', text: 'part1'},
              {type: 'text', text: 'part2'},
            ],
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(invokeResponse);

      const result = await transport.toolInvoke('testTool', {}, {});
      expect(result).toBe('part1part2');
    });

    it('should NOT merge if chunks are not valid JSON (mixed)', async () => {
      const invokeResponse = {
        data: {
          jsonrpc: '2.0',
          id: '3',
          result: {
            content: [
              {type: 'text', text: '{"id": 1}'},
              {type: 'text', text: 'part2'},
            ],
          },
        },
        status: 200,
      };

      mockSession.post.mockResolvedValueOnce(invokeResponse);

      const result = await transport.toolInvoke('testTool', {}, {});
      expect(result).toBe('{"id": 1}part2');
    });
  });
});
