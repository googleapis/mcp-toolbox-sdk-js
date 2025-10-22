// Copyright 2025 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// This file defines the public API for the @toolbox-sdk/core package.
// Export the main factory function and the core tool type
export { ToolboxTool } from './tool.js';

// Re-export all the supporting types that are part of the public interface
export type {
  AuthTokenGetter,
  AuthTokenGetters,
  RequiredAuthnParams,
} from './tool.js';

export type { BoundParams, BoundValue } from './utils.js';
export type { ClientHeadersConfig } from './client.js';