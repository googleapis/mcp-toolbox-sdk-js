/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { ITransport } from './itransport.js';
import { ZodManifest, ZodManifestSchema } from './protocol.js';

/**
 * Transport for the native Toolbox protocol.
 */
export class ToolboxTransport implements ITransport {
  readonly #baseUrl: string;
  #session: AxiosInstance;
  #manageSession = false;

  constructor(baseUrl: string, session?: AxiosInstance) {
    this.#baseUrl = baseUrl;
    // If no axios session is provided, make our own
    this.#session = session || axios.create({baseURL: this.baseUrl});
  }

  get baseUrl(): string {
    return this.#baseUrl;
  }

  async #getManifest(
    url: string,
    headers?: Record<string, string>,
  ): Promise<ZodManifest> {
    /** Helper method to perform GET requests and parse the ManifestSchema. */
    try {
      const response: AxiosResponse = await this.#session.get(url, { headers });
      return ZodManifestSchema.parse(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const errorText = JSON.stringify(error.response.data);
        throw new Error(
          `API request failed with status ${error.response.status} (${error.response.statusText}). Server response: ${errorText}`,
        );
      }
      throw error;
    }
  }

  async toolGet(
    toolName: string,
    headers?: Record<string, string>,
  ): Promise<ZodManifest> {
    const url = `${this.#baseUrl}/api/tool/${toolName}`;
    return await this.#getManifest(url, headers);
  }

  async toolsList(
    toolsetName?: string,
    headers?: Record<string, string>,
  ): Promise<ZodManifest> {
    const url = `${this.#baseUrl}/api/toolset/${toolsetName || ''}`;
    return await this.#getManifest(url, headers);
  }

  async toolInvoke(
    toolName: string,
    arguments_: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<string> {
    // ID tokens contain sensitive user information (claims). Transmitting
    // these over HTTP exposes the data to interception and unauthorized
    // access. Always use HTTPS to ensure secure communication and protect
    // user privacy.
    if (
      this.baseUrl.startsWith('http://') &&
      headers &&
      Object.keys(headers).length > 0
    ) {
      console.warn(
        'Sending data token over HTTP. User data may be exposed. Use HTTPS for secure communication.',
      );
    }
    const url = `${this.#baseUrl}/api/tool/${toolName}/invoke`;
    try {
      const response: AxiosResponse = await this.#session.post(
        url,
        arguments_,
        {
          headers,
        },
      );
      const body = response.data;
      if (body?.error) {
        throw new Error(body.error);
      }
      return body.result;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const body = error.response.data;
        const err =
          body?.error ||
          `unexpected status from server: ${error.response.status}`;
        throw new Error(err);
      }
      throw error;
    }
  }
}
