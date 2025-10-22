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

import { BaseTool, RunAsyncToolRequest } from '@google/adk';
import { FunctionDeclaration } from '@google/genai';

import {
  ToolboxClient,
  AuthTokenGetter,
  AuthTokenGetters,
  BoundParams,
  BoundValue,
} from '@toolbox-sdk/core';
import {
  ConvertZodToFunctionDeclaration
} from './protocol.js';

import { ZodObject, ZodRawShape } from 'zod';

type ResolvedPromiseType<T> = T extends Promise<infer U> ? U : T;

type CoreTool = ResolvedPromiseType<
  ReturnType<typeof ToolboxClient.prototype.loadTool>
>;

/**
 * An adapter class that wraps a `CoreTool` from the `@toolbox-sdk/core`
 * to make it compatible with the `@google/adk` `BaseTool` interface.
 */
export class ToolboxTool extends BaseTool {
  private readonly coreTool: CoreTool;

  /**
   * Creates a new instance of the ADK-compatible tool wrapper.
   * @param coreTool The original callable tool object from `@toolbox-sdk/core`.
   */
  constructor(coreTool: CoreTool) {
    super({
      name: coreTool.toolName,
      description: coreTool.description,
      isLongRunning: false,
    });
    this.coreTool = coreTool;
  }

  /**
   * Runs the tool by delegating the call to the wrapped `coreTool`.
   *
   * @param request The `RunAsyncToolRequest` from the ADK agent.
   * @returns A promise that resolves to the tool's execution result.
   */
  async runAsync(request: RunAsyncToolRequest): Promise<unknown> {
    return this.coreTool(request.args);
  }

  /**
   * Generates the `FunctionDeclaration` (JSON Schema) for this tool
   * by converting the Zod schema from the `coreTool`.
   *
   * @returns A `FunctionDeclaration` for the LLM.
   */
  override _getDeclaration(): FunctionDeclaration | undefined {
    const zodSchema = this.coreTool.params as ZodObject<ZodRawShape>;
    
    return ConvertZodToFunctionDeclaration(
      this.name,
      this.description,
      zodSchema,
    );
  }

  /**
   * Creates a new `ToolboxTool` with additional auth token getters.
   *
   * @param newAuthTokenGetters A map of auth sources to token getters.
   * @returns A new `ToolboxTool` instance.
   */
  addAuthTokenGetters(newAuthTokenGetters: AuthTokenGetters): ToolboxTool {
    const newCoreTool = this.coreTool.addAuthTokenGetters(newAuthTokenGetters);
    return new ToolboxTool(newCoreTool);
  }

  /**
   * Creates a new `ToolboxTool` with an additional auth token getter.
   *
   * @param authSource The name of the auth source.
   * @param getIdToken The token getter function.
   * @returns A new `ToolboxTool` instance.
   */
  addAuthTokenGetter(
    authSource: string,
    getIdToken: AuthTokenGetter,
  ): ToolboxTool {
    const newCoreTool = this.coreTool.addAuthTokenGetter(
      authSource,
      getIdToken,
    );
    return new ToolboxTool(newCoreTool);
  }

  /**
   * Creates a new `ToolboxTool` with bound parameters.
   *
   * @param paramsToBind A map of parameter names to values or getters.
   * @returns A new `ToolboxTool` instance.
   */
  bindParams(paramsToBind: BoundParams): ToolboxTool {
    const newCoreTool = this.coreTool.bindParams(paramsToBind);
    return new ToolboxTool(newCoreTool);
  }

  /**
   * Creates a new `ToolboxTool` with a single bound parameter.
   *
   * @param paramName The name of the parameter to bind.
   * @param paramValue The value or getter to bind.
   * @returns A new `ToolboxTool` instance.
   */
  bindParam(paramName: string, paramValue: BoundValue): ToolboxTool {
    const newCoreTool = this.coreTool.bindParam(paramName, paramValue);
    return new ToolboxTool(newCoreTool);
  }

  /**
   * Gets the underlying `CoreTool` object.
   * @returns The wrapped `CoreTool` instance.
   */
  public getCoreTool(): CoreTool {
    return this.coreTool;
  }
}

