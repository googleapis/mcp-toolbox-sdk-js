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

import { test as baseTest, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as child_process from 'child_process';
import {
  getEnvVar,
  accessSecretVersion,
  createTmpfileSync,
  downloadBlob,
  getToolboxBinaryUrl,
  getAuthToken,
} from './utils.js';
import { ToolboxClient } from '../../src/toolbox_core/client.js';
import { ToolboxTool } from '../../src/toolbox_core/tool.js';


/**
 * Defines types for worker-scoped fixtures.
 * These fixtures are set up once per worker process.
 */
type MyWorkerFixtures = {
  projectId: string;
  toolboxVersion: string;
  toolsFilePath: string;
  authToken1: string;
  authToken2: string;
  toolboxServer: void; // This fixture ensures the server is up; provides no direct value.
};

/**
 * Defines types for test-scoped fixtures.
 * These fixtures are set up for each test.
 */
type MyTestFixtures = {
  toolboxClient: ToolboxClient;
  getNRowsTool: typeof ToolboxTool;
};

// Extend Playwright's base 'test' with custom fixtures
export const test = baseTest.extend<MyTestFixtures, MyWorkerFixtures>({
  /** Provides an initialized ToolboxClient connected to the local server. */
  toolboxClient: async ({ toolboxServer: _ }, use) => {
    const client = new ToolboxClient('http://localhost:5000');
    await use(client);
    // TODO: Close the client
    // finally {
    //   await client.close();
    // }
  },
});

export { expect };