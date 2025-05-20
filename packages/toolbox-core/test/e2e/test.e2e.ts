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

describe('ToolboxClient E2E Tests', () => {
  let commonToolboxClient: ToolboxClient;
  let getNRowsTool: ReturnType<typeof ToolboxTool>;

  beforeAll(async () => {
    commonToolboxClient = new ToolboxClient('http://localhost:5000');
  });

  beforeEach(async () => {
    getNRowsTool = await commonToolboxClient.loadTool('get-n-rows');
    expect(getNRowsTool.getName()).toBe('get-n-rows');
  });

  describe('loadTool', () => {
    it('should try to load a tool that does not exist', async () => {
      await expect(commonToolboxClient.loadTool('random-tool')).rejects.toThrow(
        /random-tool does not exist/
      );
    });
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
});
