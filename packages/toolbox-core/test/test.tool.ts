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

import {ToolboxTool} from '../src/toolbox_core/tool.js';
import {z, ZodObject, ZodRawShape} from 'zod';
import {AxiosInstance, AxiosResponse} from 'axios';
import * as utils from '../src/toolbox_core/utils.js';

// Global mocks
const mockAxiosPost = jest.fn();
const mockSession = {
  post: mockAxiosPost,
} as unknown as AxiosInstance;

// Mock the utils module
jest.mock('../src/toolbox_core/utils', () => ({
  ...jest.requireActual('../src/toolbox_core/utils'),
  resolveValue: jest.fn(async (v: unknown) =>
    typeof v === 'function' ? await v() : v,
  ),
  identifyAuthRequirements: jest.fn(),
}));

describe('ToolboxTool', () => {
  // Common constants for the tool
  const baseURL = 'https://api.example.com';
  const toolName = 'myTestTool';
  const toolDescription = 'This is a description for the test tool.';

  // Variables to be initialized in beforeEach
  let basicParamSchema: ZodObject<ZodRawShape>;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let tool: ReturnType<typeof ToolboxTool>;

  beforeEach(() => {
    // Reset mocks before each test
    mockAxiosPost.mockReset();
    (utils.resolveValue as jest.Mock).mockClear();
    (utils.identifyAuthRequirements as jest.Mock).mockClear();

    // Initialize a basic schema used by many tests
    basicParamSchema = z.object({
      query: z.string().min(1, 'Query cannot be empty'),
      limit: z.number().optional(),
    });

    // Spy on console to prevent logging and allow assertions
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore the original console methods
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('Factory Properties and Getters', () => {
    beforeEach(() => {
      tool = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        basicParamSchema,
        {},
      );
    });

    it('should correctly assign toolName, description, and params to the callable function', () => {
      expect(tool.toolName).toBe(toolName);
      expect(tool.description).toBe(toolDescription);
      expect(tool.params).toBe(basicParamSchema);
      expect(tool.boundParams).toEqual({});
      expect(tool.authTokenGetters).toEqual({});
      expect(tool.requiredAuthnParams).toEqual({});
      expect(tool.requiredAuthzTokens).toEqual([]);
    });

    it('getName() should return the tool name', () => {
      expect(tool.getName()).toBe(toolName);
    });

    it('getDescription() should return the tool description', () => {
      expect(tool.getDescription()).toBe(toolDescription);
    });

    it('getParamSchema() should return the parameter schema', () => {
      expect(tool.getParamSchema()).toBe(basicParamSchema);
    });

    it('should warn when using an HTTP URL with authTokenGetters', () => {
      const httpBaseURL = 'http://api.insecure.com';
      ToolboxTool(
        mockSession,
        httpBaseURL,
        toolName,
        toolDescription,
        basicParamSchema,
        {service1: () => 'token'},
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Sending ID token over HTTP. User data may be exposed. Use HTTPS for secure communication.',
      );
    });

    it('should warn when using an HTTP URL with clientHeaders', () => {
      const httpBaseURL = 'http://api.insecure.com';
      ToolboxTool(
        mockSession,
        httpBaseURL,
        toolName,
        toolDescription,
        basicParamSchema,
        {},
        {},
        [],
        {},
        {'x-api-key': 'key'},
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Sending ID token over HTTP. User data may be exposed. Use HTTPS for secure communication.',
      );
    });

  });

  describe('Callable Function - Argument Validation', () => {
    it('should call paramSchema.parse with the provided arguments', async () => {
      const omitSpy = jest
        .spyOn(basicParamSchema, 'omit')
        .mockImplementation(() => basicParamSchema);
      const currentTool = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        basicParamSchema,
      );
      const parseSpy = jest.spyOn(basicParamSchema, 'parse');
      const callArgs = {query: 'test query'};
      mockAxiosPost.mockResolvedValueOnce({data: 'success'} as AxiosResponse);

      await currentTool(callArgs);

      expect(parseSpy).toHaveBeenCalledWith(callArgs);
      parseSpy.mockRestore();
      omitSpy.mockRestore();
    });

    it('should throw a formatted ZodError if argument validation fails', async () => {
      const currentTool = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        basicParamSchema,
      );
      const invalidArgs = {query: ''}; // Fails because of empty string

      await expect(currentTool(invalidArgs)).rejects.toThrow(
        `Argument validation failed for tool "${toolName}":\n - query: Query cannot be empty`,
      );
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should handle multiple ZodError issues in the validation error message', async () => {
      const complexSchema = z.object({
        name: z.string().min(1, 'Name is required'),
        age: z.number().positive('Age must be positive'),
      });
      const currentTool = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        complexSchema,
      );
      const invalidArgs = {name: '', age: -5};

      await expect(currentTool(invalidArgs)).rejects.toThrow(
        new RegExp(
          `Argument validation failed for tool "${toolName}":\\s*-\\s*name: Name is required\\s*-\\s*age: Age must be positive`,
        ),
      );
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should throw a generic error if paramSchema.parse throws a non-ZodError', async () => {
      const customError = new Error('A non-Zod parsing error occurred!');
      const failingSchema = {
        parse: jest.fn().mockImplementation(() => {
          throw customError;
        }),
        omit: jest.fn().mockReturnThis(),
      } as unknown as ZodObject<ZodRawShape>;
      const currentTool = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        failingSchema,
      );
      const callArgs = {query: 'some query'};

      await expect(currentTool(callArgs)).rejects.toThrow(
        `Argument validation failed: ${String(customError)}`,
      );
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should use an empty object as default if no arguments are provided and schema allows it', async () => {
      const emptySchema = z.object({});

      const omitSpy = jest
        .spyOn(emptySchema, 'omit')
        .mockImplementation(() => emptySchema);
      const parseSpy = jest.spyOn(emptySchema, 'parse');
      const currentTool = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        emptySchema,
      );
      mockAxiosPost.mockResolvedValueOnce({data: 'success'});

      await currentTool();

      expect(parseSpy).toHaveBeenCalledWith({});
      expect(mockAxiosPost).toHaveBeenCalled();
      parseSpy.mockRestore();
      omitSpy.mockRestore();
    });

    it('should fail validation if no arguments are given and schema requires them', async () => {
      const currentTool = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        basicParamSchema,
      );
      await expect(currentTool()).rejects.toThrow(
        'Argument validation failed for tool "myTestTool":\n - query: Required',
      );
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });
  });

  describe('Callable Function - API Call Execution', () => {
    const validArgs = {query: 'search term', limit: 10};
    const expectedUrl = `${baseURL}/api/tool/${toolName}/invoke`;
    const mockApiResponseData = {result: 'Data from API'};

    beforeEach(() => {
      tool = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        basicParamSchema,
      );
    });

    it('should make a POST request to the correct URL with the validated payload', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: mockApiResponseData,
      } as AxiosResponse);

      const result = await tool(validArgs);

      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
      expect(mockAxiosPost).toHaveBeenCalledWith(expectedUrl, validArgs, {
        headers: {},
      });
      expect(result).toEqual(mockApiResponseData['result']);
    });

    it('should re-throw the error and log to console.error if API call fails', async () => {
      const apiError = new Error('API request failed');
      mockAxiosPost.mockRejectedValueOnce(apiError);

      await expect(tool(validArgs)).rejects.toThrow(apiError);
      expect(mockAxiosPost).toHaveBeenCalledWith(expectedUrl, validArgs, {
        headers: {},
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Error posting data to ${expectedUrl}:`,
        apiError.message,
      );
    });

    it('should omit null and undefined values from the final payload', async () => {
      const paramSchemaWithOptional = z.object({
        required_param: z.string(),
        optional_param1: z.string().nullish(),
        optional_param2: z.string().nullish(),
      });

      const toolWithOptionalParams = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        paramSchemaWithOptional,
      );

      mockAxiosPost.mockResolvedValueOnce({data: 'success'} as AxiosResponse);

      const callArgs = {
        required_param: 'value',
        optional_param1: null,
        optional_param2: undefined,
      };

      await toolWithOptionalParams(callArgs);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expectedUrl,
        {required_param: 'value'},
        {headers: {}},
      );
    });
  });

  describe('Bound Parameters Functionality', () => {
    const expectedUrl = `${baseURL}/api/tool/${toolName}/invoke`;

    beforeEach(() => {
      tool = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        basicParamSchema,
      );
    });

    it('should create a new tool with bound parameters using bindParams', () => {
      const boundTool = tool.bindParams({limit: 10});
      expect(boundTool).not.toBe(tool);
      expect(boundTool.boundParams).toEqual({limit: 10});
      expect(tool.boundParams).toEqual({});
    });

    it('should create a new tool with a single bound parameter using bindParam and use it in the call', async () => {
      const boundTool = tool.bindParam('limit', 20);
      expect(boundTool.boundParams).toEqual({limit: 20});

      // Also test execution
      mockAxiosPost.mockResolvedValueOnce({data: 'success'});
      await boundTool({query: 'single bind test'});
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expectedUrl,
        {query: 'single bind test', limit: 20},
        {headers: {}},
      );
    });

    it('should merge bound parameters with call arguments in the final payload', async () => {
      const boundTool = tool.bindParams({limit: 5});
      mockAxiosPost.mockResolvedValueOnce({data: 'success'});
      await boundTool({query: 'specific query'});
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expectedUrl,
        {
          query: 'specific query',
          limit: 5,
        },
        {headers: {}},
      );
    });

    it('should not require bound parameters to be provided at call time', async () => {
      const boundTool = tool.bindParams({query: 'default query'});
      mockAxiosPost.mockResolvedValueOnce({data: 'success'});
      await boundTool({limit: 15});
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expectedUrl,
        {
          query: 'default query',
          limit: 15,
        },
        {headers: {}},
      );
    });

    it('should validate only the user-provided arguments, not the bound ones', async () => {
      const boundTool = tool.bindParams({query: 'a valid query'});
      mockAxiosPost.mockResolvedValueOnce({data: {result: 'success'}});
      // This call is valid because 'query' is bound, and no invalid args are passed
      await expect(boundTool()).resolves.toBe('success');
    });

    it('should throw an error when trying to re-bind an already bound parameter', () => {
      const boundTool = tool.bindParams({limit: 10});
      const expectedError = `Cannot re-bind parameter: parameter 'limit' is already bound in tool '${toolName}'.`;
      expect(() => boundTool.bindParams({limit: 20})).toThrow(expectedError);
    });

    it('should throw an error when trying to bind a parameter that does not exist', () => {
      const expectedError = `Unable to bind parameter: no parameter named 'nonExistent' in tool '${toolName}'.`;
      expect(() => tool.bindParams({nonExistent: 'value'})).toThrow(
        expectedError,
      );
    });

    it('should resolve function values in bound parameters before making the API call', async () => {
      const dynamicQuery = async () => 'resolved-query';
      const boundTool = tool.bindParams({query: dynamicQuery});
      mockAxiosPost.mockResolvedValueOnce({data: 'success'});
      await boundTool({limit: 5});
      expect(utils.resolveValue).toHaveBeenCalledWith(dynamicQuery);
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expectedUrl,
        {
          query: 'resolved-query',
          limit: 5,
        },
        {headers: {}},
      );
    });
  });

  describe('Authentication Functionality', () => {
    const expectedUrl = `${baseURL}/api/tool/${toolName}/invoke`;
    const initialRequiredAuthn = {paramA: ['service1', 'service2']};
    const initialRequiredAuthz = ['service3'];

    beforeEach(() => {
      tool = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        basicParamSchema,
        {}, // authTokenGetters
        initialRequiredAuthn,
        initialRequiredAuthz,
        {}, // boundParams
        {}, // clientHeaders
      );
    });

    it('should throw an error if called with unmet authentication requirements', async () => {
      await expect(tool({query: 'test'})).rejects.toThrow(
        'One or more of the following authn services are required to invoke this tool: service1,service2,service3',
      );
    });

    it('should add a single auth token getter and create a new tool', () => {
      (utils.identifyAuthRequirements as jest.Mock).mockReturnValue([
        {paramA: ['service2']},
        ['service3'],
        new Set(['service1']),
      ]);
      const newTool = tool.addAuthTokenGetter('service1', () => 'token1');

      expect(newTool).not.toBe(tool);
      expect(Object.keys(newTool.authTokenGetters)).toContain('service1');
      expect(newTool.requiredAuthnParams).toEqual({paramA: ['service2']});
      expect(newTool.requiredAuthzTokens).toEqual(['service3']);
    });

    it('should add multiple auth token getters', () => {
      (utils.identifyAuthRequirements as jest.Mock).mockReturnValue([
        {},
        [],
        new Set(['service1', 'service2', 'service3']),
      ]);
      const newTool = tool.addAuthTokenGetters({
        service1: () => 'token1',
        service2: () => 'token2',
        service3: () => 'token3',
      });

      expect(Object.keys(newTool.authTokenGetters)).toEqual([
        'service1',
        'service2',
        'service3',
      ]);
      expect(newTool.requiredAuthnParams).toEqual({});
      expect(newTool.requiredAuthzTokens).toEqual([]);
    });

    it('should call the API with the correct auth headers', async () => {
      const readyTool = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        basicParamSchema,
      );
      (utils.identifyAuthRequirements as jest.Mock).mockReturnValue([
        {},
        [],
        new Set(['service1', 'service3']),
      ]);
      const authedTool = readyTool.addAuthTokenGetters({
        service1: () => 'token-one',
        service3: async () => 'token-three',
      });
      mockAxiosPost.mockResolvedValue({data: 'success'});
      await authedTool({query: 'a query'});
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expectedUrl,
        {query: 'a query'},
        {
          headers: {
            service1_token: 'token-one',
            service3_token: 'token-three',
          },
        },
      );
    });

    it('should throw an error if an auth token getter does not return a string', async () => {
      (utils.identifyAuthRequirements as jest.Mock).mockReturnValue([
        {},
        [],
        new Set(['service1']),
      ]);
      const badTokenGetter = () => 12345;
      const authedTool = tool.addAuthTokenGetter(
        'service1',
        badTokenGetter as unknown as () => string,
      );
      // Manually clear requirements to bypass the initial check
      authedTool.requiredAuthnParams = {};
      authedTool.requiredAuthzTokens = [];

      await expect(authedTool({query: 'a query'})).rejects.toThrow(
        "Auth token getter for 'service1' did not return a string.",
      );
    });

    it('should throw an error when registering a duplicate auth source', () => {
      (utils.identifyAuthRequirements as jest.Mock).mockReturnValue([
        {},
        [],
        new Set(['service1']),
      ]);
      const newTool = tool.addAuthTokenGetter('service1', () => 'token1');
      expect(() =>
        newTool.addAuthTokenGetter('service1', () => 'token1-new'),
      ).toThrow(
        `Authentication source(s) \`service1\` already registered in tool \`${toolName}\`.`,
      );
    });

    it('should throw an error if an unused auth source is provided', () => {
      (utils.identifyAuthRequirements as jest.Mock).mockReturnValue([
        initialRequiredAuthn,
        initialRequiredAuthz,
        new Set(), // No services from the getter were used
      ]);

      expect(() =>
        tool.addAuthTokenGetter('unusedService', () => 'token'),
      ).toThrow(
        `Authentication source(s) \`unusedService\` unused by tool \`${toolName}\`.`,
      );
    });

    it('should throw an error if adding an auth token conflicts with a client header', () => {
      const toolWithClientHeader = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        basicParamSchema,
        {},
        {},
        [],
        {},
        {service1_token: 'api-key'}, // This will conflict
      );

      expect(() =>
        toolWithClientHeader.addAuthTokenGetter('service1', () => 'token'),
      ).toThrow(
        'Client header(s) `service1_token` already registered in client. Cannot register the same headers in the client as well as tool.',
      );
    });
    it('should override client headers with auth token getters during API call', async () => {
      const clientHeaders = {
        service1_token: 'value-from-client',
        'x-another-header': 'client-value',
      };

      const authTokenGetters = {
        service1: () => 'value-from-auth',
      };

      const toolWithConflict = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        basicParamSchema,
        authTokenGetters, // Contains 'service1'
        {},
        [],
        {},
        clientHeaders, // Contains the conflicting 'service1_token'
      );

      mockAxiosPost.mockResolvedValueOnce({data: {result: 'success'}});

      await toolWithConflict({query: 'test'});

      // Assert that the final headers sent to the API used the value from the auth token
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expectedUrl,
        {query: 'test'},
        {
          headers: {
            service1_token: 'value-from-auth',
            'x-another-header': 'client-value',
          },
        },
      );
    });
  });
});
