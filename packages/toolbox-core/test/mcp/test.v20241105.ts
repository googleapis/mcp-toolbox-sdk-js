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

import {McpHttpTransportV20241105} from '../../src/toolbox_core/mcp/v20241105/mcp.js';
import {jest} from '@jest/globals';
import axios, {AxiosInstance} from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('McpHttpTransportV20241105', () => {
  const testBaseUrl = 'http://test.loc';
  let mockSession: jest.Mocked<AxiosInstance>;
  let transport: McpHttpTransportV20241105;

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
        expect.any(Object)
      );

      expect(mockSession.post).toHaveBeenNthCalledWith(
        2,
        `${testBaseUrl}/mcp/`,
        expect.objectContaining({
          method: 'notifications/initialized',
        }),
        expect.any(Object)
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

      await expect(transport.toolsList()).rejects.toThrow(
        /MCP version mismatch/
      );
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

      await expect(transport.toolsList()).rejects.toThrow(
        /Server does not support the 'tools' capability/
      );
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

      await expect(transport.toolGet('missing')).rejects.toThrow(
        /Tool 'missing' not found/
      );
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
            content: [
              {type: 'text', text: 'Result output'},
            ],
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
        expect.any(Object)
      );
      expect(result).toBe('Result output');
    });

    it('should handle JSON-RPC errors', async () => {
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
        /MCP request failed with code -32601: Method not found/
      );
    });
    
    it('should handle HTTP errors', async () => {
      const httpErrorResponse = {
        data: 'Server Error',
        status: 500,
        statusText: 'Internal Server Error',
      };
      
      mockSession.post.mockResolvedValueOnce(httpErrorResponse);

      await expect(transport.toolInvoke('testTool', {}, {})).rejects.toThrow(
        /API request failed with status 500/
      );
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
  });
});
