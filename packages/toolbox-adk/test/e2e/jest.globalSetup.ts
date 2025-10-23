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

    console.log(
      `Downloading toolbox binary from gs://genai-toolbox/${toolboxGcsPath} to ${localToolboxPath}...`,
    );
    await downloadBlob('genai-toolbox', toolboxGcsPath, localToolboxPath);
    console.log('Toolbox binary downloaded successfully.');

    // Make toolbox executable
    await fs.chmod(localToolboxPath, 0o700);

    // Start toolbox server
    console.log('Starting toolbox server process...');
    const serverProcess = spawn(
      localToolboxPath,
      ['--tools-file', toolsFilePath],
      {
        stdio: ['ignore', 'pipe', 'pipe'], // ignore stdin, pipe stdout/stderr
      },
    );

    (globalThis as CustomGlobal).__TOOLBOX_SERVER_PROCESS__ = serverProcess;

    serverProcess.stdout?.on('data', (data: Buffer) => {
      console.log(`[ToolboxServer STDOUT]: ${data.toString().trim()}`);
    });

    serverProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[ToolboxServer STDERR]: ${data.toString().trim()}`);
    });

    serverProcess.on('error', err => {
      console.error('Toolbox server process error:', err);
      throw new Error('Failed to start toolbox server process.');
    });

    serverProcess.on('exit', (code, signal) => {
      console.log(
        `Toolbox server process exited with code ${code}, signal ${signal}.`,
      );
      if (
        (globalThis as CustomGlobal).__TOOLBOX_SERVER_PROCESS__ &&
        !(globalThis as CustomGlobal).__SERVER_TEARDOWN_INITIATED__
      ) {
        console.error('Toolbox server exited prematurely during setup.');
      }
    });

    // Wait for server to start (basic poll check)
    let started = false;
    const startTime = Date.now();
    while (Date.now() - startTime < SERVER_READY_TIMEOUT_MS) {
      if (
        serverProcess.pid &&
        !serverProcess.killed &&
        serverProcess.exitCode === null
      ) {
        console.log(
          'Toolbox server process appears to be running. Polling for stability...',
        );
        await delay(SERVER_READY_POLL_INTERVAL_MS * 2);
        if (serverProcess.exitCode === null) {
          console.log(
            'Toolbox server started successfully (process is active).',
          );
          started = true;
          break;
        } else {
          console.log('Toolbox server process exited after initial start.');
          break;
        }
      }
      await delay(SERVER_READY_POLL_INTERVAL_MS);
      console.log('Checking if toolbox server is started...');
    }

    if (!started) {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGTERM');
      }
      throw new Error(
        `Toolbox server failed to start within ${SERVER_READY_TIMEOUT_MS / 1000} seconds.`,
      );
    }

    console.log('Jest Global Setup: Completed successfully.');
  } catch (error) {
    console.error('Jest Global Setup Failed:', error);
    // Attempt to kill server if it started partially
    const serverProcess = (globalThis as CustomGlobal)
      .__TOOLBOX_SERVER_PROCESS__;
    if (serverProcess && !serverProcess.killed) {
      console.log('Attempting to terminate partially started server...');
      serverProcess.kill('SIGKILL');
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