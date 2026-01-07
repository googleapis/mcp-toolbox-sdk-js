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

import {jest, describe, it, expect, beforeEach} from '@jest/globals';

import type {
  AuthTokenGetters,
  BoundParams,
  ClientHeadersConfig,
} from '@toolbox-sdk/core';
import type {CoreTool} from '../src/toolbox_adk/tool.js';
import type {ToolboxClient as ToolboxClientType} from '../src/toolbox_adk/client.js';
import type {AxiosInstance} from 'axios';

// Define the return type (the "instance") of the mock constructor
type MockCoreClient = {
  loadTool: typeof mockLoadTool;
  loadToolset: typeof mockLoadToolset;
};

// Define the signature of the mock constructor itself
type MockCoreClientConstructor = (
  url: string,
  session?: AxiosInstance | null,
  clientHeaders?: ClientHeadersConfig | null,
  protocol?: string | null,
) => MockCoreClient;

const mockLoadTool =
  jest.fn<
    (
      name: string,
      authTokenGetters: AuthTokenGetters | null,
      boundParams: BoundParams | null,
    ) => Promise<CoreTool>
  >();

const mockLoadToolset =
  jest.fn<
    (
      name: string | undefined,
      authTokenGetters: AuthTokenGetters | null,
      boundParams: BoundParams | null,
      strict: boolean,
    ) => Promise<CoreTool[]>
  >();

const MockCoreToolboxClient = jest
  .fn<MockCoreClientConstructor>()
  .mockImplementation(() => ({
    loadTool: mockLoadTool,
    loadToolset: mockLoadToolset,
  }));

const MockToolboxTool = jest.fn();

jest.unstable_mockModule('@toolbox-sdk/core', () => ({
  ToolboxClient: MockCoreToolboxClient,
  Protocol: {
    MCP: 'mcp-default',
    TOOLBOX: 'toolbox',
  },
}));

jest.unstable_mockModule('../src/toolbox_adk/tool.js', () => ({
  ToolboxTool: MockToolboxTool,
}));

const {ToolboxClient} = (await import('../src/toolbox_adk/client.js')) as {
  ToolboxClient: typeof ToolboxClientType;
};

describe('ToolboxClient', () => {
  beforeEach(() => {
    mockLoadTool.mockReset();
    mockLoadToolset.mockReset();
    MockCoreToolboxClient.mockClear();
    MockToolboxTool.mockClear();
  });

  it('should instantiate CoreToolboxClient in the constructor', () => {
    const mockHeaders: ClientHeadersConfig = {'x-test-header': 'true'};
    const mockSession = {get: jest.fn()} as unknown as AxiosInstance;
    new ToolboxClient('http://test.url', mockSession, mockHeaders);

    expect(MockCoreToolboxClient).toHaveBeenCalledTimes(1);
    expect(MockCoreToolboxClient).toHaveBeenCalledWith(
      'http://test.url',
      mockSession,
      mockHeaders,
      'mcp-default',
    );
  });

  it('should call coreClient.loadTool and wrap the result', async () => {
    const fakeCoreTool = {toolName: 'fake'} as CoreTool;
    mockLoadTool.mockResolvedValue(fakeCoreTool);

    const client = new ToolboxClient('http://test.url');
    const mockAuth: AuthTokenGetters = {google: async () => 'token'};
    const mockParams: BoundParams = {api_key: '123'};

    const adkTool = await client.loadTool('my-tool', mockAuth, mockParams);

    expect(mockLoadTool).toHaveBeenCalledTimes(1);
    expect(mockLoadTool).toHaveBeenCalledWith('my-tool', mockAuth, mockParams);

    expect(MockToolboxTool).toHaveBeenCalledTimes(1);
    expect(MockToolboxTool).toHaveBeenCalledWith(fakeCoreTool);

    expect(adkTool).toBe(MockToolboxTool.mock.instances[0]);
  });

  it('should call coreClient.loadTool with default parameters', async () => {
    mockLoadTool.mockResolvedValue({toolName: 'fake'} as CoreTool);
    const client = new ToolboxClient('http://test.url');

    await client.loadTool('my-tool');

    expect(mockLoadTool).toHaveBeenCalledWith('my-tool', {}, {});
  });

  it('should call coreClient.loadToolset and wrap all results', async () => {
    const fakeCoreTool1 = {toolName: 'fake1'} as CoreTool;
    const fakeCoreTool2 = {toolName: 'fake2'} as CoreTool;
    const coreTools = [fakeCoreTool1, fakeCoreTool2];
    mockLoadToolset.mockResolvedValue(coreTools);

    const client = new ToolboxClient('http://test.url');
    const mockAuth: AuthTokenGetters = {google: async () => 'token'};
    const mockParams: BoundParams = {api_key: '123'};

    const adkTools = await client.loadToolset(
      'my-set',
      mockAuth,
      mockParams,
      true,
    );

    expect(mockLoadToolset).toHaveBeenCalledTimes(1);
    expect(mockLoadToolset).toHaveBeenCalledWith(
      'my-set',
      mockAuth,
      mockParams,
      true,
    );

    // Check that the wrapper constructor was called for EACH tool
    expect(MockToolboxTool).toHaveBeenCalledTimes(2);
    expect(MockToolboxTool).toHaveBeenCalledWith(fakeCoreTool1);
    expect(MockToolboxTool).toHaveBeenCalledWith(fakeCoreTool2);

    expect(adkTools).toHaveLength(2);
    expect(adkTools[0]).toBe(MockToolboxTool.mock.instances[0]);
    expect(adkTools[1]).toBe(MockToolboxTool.mock.instances[1]);
  });

  it('should call coreClient.loadToolset with default parameters', async () => {
    mockLoadToolset.mockResolvedValue([]);
    const client = new ToolboxClient('http://test.url');

    await client.loadToolset();

    expect(mockLoadToolset).toHaveBeenCalledWith(undefined, {}, {}, false);
  });
});
