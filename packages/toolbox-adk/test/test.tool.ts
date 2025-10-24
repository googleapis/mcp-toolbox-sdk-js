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
import {z, ZodRawShape} from 'zod';
import {Type} from '@google/genai';
import type {FunctionDeclaration} from '@google/genai';
import type {RunAsyncToolRequest, ToolContext} from '@google/adk';
import type {ToolboxTool as ToolboxToolType} from '../src/toolbox_adk/tool.js';

const mockedConvertZod = jest.fn();

jest.unstable_mockModule('../src/toolbox_adk/protocol.js', () => ({
  ConvertZodToFunctionDeclaration: mockedConvertZod,
}));

const {ToolboxTool} = (await import('../src/toolbox_adk/tool.js')) as {
  ToolboxTool: typeof ToolboxToolType;
};

const mockZodSchema = z.object({
  location: z.string().describe('The city'),
});

const mockDeclaration: FunctionDeclaration = {
  name: 'test_tool',
  description: 'A mock tool for testing',
  parameters: {
    type: Type.OBJECT,
    properties: {
      location: {
        type: Type.STRING,
        description: 'The city',
      },
    },
    required: ['location'],
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createMockCoreTool: any = () => {
  const mockToolFn = jest.fn();

  return Object.assign(mockToolFn, {
    toolName: 'test_tool',
    description: 'A mock tool for testing',
    params: mockZodSchema,
    addAuthTokenGetters: jest.fn(() => createMockCoreTool()),
    addAuthTokenGetter: jest.fn(() => createMockCoreTool()),
    bindParams: jest.fn(() => createMockCoreTool()),
    bindParam: jest.fn(() => createMockCoreTool()),
  });
};

describe('ToolboxTool', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCoreTool: any;
  let adkTool: ToolboxToolType;

  beforeEach(() => {
    // Reset our manually created mock function
    mockedConvertZod.mockReset();
    // Set the default return value
    mockedConvertZod.mockReturnValue(mockDeclaration);
    // Create a fresh mock coreTool
    mockCoreTool = createMockCoreTool();
    // Create a new ToolboxTool instance
    adkTool = new ToolboxTool(mockCoreTool);
  });

  it('should correctly set name and description in the constructor', () => {
    expect(adkTool.name).toBe('test_tool');
    expect(adkTool.description).toBe('A mock tool for testing');
  });

  it('should call the underlying coreTool with correct args on runAsync', async () => {
    const mockArgs = {location: 'London'};
    const mockResult = {temp: 20};

    mockCoreTool.mockResolvedValue(mockResult);

    const request: RunAsyncToolRequest = {
      args: mockArgs,
      toolContext: {} as unknown as ToolContext,
    };

    const result = await adkTool.runAsync(request);

    expect(mockCoreTool).toHaveBeenCalledWith(mockArgs);
    expect(result).toBe(mockResult);
  });

  it('should generate the FunctionDeclaration using ConvertZodToFunctionDeclaration', () => {
    const declaration = adkTool._getDeclaration();
    expect(mockedConvertZod).toHaveBeenCalledWith(
      'test_tool',
      'A mock tool for testing',
      mockZodSchema,
    );
    expect(declaration).toBe(mockDeclaration);
  });

  it('should return a new ToolboxTool wrapper on addAuthTokenGetters', () => {
    const mockGetters = {google: async () => 'token'};
    const newMockCoreTool = createMockCoreTool();

    mockCoreTool.addAuthTokenGetters.mockReturnValue(newMockCoreTool);

    const newAdkTool = adkTool.addAuthTokenGetters(mockGetters);

    expect(mockCoreTool.addAuthTokenGetters).toHaveBeenCalledWith(mockGetters);
    expect(newAdkTool).toBeInstanceOf(ToolboxTool);
    expect(newAdkTool).not.toBe(adkTool);
    expect(newAdkTool.getCoreTool()).toBe(newMockCoreTool);
  });

  it('should return a new ToolboxTool wrapper on addAuthTokenGetter', () => {
    const mockGetter = async () => 'token';
    const newMockCoreTool = createMockCoreTool();
    mockCoreTool.addAuthTokenGetter.mockReturnValue(newMockCoreTool);

    const newAdkTool = adkTool.addAuthTokenGetter('google', mockGetter);

    expect(mockCoreTool.addAuthTokenGetter).toHaveBeenCalledWith(
      'google',
      mockGetter,
    );
    expect(newAdkTool).toBeInstanceOf(ToolboxTool);
    expect(newAdkTool).not.toBe(adkTool);
    expect(newAdkTool.getCoreTool()).toBe(newMockCoreTool);
  });

  it('should return a new ToolboxTool wrapper on bindParams', () => {
    const mockParams = {api_key: '123'};
    const newMockCoreTool = createMockCoreTool();
    mockCoreTool.bindParams.mockReturnValue(newMockCoreTool);

    const newAdkTool = adkTool.bindParams(mockParams);

    expect(mockCoreTool.bindParams).toHaveBeenCalledWith(mockParams);
    expect(newAdkTool).toBeInstanceOf(ToolboxTool);
    expect(newAdkTool).not.toBe(adkTool);
    expect(newAdkTool.getCoreTool()).toBe(newMockCoreTool);
  });

  it('should return a new ToolboxTool wrapper on bindParam', () => {
    const newMockCoreTool = createMockCoreTool();
    mockCoreTool.bindParam.mockReturnValue(newMockCoreTool);

    const newAdkTool = adkTool.bindParam('api_key', '123');

    expect(mockCoreTool.bindParam).toHaveBeenCalledWith('api_key', '123');
    expect(newAdkTool).toBeInstanceOf(ToolboxTool);
    expect(newAdkTool).not.toBe(adkTool);
    expect(newAdkTool.getCoreTool()).toBe(newMockCoreTool);
  });

  it('should return the underlying coreTool via getCoreTool', () => {
    expect(adkTool.getCoreTool()).toBe(mockCoreTool);
  });
});
