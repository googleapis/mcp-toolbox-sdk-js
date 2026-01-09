/**
 * Copyright 2026 Google LLC
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

import {ZodManifest} from './protocol.js';

/**
 * Defines the contract for a 'smart' transport that handles both
 * protocol formatting and network communication.
 */
export interface ITransport {
  /**
   * The base URL for the transport.
   */
  readonly baseUrl: string;

  /**
   * Gets a single tool from the server.
   */
  toolGet(
    toolName: string,
    headers?: Record<string, string>,
  ): Promise<ZodManifest>;

  /**
   * Lists available tools from the server.
   */
  toolsList(
    toolsetName?: string,
    headers?: Record<string, string>,
  ): Promise<ZodManifest>;

  /**
   * Invokes a specific tool on the server.
   */
  toolInvoke(
    toolName: string,
    arguments_: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<string>;
}
