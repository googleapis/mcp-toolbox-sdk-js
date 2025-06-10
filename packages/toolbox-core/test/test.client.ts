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
      ...actualProtocol.ZodManifestSchema, // Preserve other schema properties
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
  let consoleErrorSpy: jest.SpyInstance;
  let mockSessionGet: jest.Mock;
  let capturedRequestInterceptorFunction:
    | ((
        config: InternalAxiosRequestConfig
      ) => Promise<InternalAxiosRequestConfig> | InternalAxiosRequestConfig)
    | null;

  // Mocks for the interceptor manager's methods
  let mockRequestInterceptorUse: jest.Mock;
  let mockRequestInterceptorEject: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    capturedRequestInterceptorFunction = null;

    mockSessionGet = jest.fn();
    mockRequestInterceptorUse = jest.fn(onFulfilled => {
      capturedRequestInterceptorFunction = onFulfilled;
      return 1;
    });
    mockRequestInterceptorEject = jest.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // Prepare the config Axios would pass to interceptors
        get: jest.fn(
          async (url: string, config?: InternalAxiosRequestConfig) => {
            const isAbsoluteUrl =
              url.startsWith('http://') || url.startsWith('https://');
            const fullUrl = isAbsoluteUrl
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
                if (
                  !currentConfig.headers ||
                  currentConfig.headers === undefined ||
                  currentConfig.headers === null
                ) {
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

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set baseUrl and create a new session if one is not provided', () => {
      const client = new ToolboxClient(testBaseUrl);
      expect(client['_baseUrl']).toBe(testBaseUrl);
      expect(mockedAxios.create).toHaveBeenCalledTimes(1);
      expect(mockedAxios.create).toHaveBeenCalledWith({baseURL: testBaseUrl});
      expect(client['_session'].get).toBeDefined();
      expect(mockRequestInterceptorUse).toHaveBeenCalledTimes(1);
      expect(mockRequestInterceptorUse).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should set baseUrl and use the provided session if one is given', () => {
      const providedSessionMockUse = jest.fn();
      const providedSessionMockEject = jest.fn();
      const customMockSession = {
        get: jest.fn(),
        interceptors: {
          request: {
            use: providedSessionMockUse,
            eject: providedSessionMockEject,
            handlers: [],
          },
          response: {use: jest.fn(), eject: jest.fn(), handlers: []},
        },
        defaults: {headers: {}},
      } as unknown as AxiosInstance;

      const client = new ToolboxClient(testBaseUrl, customMockSession);

      expect(client['_baseUrl']).toBe(testBaseUrl);
      expect(client['_session']).toBe(customMockSession);
      expect(mockedAxios.create).not.toHaveBeenCalled();
      expect(providedSessionMockUse).toHaveBeenCalledTimes(1);
      expect(providedSessionMockUse).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should initialize with clientHeaders if provided', () => {
      const initialHeaders: ClientHeadersConfig = {
        'X-Test-Header': () => 'test-value',
      };
      const client = new ToolboxClient(testBaseUrl, null, initialHeaders);
      expect(client['_clientHeaders']).toEqual(initialHeaders);
    });

    it('should apply header interceptor on construction', () => {
      const client = new ToolboxClient(testBaseUrl);
      expect(client['_session'].interceptors.request.use).toHaveBeenCalledTimes(
        1
      );
      expect(client['_session'].interceptors.request.use).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function)
      );
    });
  });

  describe('addHeaders', () => {
    let client: ToolboxClient;

    beforeEach(() => {
      client = new ToolboxClient(testBaseUrl);
    });

    it('should add new headers to _clientHeaders', () => {
      const headers1: ClientHeadersConfig = {'X-Header-1': () => 'value1'};
      client.addHeaders(headers1);
      expect(client['_clientHeaders']).toEqual(headers1);

      const headers2: ClientHeadersConfig = {
        'X-Header-2': async () => 'value2',
      };
      client.addHeaders(headers2);
      expect(client['_clientHeaders']).toEqual({...headers1, ...headers2});
    });

    it('should throw an error if adding a duplicate header name', () => {
      const headers: ClientHeadersConfig = {'X-Duplicate': () => 'value1'};
      client.addHeaders(headers);
      expect(() => client.addHeaders(headers)).toThrow(
        'Client header(s) `X-Duplicate` already registered in the client.'
      );
    });

    it('should throw an error if adding multiple headers with one duplicate', () => {
      client.addHeaders({'X-Existing': () => 'value'});
      const newHeaders: ClientHeadersConfig = {
        'X-New': () => 'new_value',
        'X-Existing': () => 'another_value', // Duplicate
      };
      expect(() => client.addHeaders(newHeaders)).toThrow(
        'Client header(s) `X-Existing` already registered in the client.'
      );
      // Ensure non-duplicate headers were not added
      expect(client['_clientHeaders']['X-New']).toBeUndefined();
    });
  });

  describe('Header Interceptor Functionality', () => {
    let client: ToolboxClient;
    const mockUrl = '/test-endpoint';

    beforeEach(() => {});

    it('should apply synchronous headers from _clientHeaders to requests', async () => {
      const syncHeaderProvider: ClientHeaderProvider = () => 'sync-value';
      client = new ToolboxClient(testBaseUrl, null, {
        'X-Sync-Header': syncHeaderProvider,
      });
      mockSessionGet.mockResolvedValueOnce({data: 'success'} as AxiosResponse);

      await client['_session'].get(mockUrl);

      expect(mockSessionGet).toHaveBeenCalled();
      const lastCallConfig = mockSessionGet.mock.calls[0][1] || {};
      expect(lastCallConfig.headers['X-Sync-Header']).toBe('sync-value');
    });

    it('should apply and await asynchronous headers from _clientHeaders to requests', async () => {
      const asyncHeaderProvider: ClientHeaderProvider = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async-value';
      };
      client = new ToolboxClient(testBaseUrl, null, {
        'X-Async-Header': asyncHeaderProvider,
      });
      mockSessionGet.mockResolvedValueOnce({data: 'success'} as AxiosResponse);

      await client['_session'].get(mockUrl); // Make a request

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
            (shapeAccumulator: ZodRawShape, param: ParameterSchema) => {
              shapeAccumulator[param.name] = {
                _def: {typeName: 'ZodString'},
              } as unknown as ZodTypeAny;
              return shapeAccumulator;
            },
            {} as ZodRawShape
          )
        );

      const defaultMockCallable = jest
        .fn()
        .mockResolvedValue({result: 'mock tool execution'});
      const defaultToolInstance: CallableToolReturnedByFactory = Object.assign(
        defaultMockCallable,
        {
          toolName: toolName,
          description: toolDefinition.description,
          params: zodParamsSchema,
          getName: jest.fn().mockReturnValue(toolName),
          getDescription: jest.fn().mockReturnValue(toolDefinition.description),
          getParamSchema: jest.fn().mockReturnValue(zodParamsSchema),
          boundParams: {},
          bindParams: jest.fn().mockReturnThis(),
          bindParam: jest.fn().mockReturnThis(),
          authTokenGetters: {},
          requiredAuthnParams: {},
          requiredAuthzTokens: [],
          addAuthTokenGetters: jest.fn().mockReturnThis(),
          addAuthTokenGetter: jest.fn().mockReturnThis(),
        }
      );

      const toolInstance = overrides.toolInstance
        ? {...defaultToolInstance, ...overrides.toolInstance}
        : defaultToolInstance;

      mockSessionGet.mockResolvedValueOnce({
        data: manifestData,
      } as AxiosResponse);
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
        client['_session'],
        testBaseUrl,
        toolName,
        mockToolDefinition.description,
        zodParamsSchema,
        {}, // Bound params
        {}, // authTokenGetters
        {}, // requiredAuthnParams
        [] // requiredAuthzTokens
      );
      expect(loadedTool).toBe(toolInstance);
    });

    it('should successfully load a tool with valid bound parameters', async () => {
      const mockToolDefinition = {
        description: 'Performs calculations',
        parameters: [
          {
            name: 'expression',
            type: 'string' as const,
            description: 'Math expression',
          },
          {
            name: 'precision',
            type: 'integer' as const,
            description: 'Decimal places',
          },
        ] as ParameterSchema[], // Ensure this cast is correct based on actual structure
      };
      const boundParams = {expression: '2+2'};
      setupMocksForSuccessfulLoad(mockToolDefinition);

      await client.loadTool(toolName, {}, boundParams);

      // Assert that the factory was called with the applicable bound parameters
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        boundParams, // boundParams
        {}, // authTokenGetters
        {}, // requiredAuthnParams
        [] // requiredAuthzTokens
      );
    });

    it('should throw an error if unused bound parameters are provided', async () => {
      const mockToolDefinition = {
        description: 'A tool',
        parameters: [
          {
            name: 'param1',
            type: 'string' as const,
            description: 'A param',
          },
        ] as ParameterSchema[],
        authRequired: [],
      };
      const boundParams = {param1: 'value1', unusedParam: 'value2'};
      setupMocksForSuccessfulLoad(mockToolDefinition);

      await expect(client.loadTool(toolName, {}, boundParams)).rejects.toThrow(
        `Validation failed for tool '${toolName}': unused bound parameters: unusedParam.`
      );
    });

    it('should throw an error if manifest parsing fails', async () => {
      const mockApiResponseData = {invalid: 'manifest structure'};
      const mockZodError = new Error('Zod validation failed on manifest');

      mockSessionGet.mockResolvedValueOnce({
        data: mockApiResponseData,
      } as AxiosResponse);
      MockedZodManifestSchema.parse.mockImplementationOnce(() => {
        throw mockZodError;
      });

      await expect(client.loadTool(toolName)).rejects.toThrow(
        `Invalid manifest structure received from ${expectedApiUrl}: ${mockZodError.message}`
      );
      expect(MockedCreateZodSchemaFromParams).not.toHaveBeenCalled();
      expect(MockedToolboxToolFactory).not.toHaveBeenCalled();
    });

    it('should throw an error if manifest.tools key is missing', async () => {
      const mockManifestWithoutTools = {serverVersion: '1.0.0'};

      mockSessionGet.mockResolvedValueOnce({
        data: mockManifestWithoutTools,
      } as AxiosResponse);
      MockedZodManifestSchema.parse.mockReturnValueOnce(
        mockManifestWithoutTools as unknown as ZodManifest
      );

      await expect(client.loadTool(toolName)).rejects.toThrow(
        `Tool "${toolName}" not found in manifest from /api/tool/${toolName}.`
      );
      expect(MockedCreateZodSchemaFromParams).not.toHaveBeenCalled();
      expect(MockedToolboxToolFactory).not.toHaveBeenCalled();
    });

    it('should throw an error if the specific tool is not found in manifest.tools', async () => {
      const mockManifestWithOtherTools = {
        serverVersion: '1.0.0',
        tools: {
          anotherTool: {
            description: 'A different tool',
            parameters: [] as ParameterSchema[],
            authRequired: [],
          },
        },
      } as ZodManifest;
      mockSessionGet.mockResolvedValueOnce({
        data: mockManifestWithOtherTools,
      } as AxiosResponse);
      MockedZodManifestSchema.parse.mockReturnValueOnce(
        mockManifestWithOtherTools
      );
      await expect(client.loadTool(toolName)).rejects.toThrow(
        `Tool "${toolName}" not found in manifest from /api/tool/${toolName}.`
      );
      expect(MockedCreateZodSchemaFromParams).not.toHaveBeenCalled();
      expect(MockedToolboxToolFactory).not.toHaveBeenCalled();
    });

    it('should throw and log error if API GET request fails', async () => {
      const apiError = new Error('Server-side issue');
      mockSessionGet.mockRejectedValueOnce(apiError);

      await expect(client.loadTool(toolName)).rejects.toThrow(apiError);
      expect(mockSessionGet).toHaveBeenCalledWith(
        expectedApiUrl,
        expect.anything()
      );
      expect(MockedLogApiError).toHaveBeenCalledWith(
        `Error fetching data from ${expectedApiUrl}:`,
        apiError
      );
      expect(MockedZodManifestSchema.parse).not.toHaveBeenCalled();
    });
  });

  // --- loadToolset Tests ---
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

      const zodParamsSchemas: Record<
        string,
        ZodObject<ZodRawShape, 'strip', ZodTypeAny>
      > = {};
      const toolInstances: Record<string, CallableToolReturnedByFactory> = {};
      const orderedToolNames = Object.keys(toolDefinitions);

      orderedToolNames.forEach(tName => {
        const tDef = toolDefinitions[tName];
        zodParamsSchemas[tName] = createMockZodObject(
          tDef.parameters.reduce((acc: ZodRawShape, p) => {
            acc[p.name] = {
              _def: {typeName: 'ZodString'},
            } as unknown as ZodTypeAny;
            return acc;
          }, {})
        );

        const mockCallable = jest
          .fn()
          .mockResolvedValue({result: `${tName} executed`});
        toolInstances[tName] = Object.assign(mockCallable, {
          toolName: tName,
          description: tDef.description,
          params: zodParamsSchemas[tName],
          getName: jest.fn().mockReturnValue(tName),
          getDescription: jest.fn().mockReturnValue(tDef.description),
          getParamSchema: jest.fn().mockReturnValue(zodParamsSchemas[tName]),
          boundParams: {},
          bindParams: jest.fn().mockReturnThis(),
          bindParam: jest.fn().mockReturnThis(),
          authTokenGetters: {},
          requiredAuthnParams: {},
          requiredAuthzTokens: [],
          addAuthTokenGetters: jest.fn().mockReturnThis(),
          addAuthTokenGetter: jest.fn().mockReturnThis(),
        });
      });

      mockSessionGet.mockResolvedValueOnce({
        data: manifestData,
      } as AxiosResponse);
      MockedZodManifestSchema.parse.mockReturnValueOnce(manifestData);

      orderedToolNames.forEach(tName => {
        MockedCreateZodSchemaFromParams.mockReturnValueOnce(
          zodParamsSchemas[tName]
        );
      });

      let factoryCallCount = 0;
      MockedToolboxToolFactory.mockImplementation(() => {
        const currentToolName = orderedToolNames[factoryCallCount];
        factoryCallCount++;
        if (currentToolName && toolInstances[currentToolName]) {
          return toolInstances[currentToolName];
        }
        const fallbackCallable = jest.fn();
        return Object.assign(fallbackCallable, {
          toolName: 'fallback',
        }) as unknown as CallableToolReturnedByFactory;
      });

      return {manifestData, zodParamsSchemas, toolInstances};
    };

    it('should successfully load a toolset with multiple tools', async () => {
      const toolsetName = 'my-toolset';
      const expectedApiUrl = `${testBaseUrl}/api/toolset/${toolsetName}`;
      const mockToolDefinitions: Record<string, InferredZodTool> = {
        toolA: {
          description: 'Tool A description',
          parameters: [
            {
              name: 'paramA',
              type: 'string',
              description: 'Param A',
            } as ParameterSchema,
          ],
          authRequired: [],
        },
        toolB: {
          description: 'Tool B description',
          parameters: [
            {
              name: 'paramB',
              type: 'integer',
              description: 'Param B',
            } as ParameterSchema,
          ],
          authRequired: [],
        },
      };

      const {toolInstances, manifestData, zodParamsSchemas} =
        setupMocksForSuccessfulToolsetLoad(mockToolDefinitions);
      const loadedTools = await client.loadToolset(toolsetName);

      expect(mockSessionGet).toHaveBeenCalledWith(
        expectedApiUrl,
        expect.anything()
      );
      expect(MockedZodManifestSchema.parse).toHaveBeenCalledWith(manifestData);

      expect(MockedCreateZodSchemaFromParams).toHaveBeenCalledWith(
        mockToolDefinitions.toolA.parameters
      );
      expect(MockedCreateZodSchemaFromParams).toHaveBeenCalledWith(
        mockToolDefinitions.toolB.parameters
      );
      expect(MockedToolboxToolFactory).toHaveBeenCalledTimes(2);
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        client['_session'],
        testBaseUrl,
        'toolA',
        mockToolDefinitions.toolA.description,
        zodParamsSchemas.toolA,
        {}, // boundParams
        {}, // authTokenGetters
        {}, // requiredAuthnParams
        [] // requiredAuthzTokens
      );
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        client['_session'],
        testBaseUrl,
        'toolB',
        mockToolDefinitions.toolB.description,
        zodParamsSchemas.toolB,
        {}, // boundParams
        {}, // authTokenGetters
        {}, // requiredAuthnParams
        [] // requiredAuthzTokens
      );
      expect(loadedTools).toEqual(
        expect.arrayContaining([toolInstances.toolA, toolInstances.toolB])
      );
      expect(loadedTools.length).toBe(2);
    });

    it('should successfully load a toolset with bound parameters applicable to its tools', async () => {
      const toolsetName = 'my-toolset';
      const mockToolDefinitions: Record<string, InferredZodTool> = {
        toolA: {
          description: 'Tool A',
          parameters: [{name: 'paramA', type: 'string'} as ParameterSchema],
        },
        toolB: {
          description: 'Tool B',
          parameters: [{name: 'paramB', type: 'integer'} as ParameterSchema],
        },
      };
      const boundParams = {paramA: 'valueA', paramB: 123};

      setupMocksForSuccessfulToolsetLoad(mockToolDefinitions);
      await client.loadToolset(toolsetName, {}, boundParams);

      expect(MockedToolboxToolFactory).toHaveBeenCalledTimes(2);
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'toolA',
        expect.anything(),
        expect.anything(),
        {paramA: 'valueA'}, // Only boundParams applicable to toolA
        {}, // authTokenGetters
        {}, // requiredAuthnParams
        [] // requiredAuthzTokens
      );
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'toolB',
        expect.anything(),
        expect.anything(),
        {paramB: 123}, // Only boundParams applicable to toolB
        {}, // authTokenGetters
        {}, // requiredAuthnParams
        [] // requiredAuthzTokens
      );
    });

    it('should throw an error if bound parameters cannot be applied to any tool in the set', async () => {
      const toolsetName = 'my-toolset';
      const mockToolDefinitions: Record<string, InferredZodTool> = {
        toolA: {
          description: 'Tool A',
          parameters: [
            {name: 'paramA', type: 'string' as const} as ParameterSchema,
          ],
        },
      };
      const boundParams = {paramA: 'valueA', unusedParam: 'value2'};

      setupMocksForSuccessfulToolsetLoad(mockToolDefinitions);

      await expect(
        client.loadToolset(toolsetName, {}, boundParams)
      ).rejects.toThrow(
        `Validation failed for toolset '${toolsetName}': unused bound parameters could not be applied to any tool: unusedParam.`
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

      mockSessionGet.mockReset();
      MockedZodManifestSchema.parse.mockReset();
      MockedCreateZodSchemaFromParams.mockReset();
      MockedToolboxToolFactory.mockReset();

      setupMocksForSuccessfulToolsetLoad({});
      await client.loadToolset();
      expect(mockSessionGet).toHaveBeenLastCalledWith(
        expectedApiUrl,
        expect.anything()
      );
    });

    it('should return an empty array if the manifest contains no tools', async () => {
      const toolsetName = 'empty-set';
      const manifestWithNoTools: ZodManifest = {
        serverVersion: '1.0.0',
        tools: {},
      };
      setupMocksForSuccessfulToolsetLoad({}, manifestWithNoTools);

      const loadedTools = await client.loadToolset(toolsetName);

      expect(loadedTools).toEqual([]);
      expect(MockedCreateZodSchemaFromParams).not.toHaveBeenCalled();
      expect(MockedToolboxToolFactory).not.toHaveBeenCalled();
    });

    it('should throw an error if manifest parsing fails for toolset', async () => {
      const toolsetName = 'bad-manifest-set';
      const expectedApiUrlForToolset = `${testBaseUrl}/api/toolset/${toolsetName}`;
      const mockApiResponseData = {invalid: 'toolset structure'};
      const mockZodError = new ZodError([
        {
          path: ['serverVersion'],
          message: 'Zod validation failed on toolset',
          code: 'custom',
        },
      ]);

      mockSessionGet.mockResolvedValueOnce({
        data: mockApiResponseData,
      } as AxiosResponse);
      MockedZodManifestSchema.parse.mockImplementationOnce(() => {
        throw mockZodError;
      });

      await expect(client.loadToolset(toolsetName)).rejects.toThrow(
        `Invalid manifest structure received from ${expectedApiUrlForToolset}: ${mockZodError.message}`
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
