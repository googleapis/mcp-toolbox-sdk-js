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

import * as fs from 'fs-extra';
import {CustomGlobal} from './types.js';

const SERVER_TERMINATE_TIMEOUT_MS = 10000; // 10 seconds

export default async function globalTeardown(): Promise<void> {
  console.log('\nJest Global Teardown: Starting...');
  (globalThis as CustomGlobal).__SERVER_TEARDOWN_INITIATED__ = true;

  const customGlobal = globalThis as CustomGlobal;
  const serverProcess = customGlobal.__TOOLBOX_SERVER_PROCESS__;
  const toolsFilePath = customGlobal.__TOOLS_FILE_PATH__;

  if (serverProcess && !serverProcess.killed) {
    console.log('Stopping toolbox server process...');
    serverProcess.kill('SIGTERM'); // Graceful termination

    // Wait for the process to exit
    const stopPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!serverProcess.killed) {
          console.warn(
            'Toolbox server did not terminate gracefully, sending SIGKILL.',
          );
          serverProcess.kill('SIGKILL');
        }
        // Resolve even if SIGKILL is needed, as we want teardown to finish
        resolve();
      }, SERVER_TERMINATE_TIMEOUT_MS);

      serverProcess.on('exit', (code, signal) => {
        clearTimeout(timeout);
        console.log(
          `Toolbox server process exited with code ${code}, signal ${signal} during teardown.`,
        );
        resolve();
      });
      serverProcess.on('error', err => {
        // Should not happen if already running
        clearTimeout(timeout);
        console.error('Error during server process termination:', err);
        reject(err);
      });
    });

    try {
      await stopPromise;
    } catch (error) {
      console.error('Error while waiting for server to stop:', error);
      if (!serverProcess.killed) serverProcess.kill('SIGKILL'); // Ensure it's killed
    }
  } else {
    console.log('Toolbox server process was not running or already handled.');
  }

  if (toolsFilePath) {
    try {
      console.log(`Removing temporary tools file: ${toolsFilePath}`);
      await fs.remove(toolsFilePath);
    } catch (error) {
      console.error(
        `Failed to remove temporary tools file ${toolsFilePath}:`,
        error,
      );
    }
  }
  customGlobal.__TOOLBOX_SERVER_PROCESS__ = undefined;
  customGlobal.__TOOLS_FILE_PATH__ = undefined;
  customGlobal.__GOOGLE_CLOUD_PROJECT__ = undefined;

  console.log('Jest Global Teardown: Completed.');
}
