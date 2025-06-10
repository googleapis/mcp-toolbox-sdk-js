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

import {ToolboxTool} from '../src/toolbox_core/tool';
import {z, ZodObject, ZodRawShape} from 'zod';
import {AxiosInstance, AxiosResponse} from 'axios';
import * as utils from '../src/toolbox_core/utils';

// Global mocks
const mockAxiosPost = jest.fn();
const mockSession = {
  post: mockAxiosPost,
} as unknown as AxiosInstance;

// Mock the utils module
jest.mock('../src/toolbox_core/utils', () => ({
  resolveValue: jest.fn(async (v: unknown) =>
    typeof v === 'function' ? await v() : v
  ),
}));

describe('ToolboxTool', () => {
  // Common constants for the tool
  const baseURL = 'http://api.example.com';
  const toolName = 'myTestTool';
  const toolDescription = 'This is a description for the test tool.';

  // Variables to be initialized in beforeEach
  let basicParamSchema: ZodObject<ZodRawShape>;
  let consoleErrorSpy: jest.SpyInstance;
  let tool: ReturnType<typeof ToolboxTool>;

  beforeEach(() => {
    // Reset mocks before each test
    mockAxiosPost.mockReset();
    (utils.resolveValue as jest.Mock).mockClear();

    // Initialize a basic schema used by many tests
    basicParamSchema = z.object({
      query: z.string().min(1, 'Query cannot be empty'),
      limit: z.number().optional(),
    });

    // Spy on console.error to prevent logging and allow assertions
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore the original console.error
    consoleErrorSpy.mockRestore();
  });

  describe('Factory Properties and Getters', () => {
    beforeEach(() => {
      // Note: The implementation of ToolboxTool should handle `boundParams` being
      // undefined in the initial call, defaulting it to an empty object.
      tool = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        basicParamSchema,
        {} // Explicitly pass empty object for clarity
      );
    });

    it('should correctly assign toolName, description, and params to the callable function', () => {
      expect(tool.toolName).toBe(toolName);
      expect(tool.description).toBe(toolDescription);
      expect(tool.params).toBe(basicParamSchema);
      expect(tool.boundParams).toEqual({});
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
        basicParamSchema
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
        basicParamSchema
      );
      const invalidArgs = {query: ''}; // Fails because of empty string

      try {
        await currentTool(invalidArgs);
        throw new Error(
          `Expected currentTool to throw a Zod validation error for tool "${toolName}", but it did not.`
        );
      } catch (e) {
        expect((e as Error).message).toBe(
          `Argument validation failed for tool "${toolName}":\n - query: Query cannot be empty`
        );
      }
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
        complexSchema
      );
      const invalidArgs = {name: '', age: -5};

      try {
        await currentTool(invalidArgs);
        throw new Error(
          'Expected currentTool to throw a Zod validation error, but it did not.'
        );
      } catch (e) {
        expect((e as Error).message).toEqual(
          expect.stringContaining(
            `Argument validation failed for tool "${toolName}":`
          )
        );
        expect((e as Error).message).toEqual(
          expect.stringContaining('name: Name is required')
        );
        expect((e as Error).message).toEqual(
          expect.stringContaining('age: Age must be positive')
        );
      }
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
        failingSchema
      );
      const callArgs = {query: 'some query'};

      try {
        await currentTool(callArgs);
        throw new Error(
          'Expected currentTool to throw a non-Zod error during parsing, but it did not.'
        );
      } catch (e) {
        expect((e as Error).message).toBe(
          `Argument validation failed: ${String(customError)}`
        );
      }
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
        emptySchema
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
        basicParamSchema
      );
      try {
        await currentTool();
        throw new Error(
          `Expected currentTool to throw a Zod validation error for tool "${toolName}" when no args provided, but it did not.`
        );
      } catch (e) {
        expect((e as Error).message).toEqual(
          expect.stringContaining(
            'Argument validation failed for tool "myTestTool":'
          )
        );
        expect((e as Error).message).toEqual(
          expect.stringContaining('query: Required')
        );
      }
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
        basicParamSchema
      );
    });

    it('should make a POST request to the correct URL with the validated payload', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: mockApiResponseData,
      } as AxiosResponse);

      const result = await tool(validArgs);

      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
      expect(mockAxiosPost).toHaveBeenCalledWith(expectedUrl, validArgs);
      expect(result).toEqual(mockApiResponseData);
    });

    it('should re-throw the error and log to console.error if API call fails', async () => {
      const apiError = new Error('API request failed');
      mockAxiosPost.mockRejectedValueOnce(apiError);

      try {
        await tool(validArgs);
        throw new Error(
          'Expected tool call to throw an API error with response data, but it did not.'
        );
      } catch (e) {
        expect(e as Error).toBe(apiError);
      }
      expect(mockAxiosPost).toHaveBeenCalledWith(expectedUrl, validArgs);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Error posting data to ${expectedUrl}:`,
        apiError.message
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
        basicParamSchema
      );
    });

    it('should create a new tool with bound parameters using bindParams', () => {
      const boundTool = tool.bindParams({limit: 10});
      expect(boundTool).not.toBe(tool);
      expect(boundTool.boundParams).toEqual({limit: 10});
      expect(tool.boundParams).toEqual({});
    });

    it('should create a new tool with a single bound parameter using bindParam', () => {
      const boundTool = tool.bindParam('limit', 20);
      expect(boundTool.boundParams).toEqual({limit: 20});
    });

    it('should merge bound parameters with call arguments in the final payload', async () => {
      const boundTool = tool.bindParams({limit: 5});
      mockAxiosPost.mockResolvedValueOnce({data: 'success'});
      await boundTool({query: 'specific query'});
      expect(mockAxiosPost).toHaveBeenCalledWith(expectedUrl, {
        query: 'specific query',
        limit: 5,
      });
    });

    it('should not require bound parameters to be provided at call time', async () => {
      const boundTool = tool.bindParams({query: 'default query'});
      mockAxiosPost.mockResolvedValueOnce({data: 'success'});
      await boundTool({limit: 15});
      expect(mockAxiosPost).toHaveBeenCalledWith(expectedUrl, {
        query: 'default query',
        limit: 15,
      });
    });

    it('should validate only the user-provided arguments, not the bound ones', async () => {
      const boundTool = tool.bindParams({query: 'a valid query'});
      mockAxiosPost.mockResolvedValueOnce({data: 'success'});
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
        expectedError
      );
    });

    it('should resolve function values in bound parameters before making the API call', async () => {
      const dynamicQuery = async () => 'resolved-query';
      const boundTool = tool.bindParams({query: dynamicQuery});
      mockAxiosPost.mockResolvedValueOnce({data: 'success'});
      await boundTool({limit: 5});
      expect(utils.resolveValue).toHaveBeenCalledWith(dynamicQuery);
      expect(mockAxiosPost).toHaveBeenCalledWith(expectedUrl, {
        query: 'resolved-query',
        limit: 5,
      });
    });
  });
});
