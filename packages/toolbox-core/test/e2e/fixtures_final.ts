// // Copyright 2025 Google LLC
// //
// // Licensed under the Apache License, Version 2.0 (the "License");
// // you may not use this file except in compliance with the License.
// // You may obtain a copy of the License at
// //
// //      http://www.apache.org/licenses/LICENSE-2.0
// //
// // Unless required by applicable law or agreed to in writing, software
// // distributed under the License is distributed on an "AS IS" BASIS,
// // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// // See the License for the specific language governing permissions and
// // limitations under the License.

// import { test as baseTest, expect } from '@playwright/test';
// import * as path from 'path';
// import * as fs from 'fs';
// import * as os from 'os';
// import * as child_process from 'child_process';
// import {
//   getEnvVar,
//   accessSecretVersion,
//   createTmpfileSync,
//   downloadBlob,
//   getToolboxBinaryUrl,
//   getAuthToken,
// } from './utils.js';
// import { ToolboxClient } from '../src/toolbox_core/client';
// import { ToolboxTool } from '../src/toolbox_core/tool';


// /**
//  * Defines types for worker-scoped fixtures.
//  * These fixtures are set up once per worker process.
//  */
// type MyWorkerFixtures = {
//   projectId: string;
//   toolboxVersion: string;
//   toolsFilePath: string;
//   authToken1: string;
//   authToken2: string;
//   toolboxServer: void; // This fixture ensures the server is up; provides no direct value.
// };

// /**
//  * Defines types for test-scoped fixtures.
//  * These fixtures are set up for each test.
//  */
// type MyTestFixtures = {
//   toolboxClient: ToolboxClient;
//   getNRowsTool: typeof ToolboxTool;
// };

// // Extend Playwright's base 'test' with custom fixtures
// export const test = baseTest.extend<MyTestFixtures, MyWorkerFixtures>({
//   projectId: [async ({}, use) => {
//     await use(getEnvVar('GOOGLE_CLOUD_PROJECT'));
//   }, { scope: 'worker' }],

//   toolboxVersion: [async ({}, use) => {
//     await use(getEnvVar('TOOLBOX_VERSION'));
//   }, { scope: 'worker' }],

//   /**
//    * Fetches a tools manifest from Secret Manager, writes it to a temporary file,
//    * and provides the file path. Cleans up the temporary file after use.
//    */
//   toolsFilePath: [async ({ projectId }, use) => {
//     const toolsManifest = await accessSecretVersion(projectId, 'sdk_testing_tools');
//     const tmpFile = createTmpfileSync(toolsManifest);
//     console.log(`Tools manifest created at: ${tmpFile.name}`);
//     try {
//       await use(tmpFile.name);
//     } finally {
//       console.log(`Cleaning up tools manifest: ${tmpFile.name}`);
//       tmpFile.cleanup();
//     }
//   }, { scope: 'worker' }],

//   /** Fetch Auth tokens based on a client ID from secrets. */
//   authToken1: [async ({ projectId }, use) => {
//     const clientId = await accessSecretVersion(projectId, 'sdk_testing_client1');
//     await use(await getAuthToken(clientId));
//   }, { scope: 'worker' }],
//   authToken2: [async ({ projectId }, use) => {
//     const clientId = await accessSecretVersion(projectId, 'sdk_testing_client2');
//     await use(await getAuthToken(clientId));
//   }, { scope: 'worker' }],

//   /**
//    * Downloads the toolbox binary, makes it executable, starts the toolbox server as a subprocess,
//    * waits for it to be ready, and ensures its termination after tests.
//    * This fixture runs automatically once per worker.
//    */

//   // TODO: Check if we want it to run once per worker
//   toolboxServer: [async ({ toolboxVersion, toolsFilePath }, use) => {
//     console.log('Setting up toolbox server...');
//     const binaryName = 'toolbox' + (os.platform() === 'win32' ? '.exe' : '');
//     const cacheDir = path.resolve('node_modules', '.cache', 'toolbox_binaries');
//     fs.mkdirSync(cacheDir, { recursive: true });
//     const localBinaryPath = path.join(cacheDir, `${binaryName}-${toolboxVersion}`);

//     if (!fs.existsSync(localBinaryPath)) {
//         console.log(`Downloading toolbox binary version ${toolboxVersion} from GCS bucket...`);
//         const sourceBlobName = getToolboxBinaryUrl(toolboxVersion);
//         try {
//             await downloadBlob('genai-toolbox', sourceBlobName, localBinaryPath);
//             console.log('Toolbox binary downloaded successfully.');
//         } catch (error) {
//             console.error('Failed to download toolbox binary:', error);
//             throw error; // Fail fast if download fails
//         }
//         if (os.platform() !== 'win32') {
//             fs.chmodSync(localBinaryPath, 0o755); // Make executable
//         }
//     } else {
//         console.log(`Using cached toolbox binary from ${localBinaryPath}`);
//     }


