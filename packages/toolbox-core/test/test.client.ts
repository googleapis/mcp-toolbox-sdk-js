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
} from '../src/toolbox_core/protocol';
import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {ZodRawShape, ZodObject, ZodTypeAny} from 'zod';

// --- Helper Types ---
type OriginalToolboxToolType =
  typeof import('../src/toolbox_core/tool').ToolboxTool;

type CallableToolReturnedByFactory = ReturnType<OriginalToolboxToolType>;

const createMockZodObject = (
  shape: ZodRawShape = {}
): ZodObject<ZodRawShape, 'strip', ZodTypeAny> =>
  ({
    parse: jest.fn(args => args), // Simple pass-through
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

jest.mock('../src/toolbox_core/protocol', () => ({
  ZodManifestSchema: {
    parse: jest.fn(),
  },
  createZodSchemaFromParams: jest.fn(),
}));
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
        tools: {[toolName]: toolDefinition},
        ...overrides.manifestData,
      } as ZodManifest;

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
        mockToolDefinition.parameters
      );
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        client['_session'],
        testBaseUrl,
        toolName,
        mockToolDefinition.description,
        zodParamsSchema
      );
      expect(loadedTool).toBe(toolInstance);
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
        `Invalid manifest structure received: ${mockZodError.message}`
      );
      expect(MockedCreateZodSchemaFromParams).not.toHaveBeenCalled();
      expect(MockedToolboxToolFactory).not.toHaveBeenCalled();
    });

    it('should throw an error if manifest.tools key is missing', async () => {
      const mockManifestWithoutTools = {serverVersion: '1.0.0'}; // 'tools' key absent

      mockSessionGet.mockResolvedValueOnce({
        data: mockManifestWithoutTools,
      } as AxiosResponse);
      MockedZodManifestSchema.parse.mockReturnValueOnce(
        mockManifestWithoutTools as unknown as ZodManifest
      );

      await expect(client.loadTool(toolName)).rejects.toThrow(
        `Tool "${toolName}" not found in manifest.`
      );
      expect(MockedCreateZodSchemaFromParams).not.toHaveBeenCalled();
      expect(MockedToolboxToolFactory).not.toHaveBeenCalled();
    });

    it('should throw an error if the specific tool is not found in manifest.tools', async () => {
      const mockManifestWithOtherTools = {
        serverVersion: '1.0.0',
        tools: {anotherTool: {description: 'A different tool', parameters: []}},
      } as ZodManifest;
      mockSessionGet.mockResolvedValueOnce({
        data: mockManifestWithOtherTools,
      } as AxiosResponse);
      MockedZodManifestSchema.parse.mockReturnValueOnce(
        mockManifestWithOtherTools as ZodManifest
      );
      await expect(client.loadTool(toolName)).rejects.toThrow(
        `Tool "${toolName}" not found in manifest.`
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
        'Server-side issue'
      );
      expect(MockedZodManifestSchema.parse).not.toHaveBeenCalled();
    });
  });

  describe('loadToolset', () => {
    let client: ToolboxClient;

    beforeEach(() => {
      client = new ToolboxClient(testBaseUrl);
    });

    const setupMocksForSuccessfulToolsetLoad = (
      toolDefinitions: Record<string, object>,
      overrides: Partial<{
        manifestData: object;
        zodParamsSchemas: Record<string, object>;
        toolInstances: Record<string, object>;
      }> = {}
    ) => {
      const manifestData = overrides.manifestData || {
        serverVersion: '1.0.0',
        tools: toolDefinitions,
      };
      const zodParamsSchemas: Record<string, any> =
        overrides.zodParamsSchemas || {};
      const toolInstances: Record<string, any> = overrides.toolInstances || {};

      Object.keys(toolDefinitions).forEach(toolName => {
        if (!zodParamsSchemas[toolName]) {
          zodParamsSchemas[toolName] = {
            _isMockZodParamSchema: true,
            forTool: toolName,
          };
        }
        if (!toolInstances[toolName]) {
          toolInstances[toolName] = {
            _isMockTool: true,
            loadedName: toolName,
          };
        }
      });

      mockSessionGet.mockResolvedValueOnce({
        data: manifestData,
      } as AxiosResponse);
      MockedZodManifestSchema.parse.mockReturnValueOnce({
        success: true,
        data: manifestData,
      } as any);

      Object.keys(toolDefinitions).forEach(toolName => {
        MockedCreateZodSchemaFromParams.mockReturnValueOnce(
          zodParamsSchemas[toolName]
        );
        MockedToolboxToolFactory.mockImplementationOnce(
          () => toolInstances[toolName]
        );
      });

      return {manifestData, zodParamsSchemas, toolInstances};
    };

    it('should successfully load a toolset with multiple tools', async () => {
      const toolsetName = 'my-toolset';
      const expectedApiUrl = `${testBaseUrl}/api/toolset/${toolsetName}`;
      const mockToolDefinitions = {
        toolA: {
          description: 'Tool A description',
          parameters: [{name: 'paramA', type: 'string'}],
        },
        toolB: {
          description: 'Tool B description',
          parameters: [{name: 'paramB', type: 'integer'}],
        },
      };

      const {toolInstances, manifestData} =
        setupMocksForSuccessfulToolsetLoad(mockToolDefinitions);
      const loadedTools = await client.loadToolset(toolsetName);

      expect(mockSessionGet).toHaveBeenCalledWith(expectedApiUrl);
      expect(MockedZodManifestSchema.parse).toHaveBeenCalledWith(
        manifestData
      );
      expect(MockedCreateZodSchemaFromParams).toHaveBeenCalledWith(
        mockToolDefinitions.toolA.parameters
      );
      expect(MockedCreateZodSchemaFromParams).toHaveBeenCalledWith(
        mockToolDefinitions.toolB.parameters
      );
      expect(MockedToolboxToolFactory).toHaveBeenCalledTimes(2);
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        (client as any)._session,
        testBaseUrl,
        'toolA',
        mockToolDefinitions.toolA.description,
        expect.objectContaining({forTool: 'toolA'})
      );
      expect(MockedToolboxToolFactory).toHaveBeenCalledWith(
        (client as any)._session,
        testBaseUrl,
        'toolB',
        mockToolDefinitions.toolB.description,
        expect.objectContaining({forTool: 'toolB'})
      );
      expect(loadedTools).toEqual(
        expect.arrayContaining([toolInstances.toolA, toolInstances.toolB])
      );
      expect(loadedTools.length).toBe(2);
    });

    it('should request the default toolset if no name is provided', async () => {
      const expectedApiUrl = `${testBaseUrl}/api/toolset/`;
      setupMocksForSuccessfulToolsetLoad({});
      await client.loadToolset();
      expect(mockSessionGet).toHaveBeenLastCalledWith(expectedApiUrl);

      mockSessionGet.mockReset();
      setupMocksForSuccessfulToolsetLoad({});
      await client.loadToolset(null);
      expect(mockSessionGet).toHaveBeenLastCalledWith(expectedApiUrl);
    });

    it('should return an empty array if the manifest contains no tools', async () => {
      const toolsetName = 'empty-set';
      setupMocksForSuccessfulToolsetLoad({}); // Manifest with empty tools
      const loadedTools = await client.loadToolset(toolsetName);

      expect(loadedTools).toEqual([]);
      expect(MockedCreateZodSchemaFromParams).not.toHaveBeenCalled();
      expect(MockedToolboxToolFactory).not.toHaveBeenCalled();
    });

    it('should throw an error if manifest parsing fails for toolset', async () => {
      const toolsetName = 'bad-manifest-set';
      const mockApiResponseData = {invalid: 'toolset structure'};
      const mockZodErrorDetail = {message: 'Zod validation failed on toolset'};
      mockSessionGet.mockResolvedValueOnce({
        data: mockApiResponseData,
      } as AxiosResponse);
      MockedZodManifestSchema.parse.mockReturnValueOnce({
        success: false,
        error: mockZodErrorDetail,
      } as any);

      await expect(client.loadToolset(toolsetName)).rejects.toThrow(
        `Invalid manifest structure received: ${mockZodErrorDetail.message}`
      );
    });

    it('should throw and log error if API GET request for toolset fails', async () => {
      const toolsetName = 'api-error-set';
      const expectedApiUrl = `${testBaseUrl}/api/toolset/${toolsetName}`;
      const errorMessage = 'Toolset API unavailable';
      const apiError = new Error(errorMessage);
      mockSessionGet.mockRejectedValueOnce(apiError);

      await expect(client.loadToolset(toolsetName)).rejects.toThrow(apiError);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Error fetching data from ${expectedApiUrl}:`,
        errorMessage
      );
    });
  });
});
