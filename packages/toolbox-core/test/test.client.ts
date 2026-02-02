// Copyright 2025 Google LLC
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
import {ITransport} from '../src/toolbox_core/transport.types.js';
import {ZodManifest, Protocol} from '../src/toolbox_core/protocol.js';
import type {ToolboxClient as ToolboxClientType} from '../src/toolbox_core/client.js';
import {ToolboxClient} from '../src/toolbox_core/client.js';
import {ToolboxTransport} from '../src/toolbox_core/toolboxTransport.js';
import {McpHttpTransportV20241105} from '../src/toolbox_core/mcp/v20241105/mcp.js';
import {McpHttpTransportV20250326} from '../src/toolbox_core/mcp/v20250326/mcp.js';
import {McpHttpTransportV20250618} from '../src/toolbox_core/mcp/v20250618/mcp.js';
import {McpHttpTransportV20251125} from '../src/toolbox_core/mcp/v20251125/mcp.js';

// --- Mock Transport Implementation ---
class MockTransport implements ITransport {
  readonly baseUrl: string;
  toolGet: jest.MockedFunction<ITransport['toolGet']>;
  toolsList: jest.MockedFunction<ITransport['toolsList']>;
  toolInvoke: jest.MockedFunction<ITransport['toolInvoke']>;

  constructor(baseUrl: string = 'https://api.example.com') {
    this.baseUrl = baseUrl;
    this.toolGet = jest.fn();
    this.toolsList = jest.fn();
    this.toolInvoke = jest.fn();
  }
}

// Mock the ToolboxTransport module
jest.mock('../src/toolbox_core/toolboxTransport.js', () => {
  return {
    ToolboxTransport: jest.fn(),
  };
});

// Mock the McpHttpTransportV20241105 module
jest.mock('../src/toolbox_core/mcp/v20241105/mcp', () => {
  return {
    __esModule: true,
    McpHttpTransportV20241105: jest.fn(),
  };
});

// Mock the McpHttpTransportV20250326 module
jest.mock('../src/toolbox_core/mcp/v20250326/mcp', () => {
  return {
    __esModule: true,
    McpHttpTransportV20250326: jest.fn(),
  };
});

// Mock the McpHttpTransportV20250618 module
jest.mock('../src/toolbox_core/mcp/v20250618/mcp', () => {
  return {
    __esModule: true,
    McpHttpTransportV20250618: jest.fn(),
  };
});

// Mock the McpHttpTransportV20251125 module
jest.mock('../src/toolbox_core/mcp/v20251125/mcp', () => {
  return {
    __esModule: true,
    McpHttpTransportV20251125: jest.fn(),
  };
});

