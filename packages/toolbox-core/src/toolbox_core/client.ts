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

import {ToolboxTool} from './tool';

class ToolboxClient {
  /** @private */ _baseUrl;

  /**
   * @param {string} url - The base URL for the Toolbox service API.
   */
  constructor(url: string) {
    this._baseUrl = url;
  }

  /**
   * @param {int} num1 - First number.
   * @param {int} num2 - Second number.
   * @returns {int} - Mock API response.
   */
  async getToolResponse(num1: number, num2: number) {
    const tool = ToolboxTool('tool1');
    const response = await tool({a: num1, b: num2});
    return response;
  }
}

export {ToolboxClient};
