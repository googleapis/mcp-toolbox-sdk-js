// Copyright 2025 Google LLC
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

import {
  ToolboxClient,
  type ClientHeadersConfig,
  type ClientHeaderProvider,
} from '../src/toolbox_core/client';
import {ToolboxTool} from '../src/toolbox_core/tool';
import {
  ZodManifestSchema,
  createZodSchemaFromParams,
  type ZodManifest,
  ZodToolSchema,
  type ParameterSchema,
} from '../src/toolbox_core/protocol';
import {logApiError} from '../src/toolbox_core/errorUtils';

import axios, {
  AxiosInstance,
  AxiosResponse,
  type InternalAxiosRequestConfig,
  AxiosHeaders,
} from 'axios';
import {z, ZodRawShape, ZodObject, ZodTypeAny, ZodError} from 'zod';

// --- Helper Types ---
type OriginalToolboxToolType = typeof ToolboxTool;
type CallableToolReturnedByFactory = ReturnType<OriginalToolboxToolType>;
type InferredZodTool = z.infer<typeof ZodToolSchema>;
type AsyncHeaderFunction = () => Promise<string>;

const createMockZodObject = (
  shape: ZodRawShape = {}
): ZodObject<ZodRawShape, 'strip', ZodTypeAny> =>
  ({
    parse: jest.fn(args => args),
    _def: {
      typeName: 'ZodObject',
      shape: () => shape,
    },
    shape: shape,
    pick: jest.fn().mockReturnThis(),
    omit: jest.fn().mockReturnThis(),
    extend: jest.fn().mockReturnThis(),
  }) as unknown as ZodObject<ZodRawShape, 'strip', ZodTypeAny>;

// --- Mocking External Dependencies ---
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('../src/toolbox_core/tool', () => ({
  ToolboxTool: jest.fn(),
}));
const MockedToolboxToolFactory =
  ToolboxTool as jest.MockedFunction<OriginalToolboxToolType>;

jest.mock('../src/toolbox_core/protocol', () => {
  const actualProtocol = jest.requireActual('../src/toolbox_core/protocol');
  return {
    ...actualProtocol,
    ZodManifestSchema: {
      ...actualProtocol.ZodManifestSchema,
      parse: jest.fn(),
    },
    createZodSchemaFromParams: jest.fn(),
  };
});
const MockedZodManifestSchema = ZodManifestSchema as jest.Mocked<
  typeof ZodManifestSchema
>;
const MockedCreateZodSchemaFromParams =
  createZodSchemaFromParams as jest.MockedFunction<
    typeof createZodSchemaFromParams
  >;

jest.mock('../src/toolbox_core/errorUtils', () => ({
  logApiError: jest.fn(),
}));
const MockedLogApiError = logApiError as jest.MockedFunction<
  typeof logApiError
>;