describe('ToolboxClient', () => {
  const testBaseUrl = 'https://api.example.com';
  let mockTransport: MockTransport;
  let client: ToolboxClientType;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransport = new MockTransport(testBaseUrl);
    (ToolboxTransport as unknown as jest.Mock).mockImplementation(
      () => mockTransport,
    );
    // Explicitly reference the imported symbol which should be the mock
    (McpHttpTransportV20241105 as unknown as jest.Mock).mockImplementation(
      () => mockTransport,
    );
    (McpHttpTransportV20250326 as unknown as jest.Mock).mockImplementation(
      () => mockTransport,
    );
    (McpHttpTransportV20250618 as unknown as jest.Mock).mockImplementation(
      () => mockTransport,
    );
    (McpHttpTransportV20251125 as unknown as jest.Mock).mockImplementation(
      () => mockTransport,
    );
  });

  afterEach(async () => {
    // Cleanup if needed
  });

  describe('Initialization', () => {
    it('should initialize with the correct base URL (default MCP)', () => {
      client = new ToolboxClient(testBaseUrl);
      expect(McpHttpTransportV20250618).toHaveBeenCalledWith(
        testBaseUrl,
        undefined,
        Protocol.MCP_v20250618,
        undefined,
        undefined,
      );
    });

    it('should pass provided axios session to transport (default MCP)', () => {
      const mockSession = {
        get: jest.fn(),
      } as unknown as import('axios').AxiosInstance;
      client = new ToolboxClient(testBaseUrl, mockSession);
      expect(McpHttpTransportV20250618).toHaveBeenCalledWith(
        testBaseUrl,
        mockSession,
        Protocol.MCP_v20250618,
        undefined,
        undefined,
      );
    });

    it('should initialize with MCP transport (explicit) when specified', () => {
      client = new ToolboxClient(
        testBaseUrl,
        undefined,
        undefined,
        Protocol.MCP,
      );
      expect(McpHttpTransportV20250618).toHaveBeenCalledWith(
        testBaseUrl,
        undefined,
        Protocol.MCP_v20250618,
        undefined,
        undefined,
      );
    });

    it('should initialize with MCP v20241105 transport when specified', () => {
      client = new ToolboxClient(
        testBaseUrl,
        undefined,
        undefined,
        Protocol.MCP_v20241105,
      );
      expect(McpHttpTransportV20241105).toHaveBeenCalledWith(
        testBaseUrl,
        undefined,
        Protocol.MCP_v20241105,
        undefined,
        undefined,
      );
    });

    it('should initialize with MCP v20250326 transport when specified', () => {
      client = new ToolboxClient(
        testBaseUrl,
        undefined,
        undefined,
        Protocol.MCP_v20250326,
      );
      expect(McpHttpTransportV20250326).toHaveBeenCalledWith(
        testBaseUrl,
        undefined,
        Protocol.MCP_v20250326,
        undefined,
        undefined,
      );
    });

    it('should initialize with MCP v20251125 transport when specified', () => {
      client = new ToolboxClient(
        testBaseUrl,
        undefined,
        undefined,
        Protocol.MCP_v20251125,
      );
      expect(McpHttpTransportV20251125).toHaveBeenCalledWith(
        testBaseUrl,
        undefined,
        Protocol.MCP_v20251125,
        undefined,
        undefined,
      );
    });

    it('should initialize with ToolboxTransport when specified', () => {
      client = new ToolboxClient(
        testBaseUrl,
        undefined,
        undefined,
        Protocol.TOOLBOX,
      );
      expect(ToolboxTransport).toHaveBeenCalledWith(testBaseUrl, undefined);
    });

    it('should throw error for unsupported protocol', () => {
      expect(() => {
        new ToolboxClient(
          testBaseUrl,
          undefined,
          undefined,
          'unknown-protocol' as Protocol,
        );
      }).toThrow('Unsupported protocol version: unknown-protocol');
    });

    it('should pass client name and version to transport', () => {
      client = new ToolboxClient(
        testBaseUrl,
        undefined,
        undefined,
        Protocol.MCP_v20250618,
        'custom-client',
        '1.2.3',
      );
      expect(McpHttpTransportV20250618).toHaveBeenCalledWith(
        testBaseUrl,
        undefined,
        Protocol.MCP_v20250618,
        'custom-client',
        '1.2.3',
      );
    });
  });

  describe('loadTool', () => {
    it('should successfully resolve a tool from the manifest', async () => {
      const toolName = 'testTool';
      const manifest: ZodManifest = {
        serverVersion: '1.0.0',
        tools: {
          [toolName]: {
            description: 'A test tool',
            parameters: [{name: 'param1', type: 'string', description: 'desc'}],
          },
        },
      };

      mockTransport.toolGet.mockResolvedValue(manifest);
      client = new ToolboxClient(testBaseUrl);

      const tool = await client.loadTool(toolName);

      expect(mockTransport.toolGet).toHaveBeenCalledWith(toolName, {});
      expect(tool.toolName).toBe(toolName);
      expect(tool.description).toBe('A test tool');
    });

    it('should throw if tool not found in manifest', async () => {
      const toolName = 'missingTool';
      const manifest: ZodManifest = {
        serverVersion: '1.0.0',
        tools: {
          existingTool: {
            description: 'exists',
            parameters: [],
          },
        },
      };

      mockTransport.toolGet.mockResolvedValue(manifest);
      client = new ToolboxClient(testBaseUrl);

      await expect(client.loadTool(toolName)).rejects.toThrow(
        `Tool "${toolName}" not found`,
      );
    });

    it('should propagate transport errors', async () => {
      mockTransport.toolGet.mockRejectedValue(new Error('Network Error'));
      client = new ToolboxClient(testBaseUrl);

      await expect(client.loadTool('anyTool')).rejects.toThrow('Network Error');
    });

    it('should invoke the tool correctly via transport', async () => {
      const toolName = 'invokeTest';
      const manifest: ZodManifest = {
        serverVersion: '1.0.0',
        tools: {
          [toolName]: {
            description: 'Invokable',
            parameters: [{name: 'input', type: 'string', description: 'input'}],
          },
        },
      };

      mockTransport.toolGet.mockResolvedValue(manifest);
      mockTransport.toolInvoke.mockResolvedValue('tool result');
      client = new ToolboxClient(testBaseUrl);

      const tool = await client.loadTool(toolName);
      const result = await tool({input: 'value'});

      expect(result).toBe('tool result');
      expect(mockTransport.toolInvoke).toHaveBeenCalledWith(
        toolName,
        {input: 'value'},
        {}, // headers
      );
    });

    it('should resolve and pass client headers', async () => {
      const toolName = 'headerTest';
      const manifest: ZodManifest = {
        serverVersion: '1.0.0',
        tools: {[toolName]: {description: 'Header Test', parameters: []}},
      };

      mockTransport.toolGet.mockResolvedValue(manifest);
      mockTransport.toolInvoke.mockResolvedValue('ok');

      const clientHeaders = {'X-Test': 'value'};
      client = new ToolboxClient(testBaseUrl, undefined, clientHeaders);

      const tool = await client.loadTool(toolName);
      await tool();

      // Check toolGet headers
      expect(mockTransport.toolGet).toHaveBeenCalledWith(
        toolName,
        clientHeaders,
      );
      expect(mockTransport.toolInvoke).toHaveBeenCalledWith(
        toolName,
        {},
        clientHeaders,
      );
    });

    it('should successfully bind a parameter', async () => {
      const toolName = 'boundTest';
      const manifest: ZodManifest = {
        serverVersion: '1.0.0',
        tools: {
          [toolName]: {
            description: 'Bound Test',
            parameters: [{name: 'p1', type: 'string', description: 'p1'}],
          },
        },
      };

      mockTransport.toolGet.mockResolvedValue(manifest);
      mockTransport.toolInvoke.mockResolvedValue('ok');
      client = new ToolboxClient(testBaseUrl);

      const tool = await client.loadTool(toolName, {}, {p1: 'boundValue'});

      // Invoking tool without p1 should work because it's bound
      await tool();

      expect(mockTransport.toolInvoke).toHaveBeenCalledWith(
        toolName,
        {p1: 'boundValue'},
        {},
      );
    });
  });

  describe('loadToolset', () => {
    it('should successfully load a toolset', async () => {
      const toolset = 'mySet';
      const manifest: ZodManifest = {
        serverVersion: '1.0.0',
        tools: {
          toolA: {description: 'A', parameters: []},
          toolB: {description: 'B', parameters: []},
        },
      };

      mockTransport.toolsList.mockResolvedValue(manifest);
      client = new ToolboxClient(testBaseUrl);

      const tools = await client.loadToolset(toolset);

      expect(mockTransport.toolsList).toHaveBeenCalledWith(toolset, {});
      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.toolName)).toEqual(['toolA', 'toolB']);
    });

    it('should load default toolset if no name provided', async () => {
      const manifest: ZodManifest = {
        serverVersion: '1.0.0',
        tools: {defaultTool: {description: 'Default', parameters: []}},
      };

      mockTransport.toolsList.mockResolvedValue(manifest);
      client = new ToolboxClient(testBaseUrl);

      const tools = await client.loadToolset(); // Undefined

      // The client converts undefined to '' string for toolsList
      expect(mockTransport.toolsList).toHaveBeenCalledWith('', {});
      expect(tools).toHaveLength(1);
    });

    it('should propagate errors from keysList', async () => {
      mockTransport.toolsList.mockRejectedValue(new Error('API Unavailable'));
      client = new ToolboxClient(testBaseUrl);

      await expect(client.loadToolset('set')).rejects.toThrow(
        'API Unavailable',
      );
    });
  });

  describe('Bound Parameters & Auth Validation', () => {
    // Tests related to validation logic in client load* methods

    const toolName = 'paramTool';
    const manifest: ZodManifest = {
      serverVersion: '1.0.0',
      tools: {
        [toolName]: {
          description: 'Tool with Params',
          parameters: [
            {name: 'p1', type: 'string', description: 'Parameter 1'},
            {
              name: 'authP',
              type: 'string',
              description: 'Auth',
              authSources: ['authSvc'],
            },
          ],
        },
      },
    };

    beforeEach(() => {
      mockTransport.toolGet.mockResolvedValue(manifest);
      mockTransport.toolsList.mockResolvedValue(manifest);
      client = new ToolboxClient(testBaseUrl);
    });

    it('loadTool: should fail if unused bound parameter is provided', async () => {
      await expect(
        client.loadTool(toolName, {}, {unused: '123'}),
      ).rejects.toThrow(
        `Validation failed for tool '${toolName}': unused bound parameters: unused`,
      );
    });

    it('loadTool: should fail if unused auth token is provided', async () => {
      await expect(
        client.loadTool(toolName, {unusedAuth: () => 'abc'}),
      ).rejects.toThrow(
        `Validation failed for tool '${toolName}': unused auth tokens: unusedAuth`,
      );
    });

    it('loadToolset (strict): should fail if unused bound parameter in toolset', async () => {
      await expect(
        client.loadToolset('set', {}, {unused: '123'}, true),
      ).rejects.toThrow(
        /Validation failed for tool '.*': unused bound parameters: unused/,
      );
    });

    it('loadToolset (non-strict): should fail if bound param unused by ANY tool', async () => {
      // Here, p1 IS used by paramTool. So let's provide p1.
      // And an unused one.
      // Wait, non-strict means: throws only if the param is not used by ANY tool in the set.

      await expect(
        client.loadToolset('set', {}, {unusedGlobal: '123'}, false),
      ).rejects.toThrow(
        "Validation failed for toolset 'set': unused bound parameters could not be applied to any tool: unusedGlobal",
      );
    });

    it('loadToolset (non-strict): should fail if auth token unused by ANY tool', async () => {
      await expect(
        client.loadToolset('set', {unusedAuth: () => 'token'}, {}, false),
      ).rejects.toThrow(
        "Validation failed for toolset 'set': unused auth tokens could not be applied to any tool: unusedAuth",
      );
    });

    it('loadToolset (strict): should succeed when all inputs are used', async () => {
      // p1 used by bound params, authSvc used by auth token
      const tools = await client.loadToolset(
        'set',
        {authSvc: () => 'token'},
        {p1: 'val'},
        true,
      );
      expect(tools).toHaveLength(1);
    });

    it('loadToolset (strict): should fail if unused auth token in toolset', async () => {
      await expect(
        client.loadToolset('set', {unusedAuth: () => 'token'}, {}, true),
      ).rejects.toThrow(
        /Validation failed for tool '.*': unused auth tokens: unusedAuth/,
      );
    });
  });
});
