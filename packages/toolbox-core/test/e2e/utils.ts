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

import * as os from 'os';
import * as fs from 'fs-extra';
import tmp from 'tmp';
import {SecretManagerServiceClient} from '@google-cloud/secret-manager';
import {Storage} from '@google-cloud/storage';
import {GoogleAuth} from 'google-auth-library';

/**
 * Gets environment variables.
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
 */
export async function accessSecretVersion(
  projectId: string,
  secretId: string,
  versionId = 'latest'
): Promise<string> {
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${projectId}/secrets/${secretId}/versions/${versionId}`,
  });
  const payload = version.payload?.data?.toString();
  if (!payload) {
    throw new Error(`No payload for secret ${secretId}`);
  }
  return payload;
}

/**
 * Creates a temporary file with the given content.
 * Returns the path to the temporary file.
 */
export async function createTmpFile(content: string): Promise<string> {
  return new Promise((resolve, reject) => {
    tmp.file({postfix: '.tmp'}, (err, filePath, _, _) => {
      if (err) return reject(err);
      fs.writeFile(filePath, content)
        .then(() => resolve(filePath))
        .catch(reject);
    });
  });
}

/**
 * Downloads a blob from a GCS bucket.
 */
export async function downloadBlob(
  bucketName: string,
  sourceBlobName: string,
  destinationFileName: string
): Promise<void> {
  const storage = new Storage();
  await storage.bucket(bucketName).file(sourceBlobName).download({
    destination: destinationFileName,
  });
  console.log(`Blob ${sourceBlobName} downloaded to ${destinationFileName}.`);
}

/**
 * Constructs the GCS path to the toolbox binary.
 */
export function getToolboxBinaryGcsPath(toolboxVersion: string): string {
  const system = os.platform().toLowerCase(); // 'darwin', 'linux', 'win32'
  let arch = os.arch(); // 'x64', 'arm64', etc.

  if (system === 'darwin' && arch === 'arm64') {
    arch = 'arm64';
  } else {
    arch = 'amd64'; // Assuming default amd64 for others if not explicitly arm64 on darwin
  }
  // Adjust 'os_system' mapping if Node's os.platform() differs from Python's platform.system()
  const osSystemForPath = system === 'win32' ? 'windows' : system;
  return `v${toolboxVersion}/${osSystemForPath}/${arch}/toolbox`;
}

/**
 * Retrieves an authentication token for Compute Engine (ID Token).
 */
export async function getAuthToken(clientId: string): Promise<string> {
  const auth = new GoogleAuth();
  // This assumes the environment is configured to provide ID tokens (e.g., running on GCE, or gcloud auth configured)
  // For a specific target audience (client_id for an IAP-secured resource or Cloud Run service)
  const idTokenClient = await auth.getIdTokenClient(clientId);
  const idToken = await idTokenClient.idTokenProvider.fetchIdToken(clientId);
  if (!idToken) {
    throw new Error('Failed to retrieve ID token.');
  }
  return idToken;
}

// Helper to wait for a bit
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