describe('ToolboxClient', () => {
  const testBaseUrl = 'http://api.example.com';
  let mockSessionGet: jest.Mock;
  let capturedRequestInterceptorFunction:
    | ((
        config: InternalAxiosRequestConfig
      ) => Promise<InternalAxiosRequestConfig> | InternalAxiosRequestConfig)
    | null;

  let mockRequestInterceptorUse: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    capturedRequestInterceptorFunction = null;
    mockSessionGet = jest.fn();

    mockRequestInterceptorUse = jest.fn(onFulfilled => {
      capturedRequestInterceptorFunction = onFulfilled;
      return 1;
    });
    const mockRequestInterceptorEject = jest.fn();

    mockedAxios.create.mockImplementation((axiosConfig?: any) => {
      const instanceDefaults = {
        ...(axiosConfig || {}),
        headers: axiosConfig?.headers || {},
      };

      const sessionInstance = {
        defaults: instanceDefaults,
        interceptors: {
          request: {
            use: mockRequestInterceptorUse,
            eject: mockRequestInterceptorEject,
            handlers: [],
          },
          response: {use: jest.fn(), eject: jest.fn(), handlers: []},
        },
        get: jest.fn(
          async (url: string, config?: InternalAxiosRequestConfig) => {
            const fullUrl =
              url.startsWith('http://') || url.startsWith('https://')
                ? url
                : `${instanceDefaults.baseURL || ''}${url}`;

            const currentConfig: InternalAxiosRequestConfig = {
              ...instanceDefaults,
              ...(config || {}),
              headers: {
                ...(instanceDefaults.headers || {}),
                ...(config?.headers || {}),
              },
              url: fullUrl,
              method: 'get',
            };

            if (capturedRequestInterceptorFunction) {
              try {
                if (!currentConfig.headers) {
                  currentConfig.headers = new AxiosHeaders();
                }
                const processedConfig = await Promise.resolve(
                  capturedRequestInterceptorFunction(currentConfig)
                );
                return mockSessionGet(url, processedConfig);
              } catch (error) {
                return Promise.reject(error);
              }
            }
            return mockSessionGet(url, currentConfig);
          }
        ),
      } as unknown as AxiosInstance;
      return sessionInstance;
    });
  });

  describe('constructor', () => {
    it('should set baseUrl and create a new session if one is not provided', () => {
      const client = new ToolboxClient(testBaseUrl);
      expect((client as any)['_baseUrl']).toBe(testBaseUrl);
      expect(mockedAxios.create).toHaveBeenCalledTimes(1);
      expect(mockedAxios.create).toHaveBeenCalledWith({baseURL: testBaseUrl});
      expect((client as any)['_session'].get).toBeDefined();
      expect(mockRequestInterceptorUse).toHaveBeenCalledTimes(1);
    });

    it('should set baseUrl and use the provided session if one is given', () => {
      const providedSessionMockUse = jest.fn();
      const customMockSession = {
        get: jest.fn(),
        interceptors: {
          request: {
            use: providedSessionMockUse,
            eject: jest.fn(),
            handlers: [],
          },
          response: {use: jest.fn(), eject: jest.fn(), handlers: []},
        },
        defaults: {headers: {}},
      } as unknown as AxiosInstance;
      const client = new ToolboxClient(testBaseUrl, customMockSession);

      expect((client as any)['_baseUrl']).toBe(testBaseUrl);
      expect((client as any)['_session']).toBe(customMockSession);
      expect(mockedAxios.create).not.toHaveBeenCalled();
      expect(providedSessionMockUse).toHaveBeenCalledTimes(1);
    });

    it('should initialize with clientHeaders if provided', () => {
      const initialHeaders: ClientHeadersConfig = {
        'X-Test-Header': () => 'test-value',
      };
      const client = new ToolboxClient(testBaseUrl, null, initialHeaders);
      expect((client as any)['_clientHeaders']).toEqual(initialHeaders);
    });
  });

  describe('Header Interceptor Functionality', () => {
    it('should apply synchronous headers to requests', async () => {
      const syncHeaderProvider: ClientHeaderProvider = () => 'sync-value';
      const client = new ToolboxClient(testBaseUrl, null, {
        'X-Sync-Header': syncHeaderProvider,
      });
      mockSessionGet.mockResolvedValueOnce({data: 'success'} as AxiosResponse);

      await (client as any)['_session'].get('/test-endpoint');

      expect(mockSessionGet).toHaveBeenCalled();
      const lastCallConfig = mockSessionGet.mock.calls[0][1] || {};
      expect(lastCallConfig.headers['X-Sync-Header']).toBe('sync-value');
    });

    it('should apply and await asynchronous headers to requests', async () => {
      const asyncHeaderProvider: ClientHeaderProvider = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async-value';
      };
      const client = new ToolboxClient(testBaseUrl, null, {
        'X-Async-Header': asyncHeaderProvider,
      });
      mockSessionGet.mockResolvedValueOnce({data: 'success'} as AxiosResponse);

      await (client as any)['_session'].get('/test-endpoint');

      expect(mockSessionGet).toHaveBeenCalled();
      const lastCallConfig = mockSessionGet.mock.calls[0][1] || {};
      expect(lastCallConfig.headers['X-Async-Header']).toBe('async-value');
    });
  });

  describe('loadTool', () => {
    const toolName = 'calculator';
    const expectedApiUrl = `${testBaseUrl}/api/tool/${toolName}`;
    let client: ToolboxClient;

    beforeEach(() => {
      client = new ToolboxClient(testBaseUrl);
    });

    const setupMocksForSuccessfulLoad = (
      toolDefinition: InferredZodTool,
      overrides: {
        manifestData?: Partial<ZodManifest>;
        zodParamsSchema?: ZodObject<ZodRawShape, 'strip', ZodTypeAny>;
        toolInstance?: Partial<CallableToolReturnedByFactory>;
      } = {}
    ) => {
      const manifestData: ZodManifest = {
        serverVersion: '1.0.0',
        tools: {[toolName]: toolDefinition},
        ...overrides.manifestData,
      } as ZodManifest;

      const zodParamsSchema =
        overrides.zodParamsSchema ||
        createMockZodObject(
          toolDefinition.parameters.reduce(
            (shape: ZodRawShape, param: ParameterSchema) => {
              shape[param.name] = {
                _def: {typeName: 'ZodString'},
              } as ZodTypeAny;
              return shape;
            },
            {}
          )
        );

      const defaultMockCallable = jest
        .fn()
        .mockResolvedValue({result: 'mock tool execution'});
      const defaultToolInstance = Object.assign(defaultMockCallable, {
        toolName: toolName,
        description: toolDefinition.description,
        params: zodParamsSchema,
        getName: jest.fn().mockReturnValue(toolName),
        getDescription: jest.fn().mockReturnValue(toolDefinition.description),
        getParamSchema: jest.fn().mockReturnValue(zodParamsSchema),
        boundParams: {},
        bindParams: jest.fn().mockReturnThis(),
        bindParam: jest.fn().mockReturnThis(),
      }) as CallableToolReturnedByFactory; // Ensure the base mock conforms

      // toolInstance should be the callable function with properties.
      const toolInstance: CallableToolReturnedByFactory = defaultToolInstance;

      mockSessionGet.mockResolvedValueOnce({data: manifestData});
      MockedZodManifestSchema.parse.mockReturnValueOnce(manifestData);
      MockedCreateZodSchemaFromParams.mockReturnValueOnce(zodParamsSchema);
      MockedToolboxToolFactory.mockReturnValueOnce(
        toolInstance as CallableToolReturnedByFactory
      );
      return {manifestData, zodParamsSchema, toolInstance};
    };

    it('should successfully load a tool with valid manifest and API response', async () => {
      const mockToolDefinition: InferredZodTool = {
        description: 'Performs calculations',
        parameters: [
          {name: 'expression', type: 'string', description: 'Math expression'},
        ] as ParameterSchema[],
        authRequired: [],
      };
      const {zodParamsSchema, toolInstance, manifestData} =
        setupMocksForSuccessfulLoad(mockToolDefinition);
      const loadedTool = await client.loadTool(toolName);

      expect(mockSessionGet).toHaveBeenCalledWith(
        expectedApiUrl,
        expect.anything()
      );
      expect(MockedZodManifestSchema.parse).toHaveBeenCalledWith(manifestData);
      expect(MockedCreateZodSchemaFromParams).toHaveBeenCalledWith(
        mockToolDefinition.parameters
      );
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        (client as any)['_session'],
        testBaseUrl,
        toolName,
        mockToolDefinition.description,
        zodParamsSchema,
        {}
      );
      expect(loadedTool).toBe(toolInstance);
    });

    it('should successfully load a tool with valid bound parameters', async () => {
      const mockToolDefinition: InferredZodTool = {
        description: 'Performs calculations',
        parameters: [
          {name: 'expression', type: 'string', description: 'Math expression'},
          {name: 'precision', type: 'number', description: 'Decimal places'},
        ] as ParameterSchema[],
      };
      const boundParams = {expression: '2+2'};
      setupMocksForSuccessfulLoad(mockToolDefinition);

      await client.loadTool(toolName, boundParams);

      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        boundParams
      );
    });

    it('should throw an error if unused bound parameters are provided', async () => {
      const mockToolDefinition: InferredZodTool = {
        description: 'A tool',
        parameters: [{name: 'param1', type: 'string'}] as ParameterSchema[],
      };
      const boundParams = {param1: 'value1', unusedParam: 'value2'};
      setupMocksForSuccessfulLoad(mockToolDefinition);

      await expect(client.loadTool(toolName, boundParams)).rejects.toThrow(
        `Validation failed for tool '${toolName}': unused bound parameters: unusedParam.`
      );
    });

    it('should throw an error if manifest parsing fails', async () => {
      const mockZodError = new Error('Zod validation failed on manifest');
      mockSessionGet.mockResolvedValueOnce({data: {invalid: 'structure'}});
      MockedZodManifestSchema.parse.mockImplementationOnce(() => {
        throw mockZodError;
      });

      await expect(client.loadTool(toolName)).rejects.toThrow(
        `Invalid manifest structure received from ${expectedApiUrl}: ${mockZodError.message}`
      );
    });

    it('should throw an error if the specific tool is not found in manifest.tools', async () => {
      const mockManifest = {
        serverVersion: '1.0.0',
        tools: {
          anotherTool: {description: 'A different tool', parameters: []},
        },
      } as ZodManifest;
      mockSessionGet.mockResolvedValueOnce({data: mockManifest});
      MockedZodManifestSchema.parse.mockReturnValueOnce(mockManifest);

      await expect(client.loadTool(toolName)).rejects.toThrow(
        `Tool "${toolName}" not found in manifest from /api/tool/${toolName}.`
      );
    });

    it('should throw and log error if API GET request fails', async () => {
      const apiError = new Error('Server-side issue');
      mockSessionGet.mockRejectedValueOnce(apiError);

      await expect(client.loadTool(toolName)).rejects.toThrow(apiError);
      expect(MockedLogApiError).toHaveBeenCalledWith(
        `Error fetching data from ${expectedApiUrl}:`,
        apiError
      );
    });
  });

  describe('loadToolset', () => {
    let client: ToolboxClient;

    beforeEach(() => {
      client = new ToolboxClient(testBaseUrl);
    });

    const setupMocksForSuccessfulToolsetLoad = (
      toolDefinitions: Record<string, InferredZodTool>,
      manifestDataOverride?: ZodManifest
    ) => {
      const manifestData: ZodManifest = manifestDataOverride || {
        serverVersion: '1.0.0',
        tools: toolDefinitions,
      };

      const zodParamsSchemas: Record<string, ZodObject<any>> = {};
      const toolInstances: Record<string, CallableToolReturnedByFactory> = {};
      const orderedToolNames = Object.keys(toolDefinitions);

      orderedToolNames.forEach(tName => {
        const tDef = toolDefinitions[tName];
        zodParamsSchemas[tName] = createMockZodObject(
          tDef.parameters.reduce((acc: ZodRawShape, p) => {
            acc[p.name] = {_def: {typeName: 'ZodString'}} as ZodTypeAny;
            return acc;
          }, {})
        );

        const mockCallable = jest.fn().mockResolvedValue({result: 'done'});
        toolInstances[tName] = Object.assign(mockCallable, {
          toolName: tName,
          description: tDef.description,
          params: zodParamsSchemas[tName],
          getName: () => tName,
          getDescription: () => tDef.description,
          getParamSchema: () => zodParamsSchemas[tName],
          boundParams: {},
          bindParams: jest.fn().mockReturnThis(),
          bindParam: jest.fn().mockReturnThis(),
        }) as CallableToolReturnedByFactory;
      });

      mockSessionGet.mockResolvedValueOnce({data: manifestData});
      MockedZodManifestSchema.parse.mockReturnValueOnce(manifestData);
      orderedToolNames.forEach(tName => {
        MockedCreateZodSchemaFromParams.mockReturnValueOnce(
          zodParamsSchemas[tName]
        );
      });

      let callCount = 0;
      MockedToolboxToolFactory.mockImplementation(() => {
        const toolName = orderedToolNames[callCount++];
        return toolInstances[toolName];
      });

      return {toolInstances, manifestData, zodParamsSchemas};
    };

    it('should successfully load a toolset with multiple tools', async () => {
      const toolsetName = 'my-toolset';
      const mockTools: Record<string, InferredZodTool> = {
        toolA: {
          description: 'A',
          parameters: [{name: 'paramA', type: 'string'} as ParameterSchema],
        },
        toolB: {
          description: 'B',
          parameters: [{name: 'paramB', type: 'integer'} as ParameterSchema],
        },
      };

      const {toolInstances, zodParamsSchemas} =
        setupMocksForSuccessfulToolsetLoad(mockTools);
      const loadedTools = await client.loadToolset(toolsetName);

      expect(MockedToolboxToolFactory).toHaveBeenCalledTimes(2);
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        (client as any)['_session'],
        testBaseUrl,
        'toolA',
        'A',
        zodParamsSchemas.toolA,
        {}
      );
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        (client as any)['_session'],
        testBaseUrl,
        'toolB',
        'B',
        zodParamsSchemas.toolB,
        {}
      );
      expect(loadedTools).toEqual(Object.values(toolInstances));
    });

    it('should successfully load a toolset with applicable bound parameters', async () => {
      const mockTools: Record<string, InferredZodTool> = {
        toolA: {
          description: 'A',
          parameters: [{name: 'paramA', type: 'string'} as ParameterSchema],
        },
        toolB: {
          description: 'B',
          parameters: [{name: 'paramB', type: 'integer'} as ParameterSchema],
        },
      };
      const boundParams = {paramA: 'valA', paramB: 123};
      setupMocksForSuccessfulToolsetLoad(mockTools);

      await client.loadToolset('my-toolset', boundParams);

      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'toolA',
        expect.anything(),
        expect.anything(),
        boundParams
      );
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'toolB',
        expect.anything(),
        expect.anything(),
        boundParams
      );
    });

    it('should throw an error if bound parameters cannot be applied to any tool', async () => {
      const mockTools: Record<string, InferredZodTool> = {
        toolA: {
          description: 'A',
          parameters: [{name: 'paramA', type: 'string'} as ParameterSchema],
        },
      };
      const boundParams = {unused: 'value'};
      setupMocksForSuccessfulToolsetLoad(mockTools);

      await expect(
        client.loadToolset('my-toolset', boundParams)
      ).rejects.toThrow(
        "Validation failed for toolset 'my-toolset': unused bound parameters could not be applied to any tool: unused."
      );
    });

    it('should request the default toolset if no name is provided', async () => {
      const expectedApiUrl = `${testBaseUrl}/api/toolset/`;
      setupMocksForSuccessfulToolsetLoad({});
      await client.loadToolset();
      expect(mockSessionGet).toHaveBeenLastCalledWith(
        expectedApiUrl,
        expect.anything()
      );
    });

    it('should throw and log error if API GET request for toolset fails', async () => {
      const toolsetName = 'api-error-set';
      const expectedApiUrl = `${testBaseUrl}/api/toolset/${toolsetName}`;
      const apiError = new Error('Toolset API unavailable');
      mockSessionGet.mockRejectedValueOnce(apiError);

      await expect(client.loadToolset(toolsetName)).rejects.toThrow(apiError);
      expect(MockedLogApiError).toHaveBeenCalledWith(
        `Error fetching data from ${expectedApiUrl}:`,
        apiError
      );
    });
  });
});
