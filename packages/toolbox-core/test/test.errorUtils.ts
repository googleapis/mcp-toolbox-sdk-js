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

import {logApiError} from '../src/toolbox_core/errorUtils';
import {isAxiosError} from 'axios';

// Mock the 'axios' module, specifically the isAxiosError function
jest.mock('axios', () => ({
  ...jest.requireActual('axios'), // Import and retain default behavior
  isAxiosError: jest.fn(), // Mock isAxiosError
}));

describe('logApiError', () => {
  let consoleErrorSpy: jest.SpyInstance;
  const baseMessage = 'Test error:';

  beforeEach(() => {
    // Spy on console.error before each test
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // Reset the mock for isAxiosError before each test
    (isAxiosError as jest.MockedFunction<typeof isAxiosError>).mockReset();
  });

  afterEach(() => {
    // Restore console.error to its original implementation after each test
    consoleErrorSpy.mockRestore();
  });

  it('should log error.response.data if error is AxiosError with response data', () => {
    (isAxiosError as jest.MockedFunction<typeof isAxiosError>).mockReturnValue(true);
    const errorResponseData = {detail: 'API returned an error'};
    const mockError = {
      isAxiosError: true,
      response: {data: errorResponseData},
      message: 'Request failed with status code 500',
      name: 'AxiosError',
      config: {},
      code: 'ERR_BAD_RESPONSE',
    };

    logApiError(baseMessage, mockError);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(baseMessage, errorResponseData);
  });

  it('should log error.message if error is AxiosError without response data', () => {
    (isAxiosError as jest.MockedFunction<typeof isAxiosError>).mockReturnValue(true);
    const errorMessage = 'Network Error';
    const mockError = {
      isAxiosError: true,
      message: errorMessage,
      name: 'AxiosError',
      config: {},
      code: 'ERR_NETWORK',
    }; // No error.response or error.response.data

    logApiError(baseMessage, mockError);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(baseMessage, errorMessage);
  });

  it('should log error.message if error is a standard Error instance', () => {
    (isAxiosError as jest.MockedFunction<typeof isAxiosError>).mockReturnValue(false);
    const errorMessage = 'This is a standard error';
    const mockError = new Error(errorMessage);

    logApiError(baseMessage, mockError);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(baseMessage, errorMessage);
  });

  it('should log the error itself if it is a string', () => {
    (isAxiosError as jest.MockedFunction<typeof isAxiosError>).mockReturnValue(false);
    const mockError = 'A simple string error';

    logApiError(baseMessage, mockError);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(baseMessage, mockError);
  });

  it('should log the error itself if it is a plain object (not Error or AxiosError)', () => {
    (isAxiosError as jest.MockedFunction<typeof isAxiosError>).mockReturnValue(false);
    const mockError = {customError: 'Some custom error object'};

    logApiError(baseMessage, mockError);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(baseMessage, mockError);
  });
});