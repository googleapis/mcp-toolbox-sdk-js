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
// 
import { test, expect } from './fixtures';
import { ToolboxTool } from '../../src/toolbox_core/tool';


test.describe('TestBasicE2E', () => {
  let getNRowsTool: ReturnType<typeof ToolboxTool>; // Declare a variable to hold the loaded tool

  test.beforeEach(async ({ toolboxClient }) => {
    // Load the tool before each test in this describe block
    getNRowsTool = await toolboxClient.loadTool('get-n-rows');
    expect((getNRowsTool as any).toolName).toBe('get-n-rows'); // Basic assertion
  });

  test('run_tool', async () => { // No longer destructures getNRowsTool from fixture
    const response = await getNRowsTool({ num_rows: '2' });
    expect(typeof response).toBe('string');
    expect(response).toContain('row1');
    expect(response).toContain('row2');
    expect(response).not.toContain('row3');
  });
  
  test('run_tool_missing_params', async () => {
    await expect(getNRowsTool())
      .rejects.toThrowError(/missing a required argument: 'num_rows'|InputCoercionError|ValidationError/i);
  });

  test('run_tool_wrong_param_type', async () => {
    await expect(getNRowsTool({ num_rows: 2 } as any))
      .rejects.toThrowError(/Input should be a valid string|ValidationError|Expected string, received number/i);
  });
});
