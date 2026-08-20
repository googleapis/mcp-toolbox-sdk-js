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

import * as path from 'path';
import * as fs from 'fs-extra';
import {spawn} from 'child_process';
import {
  getEnvVar,
  accessSecretVersion,
  createTmpFile,
  downloadBlob,
  getToolboxBinaryGcsPath,
  delay,
} from './utils';
import {CustomGlobal} from './types';

const TOOLBOX_BINARY_NAME = 'toolbox';
const SERVER_READY_TIMEOUT_MS = 30000; // 30 seconds
const SERVER_READY_POLL_INTERVAL_MS = 2000; // 2 seconds

export default async function globalSetup(): Promise<void> {
  console.log('\nJest Global Setup: Starting...');

  try {
    const projectId = getEnvVar('GOOGLE_CLOUD_PROJECT');
    const toolboxVersion = getEnvVar('TOOLBOX_VERSION');
    (globalThis as CustomGlobal).__GOOGLE_CLOUD_PROJECT__ = projectId;

    // Fetch tools manifest and create temp file
    const toolsManifest = await accessSecretVersion(
      projectId,
      'sdk_testing_tools',
      getEnvVar('TOOLBOX_MANIFEST_VERSION'),
    );
    const toolsFilePath = await createTmpFile(toolsManifest);
    (globalThis as CustomGlobal).__TOOLS_FILE_PATH__ = toolsFilePath;
    console.log(`Tools manifest stored at: ${toolsFilePath}`);

    // Download toolbox binary
    const toolboxGcsPath = getToolboxBinaryGcsPath(toolboxVersion);
    const localToolboxPath = path.resolve(__dirname, TOOLBOX_BINARY_NAME);

    const bucketName = 'mcp-toolbox-for-databases';
    console.log(
      `Downloading toolbox binary from gs://${bucketName}/${toolboxGcsPath} to ${localToolboxPath}...`,
    );
    await downloadBlob(bucketName, toolboxGcsPath, localToolboxPath);
    console.log('Toolbox binary downloaded successfully.');

    // Make toolbox executable
    await fs.chmod(localToolboxPath, 0o700);

    // Start toolbox servers
    console.log('Starting toolbox server processes...');
    const serverProcess1 = spawn(
      localToolboxPath,
      ['--port', '5000', '--tools-file', toolsFilePath],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const serverProcess2 = spawn(
      localToolboxPath,
      ['--port', '5001', '--tools-file', toolsFilePath, '--enable-draft-specs'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    (globalThis as CustomGlobal).__TOOLBOX_SERVER_PROCESS__ = serverProcess1;
    (globalThis as CustomGlobal).__TOOLBOX_SERVER_PROCESS_2__ = serverProcess2;

    serverProcess1.stdout?.on('data', (data: Buffer) => {
      console.log(`[ToolboxServer1 STDOUT]: ${data.toString().trim()}`);
    });
    serverProcess1.stderr?.on('data', (data: Buffer) => {
      console.error(`[ToolboxServer1 STDERR]: ${data.toString().trim()}`);
    });
    serverProcess1.on('error', err => {
      console.error('Toolbox server 1 process error:', err);
      throw new Error('Failed to start toolbox server 1 process.');
    });
    serverProcess1.on('exit', (code, signal) => {
      console.log(
        `Toolbox server 1 process exited with code ${code}, signal ${signal}.`,
      );
      if (
        (globalThis as CustomGlobal).__TOOLBOX_SERVER_PROCESS__ &&
        !(globalThis as CustomGlobal).__SERVER_TEARDOWN_INITIATED__
      ) {
        console.error('Toolbox server 1 exited prematurely during setup.');
      }
    });

    serverProcess2.stdout?.on('data', (data: Buffer) => {
      console.log(`[ToolboxServer2 STDOUT]: ${data.toString().trim()}`);
    });
    serverProcess2.stderr?.on('data', (data: Buffer) => {
      console.error(`[ToolboxServer2 STDERR]: ${data.toString().trim()}`);
    });
    serverProcess2.on('error', err => {
      console.error('Toolbox server 2 process error:', err);
      throw new Error('Failed to start toolbox server 2 process.');
    });
    serverProcess2.on('exit', (code, signal) => {
      console.log(
        `Toolbox server 2 process exited with code ${code}, signal ${signal}.`,
      );
      if (
        (globalThis as CustomGlobal).__TOOLBOX_SERVER_PROCESS_2__ &&
        !(globalThis as CustomGlobal).__SERVER_TEARDOWN_INITIATED__
      ) {
        console.error('Toolbox server 2 exited prematurely during setup.');
      }
    });

    // Wait for servers to start (basic poll check)
    let started1 = false;
    let started2 = false;
    const startTime = Date.now();
    while (Date.now() - startTime < SERVER_READY_TIMEOUT_MS) {
      if (
        serverProcess1.pid &&
        !serverProcess1.killed &&
        serverProcess1.exitCode === null
      ) {
        started1 = true;
      }
      if (
        serverProcess2.pid &&
        !serverProcess2.killed &&
        serverProcess2.exitCode === null
      ) {
        started2 = true;
      }
      if (started1 && started2) {
        console.log(
          'Both Toolbox servers started successfully (processes are active).',
        );
        break;
      }
      await delay(SERVER_READY_POLL_INTERVAL_MS);
      console.log('Checking if toolbox servers are started...');
    }

    if (!started1 || !started2) {
      if (serverProcess1 && !serverProcess1.killed)
        serverProcess1.kill('SIGTERM');
      if (serverProcess2 && !serverProcess2.killed)
        serverProcess2.kill('SIGTERM');
      throw new Error(
        `Toolbox servers failed to start within ${SERVER_READY_TIMEOUT_MS / 1000} seconds.`,
      );
    }

    console.log('Jest Global Setup: Completed successfully.');
  } catch (error) {
    console.error('Jest Global Setup Failed:', error);
    // Attempt to kill servers if they started partially
    const serverProcess1 = (globalThis as CustomGlobal)
      .__TOOLBOX_SERVER_PROCESS__;
    const serverProcess2 = (globalThis as CustomGlobal)
      .__TOOLBOX_SERVER_PROCESS_2__;
    if (serverProcess1 && !serverProcess1.killed) {
      console.log('Attempting to terminate partially started server 1...');
      serverProcess1.kill('SIGKILL');
    }
    if (serverProcess2 && !serverProcess2.killed) {
      console.log('Attempting to terminate partially started server 2...');
      serverProcess2.kill('SIGKILL');
    }
    // Clean up temp file if created
    const toolsFilePath = (globalThis as CustomGlobal).__TOOLS_FILE_PATH__;
    if (toolsFilePath) {
      try {
        await fs.remove(toolsFilePath);
      } catch (e) {
        console.error(
          'Error removing temp tools file during setup failure:',
          e,
        );
      }
    }
    (globalThis as CustomGlobal).__GOOGLE_CLOUD_PROJECT__ = undefined;
    throw error;
  }
}
