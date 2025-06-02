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

// Global mocks for Axios
const mockAxiosPost = jest.fn();
const mockSession = {
  post: mockAxiosPost,
} as unknown as AxiosInstance;

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
      tool = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        basicParamSchema,
        {},
        [],
        {}
      );
    });

    it('should correctly assign toolName, description, and params to the callable function', () => {
      expect(tool.toolName).toBe(toolName);
      expect(tool.description).toBe(toolDescription);
      expect(tool.params).toBe(basicParamSchema);
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
    beforeEach(() => {
      tool = ToolboxTool(
        mockSession,
        baseURL,
        toolName,
        toolDescription,
        basicParamSchema,
        {},
        [],
        {}
      );
    });

    it('should call paramSchema.parse with the provided arguments', async () => {
      const parseSpy = jest.spyOn(basicParamSchema, 'parse');
      const callArgs = {query: 'test query'};
      mockAxiosPost.mockResolvedValueOnce({data: 'success'} as AxiosResponse);

      await tool(callArgs);

      expect(parseSpy).toHaveBeenCalledWith(callArgs);
      parseSpy.mockRestore();
    });

    it('should throw a formatted ZodError if argument validation fails', async () => {
      const invalidArgs = {query: ''}; // Fails because of empty string

      try {
        await tool(invalidArgs);
        throw new Error('Expected tool to throw, but it did not.');
      } catch (e) {
        expect((e as Error).message).toBe(
          `Argument validation failed for tool "${toolName}":\n - query: Query cannot be empty`
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
        basicParamSchema,
        {},
        [],
        {}
      );
    });

    it('should make a POST request with the validated payload and no auth headers', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: mockApiResponseData,
      } as AxiosResponse);

      const result = await tool(validArgs);

      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
      expect(mockAxiosPost).toHaveBeenCalledWith(expectedUrl, validArgs, {
        headers: {},
      });
      expect(result).toEqual(mockApiResponseData);
    });

    it('should re-throw the error and log to console.error if API call fails', async () => {
      const apiError = new Error('API request failed');
      mockAxiosPost.mockRejectedValueOnce(apiError);

      await expect(tool(validArgs)).rejects.toThrow(apiError);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Error posting data to ${expectedUrl}:`,
        apiError
      );
    });
  });

  describe('Authentication', () => {
    const authedToolName = 'authedTool';
    const expectedUrl = `${baseURL}/api/tool/${authedToolName}/invoke`;

    it('should throw an error if called when auth is required but not provided', async () => {
      const authedTool = ToolboxTool(
        mockSession,
        baseURL,
        authedToolName,
        'An authed tool',
        basicParamSchema,
        {},
        ['my-test-auth'],
        {}
      );

      await expect(authedTool({query: 'test'})).rejects.toThrow(
        'One or more of the following authn services are required to invoke this tool: my-test-auth'
      );
    });

    it('addAuthTokenGetters should return a new, configured tool instance', async () => {
      const originalTool = ToolboxTool(
        mockSession,
        baseURL,
        authedToolName,
        'An authed tool',
        basicParamSchema,
        {},
        ['my-test-auth'],
        {}
      );

      const newTool = originalTool.addAuthTokenGetters({
        'my-test-auth': () => 'TOKEN',
      });

      expect(newTool).not.toBe(originalTool);

      mockAxiosPost.mockResolvedValueOnce({data: {result: 'success'}});
      await newTool({query: 'test'});

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expectedUrl,
        {query: 'test'},
        {headers: {'my-test-auth_token': 'TOKEN'}}
      );
    });

    it('addAuthTokenGetters should handle async token getters', async () => {
      const tool = ToolboxTool(
        mockSession,
        baseURL,
        authedToolName,
        'An authed tool',
        basicParamSchema,
        {},
        ['my-test-auth'],
        {}
      );
      const asyncTokenGetter = jest.fn().mockResolvedValue('ASYNC_TOKEN');
      const authedTool = tool.addAuthTokenGetters({
        'my-test-auth': asyncTokenGetter,
      });

      mockAxiosPost.mockResolvedValueOnce({data: 'success'});
      await authedTool({query: 'test'});

      expect(asyncTokenGetter).toHaveBeenCalled();
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expectedUrl,
        {query: 'test'},
        {headers: {'my-test-auth_token': 'ASYNC_TOKEN'}}
      );
    });

    it('addAuthTokenGetters should throw an error for duplicate auth sources', () => {
      const tool = ToolboxTool(
        mockSession,
        baseURL,
        authedToolName,
        'An authed tool',
        basicParamSchema,
        {},
        ['my-test-auth'],
        {'my-existing-auth': () => 'TOKEN1'}
      );

      expect(() =>
        tool.addAuthTokenGetters({'my-existing-auth': () => 'TOKEN2'})
      ).toThrow(
        'Authentication source(s) `my-existing-auth` already registered in tool `authedTool`.'
      );
    });

    it('addAuthTokenGetters should throw an error for unused auth sources', () => {
      const tool = ToolboxTool(
        mockSession,
        baseURL,
        authedToolName,
        'An authed tool',
        basicParamSchema,
        {},
        [],
        {}
      );

      expect(() =>
        tool.addAuthTokenGetters({'unused-auth': () => 'TOKEN'})
      ).toThrow('Authentication source(s) `unused-auth` unused by tool `authedTool`.');
    });
  });
});