//     let serverProcess: child_process.ChildProcess | null = null;
//     try {
//       console.log(`Starting toolbox server process from: ${localBinaryPath}`);
//       serverProcess = child_process.spawn(localBinaryPath, ['--tools_file', toolsFilePath], {
//         stdio: 'pipe', // capture output using `pipe`
//       });

//       serverProcess.stdout?.on('data', (data) => console.log(`Toolbox Server STDOUT: ${data.toString().trim()}`));
//       serverProcess.stderr?.on('data', (data) => console.error(`Toolbox Server STDERR: ${data.toString().trim()}`));
//       serverProcess.on('error', (err) => {
//         console.error('Toolbox server process failed to start or crashed:', err);
//       });
//       serverProcess.on('exit', (code, signal) => {
//         if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') { // Don't log expected exits
//             console.warn(`Toolbox server process exited unexpectedly with code: ${code}, signal: ${signal}`);
//         }
//       });

//       // Wait for server to start
//       await new Promise<void>((resolve, reject) => {
//         const timeout = 15000; // 15 seconds
//         const interval = 2000; // 2 seconds
//         let retries = Math.floor(timeout / interval);
//         let settled = false;

//         const settle = (fn: () => void) => {
//             if (!settled) {
//                 settled = true;
//                 fn();
//             }
//         };

//         const checkServer = () => {
//           if (serverProcess && serverProcess?.exitCode !== null) {
//             settle(() => reject(new Error(`Toolbox server exited prematurely with code ${serverProcess.exitCode}`)));
//             return;
//           }
//           // TODO: Implement a more reliable health check (e.g., pinging a health endpoint).
//           // For now, assume it's up if the process is running after a short delay.
//           if (serverProcess?.pid && !serverProcess.killed) {
//             console.log('Toolbox server assumed started (process is running).');
//             settle(resolve);
//             return;
//           }

//           retries--;
//           if (retries <= 0) {
//             settle(() => reject(new Error('Toolbox server failed to start within timeout.')));
//           } else {
//             console.log('Checking if toolbox is started... retrying.');
//             setTimeout(checkServer, interval);
//           }
//         };
//         // Give the process a moment to potentially fail fast before first check
//         setTimeout(checkServer, interval / 2);
//       });

//       console.log('Toolbox server setup complete and ready.');
//       await use(); // Server is ready for tests

//     } finally {
//       console.log('Tearing down toolbox server...');
//       if (serverProcess?.pid && !serverProcess.killed) {
//         const killedGracefully = serverProcess.kill('SIGTERM'); // Standard termination signal
//         if (killedGracefully) {
//           console.log('Sent SIGTERM to toolbox server. Waiting for graceful exit...');
//           // Wait for a moment for graceful shutdown
//           await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds
//           if (serverProcess?.pid && !serverProcess.killed) {
//             console.warn('Toolbox server did not terminate gracefully after SIGTERM. Forcing kill with SIGKILL.');
//             serverProcess.kill('SIGKILL'); // Force kill
//           } else {
//             console.log('Toolbox server terminated gracefully.');
//           }
//         } else {
//           console.error('Failed to send SIGTERM to toolbox server. It might have already exited or have issues.');
//           // If sending SIGTERM failed, it might already be dead or unkillable by this user.
//           // Check if it's still running before trying SIGKILL
//           if(serverProcess?.pid && !serverProcess.killed) {
//             console.warn('Attempting SIGKILL as sending SIGTERM failed but process seems alive.');
//             serverProcess.kill('SIGKILL');
//           }
//         }
//       } else {
//         console.log('Toolbox server process was not running or already terminated before explicit teardown.');
//       }
//       // Note: The downloaded binary in node_modules/.cache is intentionally kept for caching between runs.
//       // You could add logic to clean this up based on specific criteria if
//       // needed.
//       // TODO: Cleanup
//     }
//   }, { scope: 'worker', auto: true }],

//   /** Provides an initialized ToolboxClient connected to the local server. */
//   toolboxClient: async ({ toolboxServer: _ }, use) => {
//     const client = new ToolboxClient('http://localhost:5000');
//     await use(client);
//     // TODO: Close the client
//     // finally {
//     //   await client.close();
//     // }
//   },
// });

// export { expect };