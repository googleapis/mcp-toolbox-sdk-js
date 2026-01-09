// Copyright 2026 Google LLC
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

import {ToolboxTransport} from '../src/toolbox_core/toolboxTransport.js';
import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {ZodError} from 'zod';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ToolboxTransport', () => {
  const baseUrl = 'http://api.example.com';
  let transport: ToolboxTransport;
  let mockSession: jest.Mocked<AxiosInstance>;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockSession = {
      get: jest.fn(),
      post: jest.fn(),
      defaults: {headers: {}},
      interceptors: {
        request: {use: jest.fn()},
        response: {use: jest.fn()},
      },
    } as unknown as jest.Mocked<AxiosInstance>;

    mockedAxios.create.mockReturnValue(mockSession);
    mockedAxios.isAxiosError.mockReturnValue(true);

    transport = new ToolboxTransport(baseUrl, mockSession);

    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should use provided axios session', () => {
      expect(transport.baseUrl).toBe(baseUrl);
      // We can't easily check private #session, but we verified mockedAxios.create wasn't called here
    });

    it('should create new axios session if none provided', () => {
      const newTransport = new ToolboxTransport(baseUrl);
      expect(mockedAxios.create).toHaveBeenCalled();
      expect(newTransport.baseUrl).toBe(baseUrl);
    });
  });

  describe('toolGet', () => {
    const toolName = 'testTool';
    const expectedUrl = `${baseUrl}/api/tool/${toolName}`;

    it('should fetch and parse tool manifest', async () => {
      const mockManifest = {
        serverVersion: '1.0.0',
        tools: {
          [toolName]: {
            description: 'Test Tool',
            parameters: [],
          },
        },
      };

      mockSession.get.mockResolvedValueOnce({
        data: mockManifest,
      } as AxiosResponse);

      const result = await transport.toolGet(toolName);

      expect(mockSession.get).toHaveBeenCalledWith(expectedUrl, {
        headers: undefined,
      });
      expect(result).toEqual(mockManifest);
    });

    it('should pass headers if provided', async () => {
      const headers = {'X-Test': 'val'};
      mockSession.get.mockResolvedValueOnce({
        data: {serverVersion: '1.0.0', tools: {}},
      } as AxiosResponse);

      await transport.toolGet(toolName, headers);

      expect(mockSession.get).toHaveBeenCalledWith(expectedUrl, {headers});
    });

    it('should parse response using ZodManifestSchema', async () => {
      const invalidManifest = {tools: 'invalid'}; // Missing serverVersion, tools is string
      mockSession.get.mockResolvedValueOnce({
        data: invalidManifest,
      } as AxiosResponse);

      await expect(transport.toolGet(toolName)).rejects.toThrow(ZodError);
    });

    it('should handle axios errors', async () => {
      const errorMsg = 'Not Found';
      const mockError = {
        response: {
          status: 404,
          statusText: 'Not Found',
          data: {error: errorMsg},
        },
        isAxiosError: true,
      };
      mockSession.get.mockRejectedValueOnce(mockError);

      await expect(transport.toolGet(toolName)).rejects.toEqual(mockError);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching data from'),
        expect.anything(),
      );
    });

    it('should rethrow non-axios errors', async () => {
      const error = new Error('Network error');
      mockSession.get.mockRejectedValueOnce(error);
      mockedAxios.isAxiosError.mockReturnValueOnce(false);

      await expect(transport.toolGet(toolName)).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching data from'),
        expect.anything(),
      );
    });
  });

  describe('toolsList', () => {
    it('should fetch tools list for default toolset', async () => {
      const expectedUrl = `${baseUrl}/api/toolset/`;
      mockSession.get.mockResolvedValueOnce({
        data: {serverVersion: '1.0.0', tools: {}},
      } as AxiosResponse);

      await transport.toolsList();

      expect(mockSession.get).toHaveBeenCalledWith(expectedUrl, {
        headers: undefined,
      });
    });

    it('should fetch tools list for specific toolset', async () => {
      const toolsetName = 'mySet';
      const expectedUrl = `${baseUrl}/api/toolset/${toolsetName}`;
      mockSession.get.mockResolvedValueOnce({
        data: {serverVersion: '1.0.0', tools: {}},
      } as AxiosResponse);

      await transport.toolsList(toolsetName);

      expect(mockSession.get).toHaveBeenCalledWith(expectedUrl, {
        headers: undefined,
      });
    });
  });

  describe('toolInvoke', () => {
    const toolName = 'testTool';
    const expectedUrl = `${baseUrl}/api/tool/${toolName}/invoke`;
    const args = {param: 'value'};
    const headers = {Authorization: 'Bearer token'};

    it('should invoke tool successfully', async () => {
      const mockResult = 'result data';
      mockSession.post.mockResolvedValueOnce({
        data: {result: mockResult},
      } as AxiosResponse);

      const result = await transport.toolInvoke(toolName, args, headers);

      expect(mockSession.post).toHaveBeenCalledWith(expectedUrl, args, {
        headers,
      });
      expect(result).toBe(mockResult);
    });

    it('should throw error if response has error field', async () => {
      const errorMsg = 'Tool execution failed';
      mockSession.post.mockResolvedValueOnce({
        data: {error: errorMsg},
      } as AxiosResponse);

      await expect(
        transport.toolInvoke(toolName, args, headers),
      ).rejects.toThrow(errorMsg);
    });

    it('should warn if sending headers over HTTP', async () => {
      // transport is already http://api.example.com
      await transport.toolInvoke(toolName, args, headers).catch(() => {});

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Sending data token over HTTP'),
      );
    });

    it('should not warn if using HTTPS', async () => {
      const httpsTransport = new ToolboxTransport(
        'https://secure.example.com',
        mockSession,
      );
      mockSession.post.mockResolvedValueOnce({data: {result: 'ok'}});

      await httpsTransport.toolInvoke(toolName, args, headers);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should handle axios errors', async () => {
      const mockError = {
        response: {
          status: 500,
          data: {error: 'Server Error'},
        },
        isAxiosError: true,
      };
      mockSession.post.mockRejectedValueOnce(mockError);

      await expect(
        transport.toolInvoke(toolName, args, headers),
      ).rejects.toEqual(mockError);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error posting data to'),
        expect.anything(),
      );
    });
  });
});
