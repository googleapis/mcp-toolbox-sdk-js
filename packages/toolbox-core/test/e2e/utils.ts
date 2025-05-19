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

import * as fs from 'fs';
import * as os from 'os';
import * as tmp from 'tmp';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Storage } from '@google-cloud/storage';
import { GoogleAuth } from 'google-auth-library';

/**
 * Gets an environment variable by key.
 * @param key - The environment variable key.
 * @returns The value of the environment variable.
 * @throws Error if the environment variable is not set.
 */
export function getEnvVar(key: string): string {
  const value = process.env[key];
  if (value === undefined) {
    throw new Error(`Must set env var ${key}`);
  }
  return value;
}

/**
 * Accesses the payload of a given secret version from Secret Manager.
 * @param projectId - The Google Cloud project ID.
 * @param secretId - The ID of the secret.
 * @param versionId - The version of the secret (defaults to 'latest').
 * @returns The secret payload as a string.
 * @throws Error if the secret payload is empty.
 */
export async function accessSecretVersion(
  projectId: string,
  secretId: string,
  versionId = 'latest'
): Promise<string> {
  const client = new SecretManagerServiceClient();
  const name = `projects/${projectId}/secrets/${secretId}/versions/${versionId}`;
  const [response] = await client.accessSecretVersion({ name });

  if (!response.payload?.data) {
    throw new Error(`Secret ${name} payload is empty or data is missing.`);
  }
  return response.payload.data.toString('utf-8');
}

/**
 * Creates a temporary file with the given content (asynchronously).
 * The 'tmp' library handles automatic cleanup on process exit by default when keep: false.
 * @param content - The content to write to the temporary file.
 * @returns A promise that resolves with the path to the temporary file.
 */
export function createTmpfile(content: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // 'keep: false' means tmp will try to delete the file on process exit.
    tmp.file({ mode: 0o600, postfix: '.txt', keep: false }, (err, filePath, _fd, cleanupCallback) => {
      if (err) {
        return reject(err);
      }
      fs.writeFile(filePath, content, (writeErr) => {
        if (writeErr) {
          // Attempt to cleanup if write fails, though tmp might handle it.
          try {
            cleanupCallback();
          } catch (cleanupErr) {
            console.error('Error during cleanup after write failure:', cleanupErr);
          }
          return reject(writeErr);
        }
        resolve(filePath);
      });
    });
  });
}

/**
 * Creates a temporary file with the given content (synchronously) and returns a cleanup function.
 * @param content - The content to write to the temporary file.
 * @returns An object containing the file path (`name`) and a `cleanup` function.
 */
export function createTmpfileSync(content: string): { name: string; cleanup: () => void } {
  // 'keep: true' to manually control deletion via the returned cleanup function.
  const tmpFile = tmp.fileSync({ mode: 0o600, postfix: '.txt', keep: true });
  fs.writeFileSync(tmpFile.name, content);
  return { name: tmpFile.name, cleanup: tmpFile.removeCallback };
}

/**
 * Downloads a blob from a GCS bucket.
 * @param bucketName - The name of the GCS bucket.
 * @param sourceBlobName - The name of the blob in the bucket.
 * @param destinationFileName - The local path to save the downloaded file.
 */
export async function downloadBlob(
  bucketName: string,
  sourceBlobName: string,
  destinationFileName: string
): Promise<void> {
  const storage = new Storage();
  const options = {
    destination: destinationFileName,
  };
  await storage.bucket(bucketName).file(sourceBlobName).download(options);
  console.log(`Blob ${sourceBlobName} downloaded to ${destinationFileName}.`);
}

/**
 * Constructs the GCS path to the toolbox binary based on OS and architecture.
 * @param toolboxVersion - The version of the toolbox.
 * @returns The GCS path string.
 */
export function getToolboxBinaryUrl(toolboxVersion: string): string {
  const system = os.platform().toLowerCase(); // e.g., 'darwin', 'linux', 'win32'
  let platformForUrl = system;
  if (system === 'win32') {
    platformForUrl = 'windows'; // Adjust if your GCS path specifically uses 'windows'
  }

  let arch = os.arch(); // e.g., 'x64' (for amd64), 'arm64'
  if (arch === 'x64') {
    arch = 'amd64';
  }

  // Ensure toolboxVersion doesn't already have 'v'
  const versionPrefix = toolboxVersion.startsWith('v') ? '' : 'v';
  return `${versionPrefix}${toolboxVersion}/${platformForUrl}/${arch}/toolbox`;
}

/**
 * Retrieves a Google ID token for a given client ID, typically for service-to-service authentication.
 * Assumes running on GCP or with Application Default Credentials (ADC) configured.
 * @param clientId - The audience/client ID for the ID token.
 * @returns The ID token string.
 * @throws Error if the ID token cannot be fetched.
 */
export async function getAuthToken(clientId: string): Promise<string> {
  const auth = new GoogleAuth({
    scopes: 'email', // 'email' scope is often used with ID tokens, but may not be strictly necessary for getIdTokenClient.
  });

  const idTokenClient = await auth.getIdTokenClient(clientId);
  const idToken = await idTokenClient.idTokenProvider.fetchIdToken(clientId);

  if (!idToken) {
    throw new Error('Failed to retrieve ID token.');
  }
  return idToken;
}