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

// --- Mocking External Dependencies ---
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('../src/toolbox_core/tool', () => ({
  ToolboxTool: jest.fn(),
}));
const MockedToolboxToolFactory = ToolboxTool as jest.MockedFunction<
  typeof ToolboxTool
>;

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
      toolDefinition: object,
      overrides: {
        manifestData?: Partial<ZodManifest>;
        zodParamsSchema?: object;
        toolInstance?: object;
      } = {}
    ) => {
      const manifestData: ZodManifest = {
        serverVersion: '1.0.0',
        tools: {[toolName]: toolDefinition},
        ...overrides.manifestData, // Allow overriding parts of the manifest
      } as ZodManifest;
      const zodParamsSchema = overrides.zodParamsSchema || {
        _isMockZodParamSchema: true,
        forTool: toolName,
      };
      const toolInstance = overrides.toolInstance || {
        _isMockTool: true,
        loadedName: toolName,
      };

      mockSessionGet.mockResolvedValueOnce({
        data: manifestData,
      } as AxiosResponse);
      MockedZodManifestSchema.parse.mockReturnValueOnce(manifestData);
      MockedCreateZodSchemaFromParams.mockReturnValueOnce(
        zodParamsSchema as any
      );
      MockedToolboxToolFactory.mockReturnValueOnce(toolInstance as any);

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
});
