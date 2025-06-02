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
      const result = response['result'];
      expect(typeof result).toBe('string');
      expect(result).toContain('row1');
      expect(result).toContain('row2');
      expect(result).not.toContain('row3');
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
      // Spy on console.error to prevent logging for this specific, expected error.
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      try {
        await commonToolboxClient.loadToolset('non-existent-toolset');
        fail('Expected loadToolset to throw, but it did not.');
      } catch (error) {
        expect(error).toBeInstanceOf(AxiosError);
        const axiosError = error as AxiosError;
        expect(axiosError.response?.status).toBe(404);
      } finally {
        consoleErrorSpy.mockRestore();
      }
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
      await expect(authTool({id: '2'})).rejects.toThrow(
        'tool invocation not authorized'
      );
    });

    it('should succeed when running a tool with correct auth', async () => {
      const tool = await commonToolboxClient.loadTool('get-row-by-id-auth');
      const authTool = tool.addAuthTokenGetters({
        'my-test-auth': authToken1Getter,
      });
      const response = await authTool({id: '2'});
      expect(response.result).toContain('row2');
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
      expect(response.result).toContain('row2');
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
      expect(response.result).toContain('row4');
      expect(response.result).toContain('row5');
      expect(response.result).toContain('row6');
    });

    it('should fail when a tool with a param requiring auth is run with insufficient auth claims', async () => {
      const tool = await commonToolboxClient.loadTool(
        'get-row-by-content-auth',
        {
          'my-test-auth': authToken1Getter,
        }
      );
      try {
        await tool();
        fail('Expected tool to throw, but it did not.');
      } catch (error) {
        expect(error).toBeInstanceOf(AxiosError);
        const axiosError = error as AxiosError;
        expect(axiosError.response?.data).toEqual({
          error: 'no field named row_data in claims',
        });
      }
    });
  });
});