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
import * as tmp from 'tmp';
import {SecretManagerServiceClient} from '@google-cloud/secret-manager';
import {Storage} from '@google-cloud/storage';

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
    tmp.file(
      {postfix: '.tmp'},
      (
        err: Error | null,
        filePath: string,
        _fd: number,
        cleanupCallback: () => void
      ) => {
        if (err) {
          return reject(err);
        }
        fs.writeFile(filePath, content, 'utf-8')
          .then(() => resolve(filePath))
          .catch(writeErr => {
            cleanupCallback();
            reject(writeErr);
          });
      }
    );
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
  const system = os.platform().toLowerCase(); // 'darwin', 'linux', 'windows'
  let arch = os.arch(); // 'amd64', 'arm64'

  if (system === 'darwin' && arch === 'arm64') {
    arch = 'arm64';
  } else {
    arch = 'amd64';
  }
  const osSystemForPath = system === 'win32' ? 'windows' : system;
  return `v${toolboxVersion}/${osSystemForPath}/${arch}/toolbox`;
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
