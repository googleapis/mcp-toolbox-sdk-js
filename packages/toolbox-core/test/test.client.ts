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
import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {z, ZodRawShape, ZodObject, ZodTypeAny, ZodError} from 'zod';

// --- Helper Types ---
type OriginalToolboxToolType =
  typeof import('../src/toolbox_core/tool').ToolboxTool;

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

// This mock setup is from the user's baseline
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

describe('ToolboxClient', () => {
  const testBaseUrl = 'http://api.example.com';
  let consoleErrorSpy: jest.SpyInstance;
  let mockSessionGet: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();

    mockSessionGet = jest.fn();
    mockedAxios.create.mockReturnValue({
      get: mockSessionGet,
    } as unknown as AxiosInstance);

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should set baseUrl and create a new session if one is not provided', () => {
      const client = new ToolboxClient(testBaseUrl);

      expect(client['_baseUrl']).toBe(testBaseUrl);
      expect(mockedAxios.create).toHaveBeenCalledTimes(1);
      expect(mockedAxios.create).toHaveBeenCalledWith({baseURL: testBaseUrl});
      expect(client['_session'].get).toBe(mockSessionGet);
    });

    it('should set baseUrl and use the provided session if one is given', () => {
      const customMockSession = {
        get: mockSessionGet,
      } as unknown as AxiosInstance;
      const client = new ToolboxClient(testBaseUrl, customMockSession);

      expect(client['_baseUrl']).toBe(testBaseUrl);
      expect(client['_session']).toBe(customMockSession);
      expect(mockedAxios.create).not.toHaveBeenCalled();
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
      toolDefinition: {
        // This is the original generic object type for loadTool
        description: string;
        parameters: {name: string; type: string; description: string}[];
      },
      overrides: {
        manifestData?: Partial<ZodManifest>;
        zodParamsSchema?: ZodObject<ZodRawShape, 'strip', ZodTypeAny>;
        toolInstance?: Partial<CallableToolReturnedByFactory>;
      } = {}
    ) => {
      const manifestData: ZodManifest = {
        serverVersion: '1.0.0',
        tools: {[toolName]: toolDefinition as unknown as InferredZodTool}, // Cast here if ZodManifest expects InferredZodTool
        ...overrides.manifestData,
      } as ZodManifest; // Outer cast to ZodManifest

      const zodParamsSchema =
        overrides.zodParamsSchema ||
        createMockZodObject(
          toolDefinition.parameters.reduce(
            (shapeAccumulator: ZodRawShape, param) => {
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
      const mockToolDefinition = {
        // Original generic object
        description: 'Performs calculations',
        parameters: [
          {name: 'expression', type: 'string', description: 'Math expression'},
        ],
      };

      const {zodParamsSchema, toolInstance, manifestData} =
        setupMocksForSuccessfulLoad(mockToolDefinition);
      const loadedTool = await client.loadTool(toolName);

      expect(mockSessionGet).toHaveBeenCalledWith(expectedApiUrl);
      expect(MockedZodManifestSchema.parse).toHaveBeenCalledWith(manifestData);
      expect(MockedCreateZodSchemaFromParams).toHaveBeenCalledWith(
        mockToolDefinition.parameters as unknown as ParameterSchema[] // Cast if createZodSchemaFromParams expects ParameterSchema[]
      );
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        client['_session'],
        testBaseUrl,
        toolName,
        mockToolDefinition.description,
        zodParamsSchema,
        {}  // boundParams defaults to empty object
      );
      expect(loadedTool).toBe(toolInstance);
    });

    it('should successfully load a tool with valid bound parameters', async () => {
      const mockToolDefinition = {
        description: 'Performs calculations',
        parameters: [
          {name: 'expression', type: 'string', description: 'Math expression'},
          {name: 'precision', type: 'number', description: 'Decimal places'},
        ],
      };
      const boundParams = {expression: '2+2'};
      setupMocksForSuccessfulLoad(mockToolDefinition);

      await client.loadTool(toolName, boundParams);

      // Assert that the factory was called with the applicable bound parameters
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
      const mockToolDefinition = {
        description: 'A tool',
        parameters: [{name: 'param1', type: 'string', description: 'A param'}],
      };
      const boundParams = {param1: 'value1', unusedParam: 'value2'};
      setupMocksForSuccessfulLoad(mockToolDefinition);

      await expect(client.loadTool(toolName, boundParams)).rejects.toThrow(
        `Validation failed for tool '${toolName}': unused bound parameters: unusedParam.`
      );
    });

    it('should throw an error if manifest parsing fails', async () => {
      const mockApiResponseData = {invalid: 'manifest structure'};
      const mockZodError = new Error('Zod validation failed on manifest'); // Can be new ZodError(...)

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
        tools: {anotherTool: {description: 'A different tool', parameters: []}}, // Kept generic as per baseline
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
      expect(mockSessionGet).toHaveBeenCalledWith(expectedApiUrl);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Error fetching data from ${expectedApiUrl}:`,
        apiError.message // As per user's original assertion for loadTool
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
      toolDefinitions: Record<string, InferredZodTool>, // Use InferredZodTool
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
          (tDef.parameters as ParameterSchema[]).reduce(
            (acc: ZodRawShape, p) => {
              acc[p.name] = {
                _def: {typeName: 'ZodString'},
              } as unknown as ZodTypeAny;
              return acc;
            },
            {}
          )
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
          authRequired: [], // Assuming InferredZodTool might have this
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
          authRequired: [], // Assuming InferredZodTool might have this
        },
      };

      const {toolInstances, manifestData, zodParamsSchemas} =
        setupMocksForSuccessfulToolsetLoad(mockToolDefinitions);
      const loadedTools = await client.loadToolset(toolsetName);

      expect(mockSessionGet).toHaveBeenCalledWith(expectedApiUrl);
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
        {}
      );
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        client['_session'],
        testBaseUrl,
        'toolB',
        mockToolDefinitions.toolB.description,
        zodParamsSchemas.toolB,
        {}
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
      await client.loadToolset(toolsetName, boundParams);

      expect(MockedToolboxToolFactory).toHaveBeenCalledTimes(2);
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

    it('should throw an error if bound parameters cannot be applied to any tool in the set', async () => {
      const toolsetName = 'my-toolset';
      const mockToolDefinitions: Record<string, InferredZodTool> = {
        toolA: {
          description: 'Tool A',
          parameters: [{name: 'paramA', type: 'string'} as ParameterSchema],
        },
      };
      const boundParams = {paramA: 'valueA', unusedParam: 'value2'};

      setupMocksForSuccessfulToolsetLoad(mockToolDefinitions);

      await expect(client.loadToolset(toolsetName, boundParams)).rejects.toThrow(
        `Validation failed for toolset '${toolsetName}': unused bound parameters could not be applied to any tool: unusedParam.`
      );
    });

    it('should request the default toolset if no name is provided', async () => {
      const expectedApiUrl = `${testBaseUrl}/api/toolset/`;

      setupMocksForSuccessfulToolsetLoad({});
      await client.loadToolset();
      expect(mockSessionGet).toHaveBeenLastCalledWith(expectedApiUrl);

      mockSessionGet.mockReset();
      MockedZodManifestSchema.parse.mockReset();
      MockedCreateZodSchemaFromParams.mockReset();
      MockedToolboxToolFactory.mockReset();

      setupMocksForSuccessfulToolsetLoad({});
      await client.loadToolset();
      expect(mockSessionGet).toHaveBeenLastCalledWith(expectedApiUrl);
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
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Error fetching data from ${expectedApiUrl}:`,
        apiError.message // Consistent with loadTool's API error logging assertion
      );
    });
  });
});
