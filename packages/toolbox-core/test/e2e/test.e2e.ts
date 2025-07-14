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

import {ToolboxClient} from '../../src/toolbox_core/client';
import {ToolboxTool} from '../../src/toolbox_core/tool';

import {AxiosError} from 'axios';
import {CustomGlobal} from './types';
import {authTokenGetter} from './utils';
import {ZodOptional, ZodNullable, ZodTypeAny} from 'zod';

describe('ToolboxClient E2E Tests', () => {
  let commonToolboxClient: ToolboxClient;
  let getNRowsTool: ReturnType<typeof ToolboxTool>;
  const testBaseUrl = 'http://localhost:5000';
  const projectId = (globalThis as CustomGlobal).__GOOGLE_CLOUD_PROJECT__;

  beforeAll(async () => {
    commonToolboxClient = new ToolboxClient(testBaseUrl);
  });

  beforeEach(async () => {
    getNRowsTool = await commonToolboxClient.loadTool('get-n-rows');
    expect(getNRowsTool.getName()).toBe('get-n-rows');
  });

  describe('invokeTool', () => {
    it('should invoke the getNRowsTool', async () => {
      const response = await getNRowsTool({num_rows: '2'});
      expect(typeof response).toBe('string');
      expect(response).toContain('row1');
      expect(response).toContain('row2');
      expect(response).not.toContain('row3');
    });

    it('should invoke the getNRowsTool with missing params', async () => {
      await expect(getNRowsTool()).rejects.toThrow(
        /Argument validation failed for tool "get-n-rows":\s*- num_rows: Required/
      );
    });

    it('should invoke the getNRowsTool with wrong param type', async () => {
      await expect(getNRowsTool({num_rows: 2})).rejects.toThrow(
        /Argument validation failed for tool "get-n-rows":\s*- num_rows: Expected string, received number/
      );
    });
  });

  describe('loadToolset', () => {
    const specificToolsetTestCases = [
      {
        name: 'my-toolset',
        expectedLength: 1,
        expectedTools: ['get-row-by-id'],
      },
      {
        name: 'my-toolset-2',
        expectedLength: 2,
        expectedTools: ['get-n-rows', 'get-row-by-id'],
      },
    ];

    specificToolsetTestCases.forEach(testCase => {
      it(`should successfully load the specific toolset "${testCase.name}"`, async () => {
        const loadedTools = await commonToolboxClient.loadToolset(
          testCase.name
        );

        expect(Array.isArray(loadedTools)).toBe(true);
        expect(loadedTools.length).toBe(testCase.expectedLength);

        const loadedToolNames = new Set(
          loadedTools.map(tool => tool.getName())
        );
        expect(loadedToolNames).toEqual(new Set(testCase.expectedTools));

        for (const tool of loadedTools) {
          expect(typeof tool).toBe('function');
          expect(tool.getName).toBeInstanceOf(Function);
          expect(tool.getDescription).toBeInstanceOf(Function);
          expect(tool.getParamSchema).toBeInstanceOf(Function);
        }
      });
    });

    it('should successfully load the default toolset (all tools)', async () => {
      const loadedTools = await commonToolboxClient.loadToolset(); // Load the default toolset (no name provided)
      expect(Array.isArray(loadedTools)).toBe(true);
      expect(loadedTools.length).toBeGreaterThan(0);
      const getNRowsToolFromSet = loadedTools.find(
        tool => tool.getName() === 'get-n-rows'
      );

      expect(getNRowsToolFromSet).toBeDefined();
      expect(typeof getNRowsToolFromSet).toBe('function');
      expect(getNRowsToolFromSet?.getName()).toBe('get-n-rows');
      expect(getNRowsToolFromSet?.getDescription()).toBeDefined();
      expect(getNRowsToolFromSet?.getParamSchema()).toBeDefined();

      const loadedToolNames = new Set(loadedTools.map(tool => tool.getName()));
      const expectedDefaultTools = new Set([
        'get-row-by-content-auth',
        'get-row-by-email-auth',
        'get-row-by-id-auth',
        'get-row-by-id',
        'get-n-rows',
        'search-rows',
      ]);
      expect(loadedToolNames).toEqual(expectedDefaultTools);

      for (const tool of loadedTools) {
        expect(typeof tool).toBe('function');
        expect(tool.getName).toBeInstanceOf(Function);
        expect(tool.getDescription).toBeInstanceOf(Function);
        expect(tool.getParamSchema).toBeInstanceOf(Function);
      }
    });

    it('should throw an error when trying to load a non-existent toolset', async () => {
      await expect(
        commonToolboxClient.loadToolset('non-existent-toolset')
      ).rejects.toThrow('Request failed with status code 404');
    });
  });
  describe('bindParams', () => {
    it('should successfully bind a parameter with bindParam and invoke', async () => {
      const newTool = getNRowsTool.bindParam('num_rows', '3');
      const response = await newTool(); // Invoke with no args
      expect(response).toContain('row1');
      expect(response).toContain('row2');
      expect(response).toContain('row3');
      expect(response).not.toContain('row4');
    });

    it('should successfully bind parameters with bindParams and invoke', async () => {
      const newTool = getNRowsTool.bindParams({num_rows: '3'});
      const response = await newTool(); // Invoke with no args
      expect(response).toContain('row1');
      expect(response).toContain('row2');
      expect(response).toContain('row3');
      expect(response).not.toContain('row4');
    });

    it('should successfully bind a synchronous function value', async () => {
      const newTool = getNRowsTool.bindParams({num_rows: () => '1'});
      const response = await newTool();
      expect(response).toContain('row1');
      expect(response).not.toContain('row2');
    });

    it('should successfully bind an asynchronous function value', async () => {
      const asyncNumProvider = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return '1';
      };

      const newTool = getNRowsTool.bindParams({num_rows: asyncNumProvider});
      const response = await newTool();
      expect(response).toContain('row1');
      expect(response).not.toContain('row2');
    });

    it('should successfully bind parameters at load time', async () => {
      const tool = await commonToolboxClient.loadTool('get-n-rows', null, {
        num_rows: '3',
      });
      const response = await tool();
      expect(response).toContain('row1');
      expect(response).toContain('row2');
      expect(response).toContain('row3');
      expect(response).not.toContain('row4');
    });

    it('should throw an error when re-binding an existing parameter', () => {
      const newTool = getNRowsTool.bindParam('num_rows', '1');
      expect(() => {
        newTool.bindParam('num_rows', '2');
      }).toThrow(
        "Cannot re-bind parameter: parameter 'num_rows' is already bound in tool 'get-n-rows'."
      );
    });

    it('should throw an error when binding a non-existent parameter', () => {
      expect(() => {
        getNRowsTool.bindParam('non_existent_param', '2');
      }).toThrow(
        "Unable to bind parameter: no parameter named 'non_existent_param' in tool 'get-n-rows'."
      );
    });
  });

  describe('Auth E2E Tests', () => {
    let authToken1: string;
    let authToken2: string;
    let authToken1Getter: () => string;
    let authToken2Getter: () => string;

    beforeAll(async () => {
      if (!projectId) {
        throw new Error(
          'GOOGLE_CLOUD_PROJECT is not defined. Cannot run Auth E2E tests.'
        );
      }
      authToken1 = await authTokenGetter(projectId, 'sdk_testing_client1');
      authToken2 = await authTokenGetter(projectId, 'sdk_testing_client2');

      authToken1Getter = () => authToken1;
      authToken2Getter = () => authToken2;
    });

    it('should fail when running a tool that does not require auth with auth provided', async () => {
      await expect(
        commonToolboxClient.loadTool('get-row-by-id', {
          'my-test-auth': authToken2Getter,
        })
      ).rejects.toThrow(
        "Validation failed for tool 'get-row-by-id': unused auth tokens: my-test-auth"
      );
    });

    it('should fail when running a tool requiring auth without providing auth', async () => {
      const tool = await commonToolboxClient.loadTool('get-row-by-id-auth');
      await expect(tool({id: '2'})).rejects.toThrow(
        'One or more of the following authn services are required to invoke this tool: my-test-auth'
      );
    });

    it('should fail when running a tool with incorrect auth', async () => {
      const tool = await commonToolboxClient.loadTool('get-row-by-id-auth');
      const authTool = tool.addAuthTokenGetters({
        'my-test-auth': authToken2Getter,
      });
      try {
        await authTool({id: '2'});
      } catch (error) {
        expect(error).toBeInstanceOf(AxiosError);
        const axiosError = error as AxiosError;
        expect(axiosError.response?.status).toBe(401);
        expect(axiosError.response?.data).toEqual(
          expect.objectContaining({
            error:
              'tool invocation not authorized. Please make sure your specify correct auth headers',
          })
        );
      }
    });

    it('should succeed when running a tool with correct auth', async () => {
      const tool = await commonToolboxClient.loadTool('get-row-by-id-auth');
      const authTool = tool.addAuthTokenGetters({
        'my-test-auth': authToken1Getter,
      });
      const response = await authTool({id: '2'});
      expect(response).toContain('row2');
    });

    it('should succeed when running a tool with correct async auth', async () => {
      const tool = await commonToolboxClient.loadTool('get-row-by-id-auth');
      const getAsyncToken = async () => {
        return authToken1Getter();
      };
      const authTool = tool.addAuthTokenGetters({
        'my-test-auth': getAsyncToken,
      });
      const response = await authTool({id: '2'});
      expect(response).toContain('row2');
    });

    it('should fail when a tool with a param requiring auth is run without auth', async () => {
      const tool = await commonToolboxClient.loadTool('get-row-by-email-auth');
      await expect(tool()).rejects.toThrow(
        'One or more of the following authn services are required to invoke this tool: my-test-auth'
      );
    });

    it('should succeed when a tool with a param requiring auth is run with correct auth', async () => {
      const tool = await commonToolboxClient.loadTool('get-row-by-email-auth', {
        'my-test-auth': authToken1Getter,
      });
      const response = await tool();
      expect(response).toContain('row4');
      expect(response).toContain('row5');
      expect(response).toContain('row6');
    });

    it('should fail when a tool with a param requiring auth is run with insufficient auth claims', async () => {
      expect.assertions(3); // Adjusted to account for logApiError's console.error

      const tool = await commonToolboxClient.loadTool(
        'get-row-by-content-auth',
        {
          'my-test-auth': authToken1Getter,
        }
      );
      try {
        await tool();
      } catch (error) {
        expect(error).toBeInstanceOf(AxiosError);
        const axiosError = error as AxiosError;
        expect(axiosError.response?.data).toEqual(
          expect.objectContaining({
            error:
              'provided parameters were invalid: error parsing authenticated parameter "data": no field named row_data in claims',
          })
        );
      }
    });
  });

  describe('Optional Params E2E Tests', () => {
    let searchRowsTool: ReturnType<typeof ToolboxTool>;

    beforeAll(async () => {
      searchRowsTool = await commonToolboxClient.loadTool('search-rows');
    });

    it('should correctly identify required and optional parameters in the schema', () => {
      const paramSchema = searchRowsTool.getParamSchema();
      const {shape} = paramSchema;

      // Required param 'email'
      expect(shape.email.isOptional()).toBe(false);
      expect(shape.email.isNullable()).toBe(false);
      expect(shape.email._def.typeName).toBe('ZodString');

      // Optional param 'data'
      expect(shape.data.isOptional()).toBe(true);
      expect(shape.data.isNullable()).toBe(true);
      expect(
        (shape.data as ZodOptional<ZodNullable<ZodTypeAny>>).unwrap().unwrap()
          ._def.typeName
      ).toBe('ZodString');

      // Optional param 'id'
      expect(shape.id.isOptional()).toBe(true);
      expect(shape.id.isNullable()).toBe(true);
      expect(
        (shape.id as ZodOptional<ZodNullable<ZodTypeAny>>).unwrap().unwrap()
          ._def.typeName
      ).toBe('ZodNumber');
    });

    it('should run tool with optional params omitted', async () => {
      const response = await searchRowsTool({email: 'twishabansal@google.com'});
      expect(typeof response).toBe('string');
      expect(response).toContain('"email":"twishabansal@google.com"');
      expect(response).not.toContain('row1');
      expect(response).toContain('row2');
      expect(response).not.toContain('row3');
      expect(response).not.toContain('row4');
      expect(response).not.toContain('row5');
      expect(response).not.toContain('row6');
    });

    it('should run tool with optional data provided', async () => {
      const response = await searchRowsTool({
        email: 'twishabansal@google.com',
        data: 'row3',
      });
      expect(typeof response).toBe('string');
      expect(response).toContain('"email":"twishabansal@google.com"');
      expect(response).not.toContain('row1');
      expect(response).not.toContain('row2');
      expect(response).toContain('row3');
      expect(response).not.toContain('row4');
      expect(response).not.toContain('row5');
      expect(response).not.toContain('row6');
    });

    it('should run tool with optional data as null', async () => {
      const response = await searchRowsTool({
        email: 'twishabansal@google.com',
        data: null,
      });
      expect(typeof response).toBe('string');
      expect(response).toContain('"email":"twishabansal@google.com"');
      expect(response).not.toContain('row1');
      expect(response).toContain('row2');
      expect(response).not.toContain('row3');
      expect(response).not.toContain('row4');
      expect(response).not.toContain('row5');
      expect(response).not.toContain('row6');
    });

    it('should run tool with optional id provided', async () => {
      const response = await searchRowsTool({
        email: 'twishabansal@google.com',
        id: 1,
      });
      expect(typeof response).toBe('string');
      expect(response).toBe('null');
    });

    it('should run tool with optional id as null', async () => {
      const response = await searchRowsTool({
        email: 'twishabansal@google.com',
        id: null,
      });
      expect(typeof response).toBe('string');
      expect(response).toContain('"email":"twishabansal@google.com"');
      expect(response).not.toContain('row1');
      expect(response).toContain('row2');
      expect(response).not.toContain('row3');
      expect(response).not.toContain('row4');
      expect(response).not.toContain('row5');
      expect(response).not.toContain('row6');
    });

    it('should fail when a required param is missing', async () => {
      await expect(searchRowsTool({id: 5, data: 'row5'})).rejects.toThrow(
        /Argument validation failed for tool "search-rows":\s*- email: Required/
      );
    });

    it('should fail when a required param is null', async () => {
      await expect(
        searchRowsTool({email: null, id: 5, data: 'row5'})
      ).rejects.toThrow(
        /Argument validation failed for tool "search-rows":\s*- email: Expected string, received null/
      );
    });

    it('should run tool with all default params', async () => {
      const response = await searchRowsTool({
        email: 'twishabansal@google.com',
        id: 0,
        data: 'row2',
      });
      expect(typeof response).toBe('string');
      expect(response).toContain('"email":"twishabansal@google.com"');
      expect(response).not.toContain('row1');
      expect(response).toContain('row2');
      expect(response).not.toContain('row3');
      expect(response).not.toContain('row4');
      expect(response).not.toContain('row5');
      expect(response).not.toContain('row6');
    });

    it('should run tool with all valid params', async () => {
      const response = await searchRowsTool({
        email: 'twishabansal@google.com',
        id: 3,
        data: 'row3',
      });
      expect(typeof response).toBe('string');
      expect(response).toContain('"email":"twishabansal@google.com"');
      expect(response).not.toContain('row1');
      expect(response).not.toContain('row2');
      expect(response).toContain('row3');
      expect(response).not.toContain('row4');
      expect(response).not.toContain('row5');
      expect(response).not.toContain('row6');
    });

    it('should return null when called with a different email', async () => {
      const response = await searchRowsTool({
        email: 'anubhavdhawan@google.com',
        id: 3,
        data: 'row3',
      });
      expect(typeof response).toBe('string');
      expect(response).toBe('null');
    });

    it('should return null when called with different data', async () => {
      const response = await searchRowsTool({
        email: 'twishabansal@google.com',
        id: 3,
        data: 'row4',
      });
      expect(typeof response).toBe('string');
      expect(response).toBe('null');
    });

    it('should return null when called with a different id', async () => {
      const response = await searchRowsTool({
        email: 'twishabansal@google.com',
        id: 4,
        data: 'row3',
      });
      expect(typeof response).toBe('string');
      expect(response).toBe('null');
    });
  });
});
