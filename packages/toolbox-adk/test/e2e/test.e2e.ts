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
  ToolboxTool,
  Protocol,
} from '../../src/toolbox_adk/index.js';

import {AxiosError} from 'axios';
import {CustomGlobal} from './types.js';
import {ToolContext} from '@google/adk';

import {authTokenGetter} from './utils.js';

describe('ToolboxClient E2E Tests', () => {
  let commonToolboxClient: ToolboxClient;
  let getNRowsTool: ToolboxTool;
  const testBaseUrl = 'http://localhost:5000';
  const projectId = (globalThis as CustomGlobal).__GOOGLE_CLOUD_PROJECT__;

  const mockToolContext = {} as ToolContext;

  beforeAll(async () => {
    commonToolboxClient = new ToolboxClient(
      testBaseUrl,
      undefined,
      undefined,
      Protocol.MCP,
    );
  });

  beforeEach(async () => {
    getNRowsTool = await commonToolboxClient.loadTool('get-n-rows');
    expect(getNRowsTool.name).toBe('get-n-rows');
  });

  describe('invokeTool', () => {
    it('should invoke the getNRowsTool', async () => {
      const response = await getNRowsTool.runAsync({
        args: {num_rows: '2'},
        toolContext: mockToolContext,
      });
      expect(typeof response).toBe('string');
      expect(response).toContain('row1');
      expect(response).toContain('row2');
      expect(response).not.toContain('row3');
    });

    it('should invoke the getNRowsTool with missing params', async () => {
      await expect(
        getNRowsTool.runAsync({args: {}, toolContext: mockToolContext}),
      ).rejects.toThrow(
        /Argument validation failed for tool "get-n-rows":\s*- num_rows: Required/,
      );
    });

    it('should invoke the getNRowsTool with wrong param type', async () => {
      await expect(
        getNRowsTool.runAsync({
          args: {num_rows: 2},
          toolContext: mockToolContext,
        }),
      ).rejects.toThrow(
        /Argument validation failed for tool "get-n-rows":\s*- num_rows: Expected string, received number/,
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
          testCase.name,
        );

        expect(Array.isArray(loadedTools)).toBe(true);
        expect(loadedTools.length).toBe(testCase.expectedLength);

        const loadedToolNames = new Set(
          loadedTools.map((tool: ToolboxTool) => tool.name),
        );
        expect(loadedToolNames).toEqual(new Set(testCase.expectedTools));

        for (const tool of loadedTools) {
          expect(typeof tool).toBe('object');
          expect(tool).toBeInstanceOf(ToolboxTool);

          expect(tool).toBeInstanceOf(ToolboxTool);
          const declaration = tool._getDeclaration();
          expect(declaration).toBeDefined();

          expect(testCase.expectedTools).toContain(declaration!.name);
          expect(declaration!.parameters).toBeDefined();
        }
      });
    });

    it('should successfully load the default toolset (all tools)', async () => {
      const loadedTools = await commonToolboxClient.loadToolset(); // Load the default toolset (no name provided)
      expect(Array.isArray(loadedTools)).toBe(true);
      expect(loadedTools.length).toBeGreaterThan(0);
      const getNRowsToolFromSet = loadedTools.find(
        (tool: ToolboxTool) => tool.name === 'get-n-rows',
      ) as ToolboxTool;

      expect(getNRowsToolFromSet).toBeDefined();
      const declaration = getNRowsToolFromSet._getDeclaration();
      expect(declaration).toBeDefined();
      expect(declaration?.name).toBe('get-n-rows');
      expect(declaration?.parameters).toBeDefined();

      const loadedToolNames = new Set(
        loadedTools.map((tool: ToolboxTool) => tool.name),
      );
      const expectedDefaultTools = new Set([
        'get-row-by-content-auth',
        'get-row-by-email-auth',
        'get-row-by-id-auth',
        'get-row-by-id',
        'get-n-rows',
        'search-rows',
        'process-data',
      ]);
      expect(loadedToolNames).toEqual(expectedDefaultTools);
    });

    it('should throw an error when trying to load a non-existent toolset', async () => {
      await expect(
        commonToolboxClient.loadToolset('non-existent-toolset'),
      ).rejects.toThrow('Request failed with status code 404');
    });
  });
  describe('bindParams', () => {
    it('should successfully bind a parameter with bindParam and invoke', async () => {
      const newTool = getNRowsTool.bindParam('num_rows', '3');
      const response = await newTool.runAsync({
        args: {},
        toolContext: mockToolContext,
      }); // Invoke with no args
      expect(response).toContain('row1');
      expect(response).toContain('row2');
      expect(response).toContain('row3');
      expect(response).not.toContain('row4');
    });

    it('should successfully bind parameters with bindParams and invoke', async () => {
      const newTool = getNRowsTool.bindParams({num_rows: '3'});
      const response = await newTool.runAsync({
        args: {},
        toolContext: mockToolContext,
      }); // Invoke with no args
      expect(response).toContain('row1');
      expect(response).toContain('row2');
      expect(response).toContain('row3');
      expect(response).not.toContain('row4');
    });

    it('should successfully bind a synchronous function value', async () => {
      const newTool = getNRowsTool.bindParams({num_rows: () => '1'});
      const response = await newTool.runAsync({
        args: {},
        toolContext: mockToolContext,
      });
      expect(response).toContain('row1');
      expect(response).not.toContain('row2');
    });

    it('should successfully bind an asynchronous function value', async () => {
      const asyncNumProvider = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return '1';
      };

      const newTool = getNRowsTool.bindParams({num_rows: asyncNumProvider});
      const response = await newTool.runAsync({
        args: {},
        toolContext: mockToolContext,
      });
      expect(response).toContain('row1');
      expect(response).not.toContain('row2');
    });

    it('should successfully bind parameters at load time', async () => {
      const tool = await commonToolboxClient.loadTool('get-n-rows', null, {
        num_rows: '3',
      });
      const response = await tool.runAsync({
        args: {},
        toolContext: mockToolContext,
      });
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
        "Cannot re-bind parameter: parameter 'num_rows' is already bound in tool 'get-n-rows'.",
      );
    });

    it('should throw an error when binding a non-existent parameter', () => {
      expect(() => {
        getNRowsTool.bindParam('non_existent_param', '2');
      }).toThrow(
        "Unable to bind parameter: no parameter named 'non_existent_param' in tool 'get-n-rows'.",
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
          'GOOGLE_CLOUD_PROJECT is not defined. Cannot run Auth E2E tests.',
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
        }),
      ).rejects.toThrow(
        "Validation failed for tool 'get-row-by-id': unused auth tokens: my-test-auth",
      );
    });

    it('should fail when running a tool requiring auth without providing auth', async () => {
      const tool = await commonToolboxClient.loadTool('get-row-by-id-auth');
      await expect(
        tool.runAsync({args: {id: '2'}, toolContext: mockToolContext}),
      ).rejects.toThrow(
        'One or more of the following authn services are required to invoke this tool: my-test-auth',
      );
    });

    it('should fail when running a tool with incorrect auth', async () => {
      const tool = await commonToolboxClient.loadTool('get-row-by-id-auth');
      const authTool = tool.addAuthTokenGetters({
        'my-test-auth': authToken2Getter,
      });
      try {
        await authTool.runAsync({
          args: {id: '2'},
          toolContext: mockToolContext,
        });
      } catch (error) {
        expect((error as AxiosError).isAxiosError).toBe(true);
        const axiosError = error as AxiosError;
        expect(axiosError.response?.status).toBe(401);
        expect(axiosError.response?.data).toEqual(
          expect.objectContaining({
            error:
              'tool invocation not authorized. Please make sure you specify correct auth headers',
          }),
        );
      }
    });

    it('should succeed when running a tool with correct auth', async () => {
      const tool = await commonToolboxClient.loadTool('get-row-by-id-auth');
      const authTool = tool.addAuthTokenGetters({
        'my-test-auth': authToken1Getter,
      });
      const response = await authTool.runAsync({
        args: {id: '2'},
        toolContext: mockToolContext,
      });
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
      const response = await authTool.runAsync({
        args: {id: '2'},
        toolContext: mockToolContext,
      });
      expect(response).toContain('row2');
    });

    it('should fail when a tool with a param requiring auth is run without auth', async () => {
      const tool = await commonToolboxClient.loadTool('get-row-by-email-auth');
      await expect(
        tool.runAsync({args: {}, toolContext: mockToolContext}),
      ).rejects.toThrow(
        'One or more of the following authn services are required to invoke this tool: my-test-auth',
      );
    });

    it('should succeed when a tool with a param requiring auth is run with correct auth', async () => {
      const tool = await commonToolboxClient.loadTool('get-row-by-email-auth', {
        'my-test-auth': authToken1Getter,
      });
      const response = await tool.runAsync({
        args: {},
        toolContext: mockToolContext,
      });
      expect(response).toContain('row4');
      expect(response).toContain('row5');
      expect(response).toContain('row6');
    });

    it('should fail when a tool with a param requiring auth is run with insufficient auth claims', async () => {
      expect.assertions(3);

      const tool = await commonToolboxClient.loadTool(
        'get-row-by-content-auth',
        {
          'my-test-auth': authToken1Getter,
        },
      );
      try {
        await tool.runAsync({args: {}, toolContext: mockToolContext});
      } catch (error) {
        expect((error as AxiosError).isAxiosError).toBe(true);
        const axiosError = error as AxiosError;
        expect(axiosError.response?.data).toEqual(
          expect.objectContaining({
            error:
              'error parsing authenticated parameter "data": no field named row_data in claims',
          }),
        );
      }
    });
  });
});
