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

import {jest} from '@jest/globals';
import type {AxiosInstance} from 'axios';

jest.unstable_mockModule('axios', () => ({
  default: {
    create: jest.fn(),
    isAxiosError: jest.fn(() => true),
  },
  AxiosError: class extends Error {
    constructor(message: string) {
      super(message);
    }
  },
  isAxiosError: jest.fn(),
}));

const {default: axios} = await import('axios');
const {McpHttpTransportV20241105} = await import(
  '../../src/toolbox_core/mcp/v20241105/mcp.js'
);

const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;

describe('McpHttpTransportV20241105', () => {
  const testBaseUrl = 'http://test.loc';
  let mockSession: jest.Mocked<AxiosInstance>;
  let transport: InstanceType<typeof McpHttpTransportV20241105>;

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
    transport = new McpHttpTransportV20241105(testBaseUrl, mockSession);
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
        data: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            protocolVersion: '2024-11-05',
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
            protocolVersion: '2024-11-05',
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
        data: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            protocolVersion: '2024-11-05',
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
      });

      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      await expect(transport.toolsList()).rejects.toThrow(
        'Initialization failed: No response',
      );
      errorSpy.mockRestore();
    });

    it('should handle initialized notification returning 202 without error', async () => {
      const initResponse = {
        data: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            protocolVersion: '2024-11-05',
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
  });

  describe('toolsList', () => {
    beforeEach(() => {
      // Setup successful init for tool tests
      const initResponse = {
        data: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            protocolVersion: '2024-11-05',
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
        data: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            protocolVersion: '2024-11-05',
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
        data: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            protocolVersion: '2024-11-05',
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
        expect.any(Object),
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
  });
});
