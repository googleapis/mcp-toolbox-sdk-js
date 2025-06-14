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

import {ChildProcess} from 'child_process';

// Used in jest global setup and teardown
export type CustomGlobal = typeof globalThis & {
  __TOOLS_FILE_PATH__?: string;
  __TOOLBOX_SERVER_PROCESS__?: ChildProcess;
  __SERVER_TEARDOWN_INITIATED__?: boolean;
  __GOOGLE_CLOUD_PROJECT__?: string;
};
