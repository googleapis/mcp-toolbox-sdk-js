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
import {CallableTool} from '../../src/toolbox_core/tool';

describe('ToolboxClient E2E Tests', () => {
  let commonToolboxClient: ToolboxClient;
  let getNRowsTool: CallableTool;
  const testBaseUrl = 'http://localhost:5000';

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
      await expect(
        commonToolboxClient.loadToolset('non-existent-toolset')
      ).rejects.toThrow('Request failed with status code 404');
    });
  });

  describe('bindParams', () => {
    it('should successfully bind a parameter with bindParam and invoke', async () => {
      const newTool = getNRowsTool.bindParam('num_rows', '3');
      const response = await newTool(); // Invoke with no args
      const result = response['result'];
      expect(result).toContain('row1');
      expect(result).toContain('row2');
      expect(result).toContain('row3');
      expect(result).not.toContain('row4');
    });

    it('should successfully bind parameters with bindParams and invoke', async () => {
      const newTool = getNRowsTool.bindParams({num_rows: '3'});
      const response = await newTool(); // Invoke with no args
      const result = response['result'];
      expect(result).toContain('row1');
      expect(result).toContain('row2');
      expect(result).toContain('row3');
      expect(result).not.toContain('row4');
    });

    it('should successfully bind a synchronous function value', async () => {
      const newTool = getNRowsTool.bindParams({num_rows: () => '1'});
      const response = await newTool();
      const result = response['result'];
      expect(result).toContain('row1');
      expect(result).not.toContain('row2');
    });

    it('should successfully bind an asynchronous function value', async () => {
      const asyncNumProvider = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return '1';
      };
      const newTool = getNRowsTool.bindParams({num_rows: asyncNumProvider});
      const response = await newTool();
      const result = response['result'];
      expect(result).toContain('row1');
      expect(result).not.toContain('row2');
    });

    it('should successfully bind parameters at load time', async () => {
      const tool = await commonToolboxClient.loadTool('get-n-rows', {
        num_rows: '3',
      });
      const response = await tool();
      const result = response['result'];
      expect(result).toContain('row1');
      expect(result).toContain('row2');
      expect(result).toContain('row3');
      expect(result).not.toContain('row4');
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
});
