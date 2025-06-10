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

import {ToolboxClient} from '../src/toolbox_core/client';
import {ToolboxTool} from '../src/toolbox_core/tool';
import {
  ZodManifestSchema,
  createZodSchemaFromParams,
  type ZodManifest,
  ZodToolSchema,
  type ParameterSchema,
} from '../src/toolbox_core/protocol';
import {logApiError} from '../src/toolbox_core/errorUtils';
import {identifyAuthRequirements} from '../src/toolbox_core/utils.js';

import axios, {AxiosInstance, AxiosResponse} from 'axios';
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

jest.mock('../src/toolbox_core/utils.js');
const mockedIdentifyAuthRequirements = identifyAuthRequirements as jest.Mock;

describe('ToolboxClient', () => {
  const testBaseUrl = 'http://api.example.com';
  let mockSessionGet: jest.Mock;
  let autoCreatedSession: AxiosInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    mockedIdentifyAuthRequirements.mockReturnValue([{}, [], new Set()]); // Default mock
    mockSessionGet = jest.fn();

    autoCreatedSession = {
      get: mockSessionGet,
    } as unknown as AxiosInstance;

    mockedAxios.create.mockReturnValue(autoCreatedSession);
  });

  describe('constructor', () => {
    it('should create a new session if one is not provided', () => {
      new ToolboxClient(testBaseUrl);
      expect(mockedAxios.create).toHaveBeenCalledTimes(1);
      expect(mockedAxios.create).toHaveBeenCalledWith({baseURL: testBaseUrl});
    });

    it('should use the provided session if one is given', () => {
      const customMockSession = {
        get: jest.fn(),
      } as unknown as AxiosInstance;
      new ToolboxClient(testBaseUrl, customMockSession);

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

  });

    });

    it('should reject if a header provider function throws an error', async () => {
      const erroringHeaderProvider: ClientHeaderProvider = () => {
        throw new Error('Header provider failed');
      };
      client = new ToolboxClient(testBaseUrl, null, {
        'X-Error-Header': erroringHeaderProvider,
      });

      await expect(client['_session'].get(mockUrl)).rejects.toThrow(
        'Header provider failed'
      );
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
      };

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
      MockedToolboxToolFactory.mockReturnValueOnce(toolInstance);
      return {manifestData, zodParamsSchema, toolInstance};
    };

    it('should successfully load a tool with valid manifest and API response', async () => {
      const mockToolDefinition: InferredZodTool = {
        description: 'Performs calculations',
        parameters: [
          {name: 'expression', type: 'string', description: 'Math expression'},
        ] as ParameterSchema[],
      };
      const {zodParamsSchema, toolInstance, manifestData} =
        setupMocksForSuccessfulLoad(mockToolDefinition);
      const loadedTool = await client.loadTool(toolName);

      expect(mockSessionGet).toHaveBeenCalledWith(expectedApiUrl, {
        headers: {},
      });
      expect(MockedZodManifestSchema.parse).toHaveBeenCalledWith(manifestData);
      expect(MockedCreateZodSchemaFromParams).toHaveBeenCalledWith(
        mockToolDefinition.parameters
      );
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        autoCreatedSession,
        testBaseUrl,
        toolName,
        mockToolDefinition.description,
        zodParamsSchema,
        {}, // Bound params
        {}, // authTokenGetters
        {}, // requiredAuthnParams
        [] // requiredAuthzTokens
        {} // clientHeaders
      );
      expect(loadedTool).toBe(toolInstance);
    });

    it('should correctly handle tools requiring authentication', async () => {
      const mockToolDefinition: InferredZodTool = {
        description: 'An authenticated tool',
        parameters: [
          {
            name: 'authToken',
            type: 'string',
            description: 'Auth token',
            authSources: ['my_auth_service'],
          },
        ],
        authRequired: [],
      };
      const authTokenGetters = {my_auth_service: () => 'token123'};
      setupMocksForSuccessfulLoad(mockToolDefinition);
      mockedIdentifyAuthRequirements.mockReturnValueOnce([
        {},
        [],
        new Set(['my_auth_service']),
      ]);

      await client.loadTool(toolName, authTokenGetters, {});

      expect(mockedIdentifyAuthRequirements).toHaveBeenCalledWith(
        {authToken: ['my_auth_service']},
        [],
        ['my_auth_service']
      );
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        {},
        authTokenGetters,
        {},
        []
      );
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

      await client.loadTool(toolName, {}, boundParams);

      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        boundParams,
        {},
        {},
        []
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

    it('should throw an error if unused auth token getters are provided', async () => {
      const mockToolDefinition: InferredZodTool = {
        description: 'A tool that does not need auth',
        parameters: [],
        authRequired: [],
      };
      const authTokenGetters = {unused_auth: () => 'token'};
      setupMocksForSuccessfulLoad(mockToolDefinition);
      mockedIdentifyAuthRequirements.mockReturnValueOnce([{}, [], new Set()]);

      await expect(
        client.loadTool(toolName, authTokenGetters, {})
      ).rejects.toThrow(
        `Validation failed for tool '${toolName}': unused auth tokens: unused_auth.`
      );
    });

    it('should throw an error if manifest parsing fails', async () => {
      const mockApiResponseData = {invalid: 'manifest structure'};
      const mockZodError = new Error('Zod validation failed on manifest');

      await client.loadTool(toolName, boundParams);

      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        autoCreatedSession,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        boundParams,
        {} // clientHeaders
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

    it('should throw detailed error if manifest parsing fails with ZodError', async () => {
      const issues = [
        {code: 'custom' as const, path: ['tools'], message: 'Is required'},
      ];
      const mockZodError = new ZodError(issues);
      mockSessionGet.mockResolvedValueOnce({data: {invalid: 'structure'}});
      MockedZodManifestSchema.parse.mockImplementationOnce(() => {
        throw mockZodError;
      });

      await expect(client.loadTool(toolName)).rejects.toThrow(
        `Invalid manifest structure received from ${expectedApiUrl}: ${JSON.stringify(
          issues,
          null,
          2
        )}`
      );
    });

    it('should handle non-Error objects during manifest parsing failure', async () => {
      const mockApiResponseData = {invalid: 'manifest'};
      const validationError = 'a string error';

      mockSessionGet.mockResolvedValueOnce({data: mockApiResponseData});
      MockedZodManifestSchema.parse.mockImplementationOnce(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw validationError;
      });

      await expect(client.loadTool(toolName)).rejects.toThrow(
        `Invalid manifest structure received from ${expectedApiUrl}: Unknown validation error.`
      );
    });

    it('should throw an error if manifest.tools key is missing', async () => {
      const mockManifestWithoutTools = {serverVersion: '1.0.0'};

      await expect(client.loadTool(toolName)).rejects.toThrow(
        `Invalid manifest structure received from ${expectedApiUrl}: Unknown validation error.`
      );
    });

    it('should re-throw specific manifest errors without logging', async () => {
      const specificError = new Error(
        'Invalid manifest structure received from http://some.url'
      );
      mockSessionGet.mockRejectedValueOnce(specificError);
      await expect(client.loadTool(toolName)).rejects.toThrow(specificError);
      expect(MockedLogApiError).not.toHaveBeenCalled();
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
      toolDefinitions: Record<string, InferredZodTool>
    ) => {
      const manifestData: ZodManifest = {
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
            if (!p.authSources) {
              acc[p.name] = {
                _def: {typeName: 'ZodString'},
              } as unknown as ZodTypeAny;
            }
            return acc;
          }, {})
        );

        const mockCallable = jest.fn().mockResolvedValue({result: 'done'});
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

      expect(mockSessionGet).toHaveBeenCalledWith(
        expectedApiUrl,
        expect.anything()
      );
      expect(MockedZodManifestSchema.parse).toHaveBeenCalledWith(manifestData);

      expect(MockedCreateZodSchemaFromParams).toHaveBeenCalledTimes(2);
      expect(MockedToolboxToolFactory).toHaveBeenCalledTimes(2);
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        autoCreatedSession,
        testBaseUrl,
        'toolA',
        mockToolDefinitions.toolA.description,
        zodParamsSchemas.toolA,
        {},
        {},
        {},
        [],
        {}
      );
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        autoCreatedSession,
        testBaseUrl,
        'toolB',
        mockToolDefinitions.toolB.description,
        zodParamsSchemas.toolB,
        {},
        {},
        {},
        []
      );
      expect(loadedTools).toEqual(
        expect.arrayContaining([toolInstances.toolA, toolInstances.toolB])
      );
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
        {paramA: 'valueA'},
        {},
        {},
        []
      );
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'toolB',
        expect.anything(),
        expect.anything(),
        {paramB: 123},
        {},
        {},
        []
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

    it('should throw an error if auth token getters cannot be applied to any tool in the set', async () => {
      const toolsetName = 'my-toolset';
      const mockToolDefinitions: Record<string, InferredZodTool> = {
        toolA: {description: 'Tool A', parameters: []},
      };
      const authTokenGetters = {unused_auth: () => 'token'};
      setupMocksForSuccessfulToolsetLoad(mockToolDefinitions);
      mockedIdentifyAuthRequirements.mockReturnValueOnce([{}, [], new Set()]);

      await expect(
        client.loadToolset(toolsetName, authTokenGetters, {})
      ).rejects.toThrow(
        `Validation failed for toolset '${toolsetName}': unused auth tokens could not be applied to any tool: unused_auth.`
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

    it('should throw an error if bound parameters cannot be applied to any tool', async () => {
      const mockTools: Record<string, InferredZodTool> = {
        toolA: {
          description: 'A',
          parameters: [{name: 'paramA', type: 'string'} as ParameterSchema],
        },
      };
      const boundParams = {unused: 'value'};
      setupMocksForSuccessfulToolsetLoad(mockTools);

      expect(loadedTools).toEqual([]);
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
      mockSessionGet.mockResolvedValueOnce({data: mockApiResponseData});
      MockedZodManifestSchema.parse.mockImplementationOnce(() => {
        throw mockZodError;
      });

      await expect(client.loadToolset(toolsetName)).rejects.toThrow(
        `Invalid manifest structure received from ${expectedApiUrlForToolset}`
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

    describe('in strict mode', () => {
      it('should throw an error if a bound parameter is not used by a tool', async () => {
        const toolsetName = 'strict-set';
        const mockToolDefinitions: Record<string, InferredZodTool> = {
          toolA: {
            description: 'Tool A',
            parameters: [{name: 'paramA', type: 'string'} as ParameterSchema],
          },
        };
        const boundParams = {paramA: 'valueA', unusedForToolA: 'value'};
        setupMocksForSuccessfulToolsetLoad(mockToolDefinitions);

        await expect(
          client.loadToolset(toolsetName, {}, boundParams, true)
        ).rejects.toThrow(
          "Validation failed for tool 'toolA': unused bound parameters: unusedForToolA."
        );
      });

      it('should throw an error if an auth token getter is not used by a tool', async () => {
        const toolsetName = 'strict-set-auth';
        const mockToolDefinitions: Record<string, InferredZodTool> = {
          toolA: {description: 'Tool A', parameters: []},
        };
        const authTokenGetters = {unused_auth: () => 'secret'};
        setupMocksForSuccessfulToolsetLoad(mockToolDefinitions);
        mockedIdentifyAuthRequirements.mockReturnValueOnce([{}, [], new Set()]);

        await expect(
          client.loadToolset(toolsetName, authTokenGetters, {}, true)
        ).rejects.toThrow(
          "Validation failed for tool 'toolA': unused auth tokens: unused_auth."
        );
      });
    });
  });
});
