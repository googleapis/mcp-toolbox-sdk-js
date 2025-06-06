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

import {getGoogleIdToken} from '../src/toolbox_core/authMethods';
import {GoogleAuth} from 'google-auth-library';

jest.mock('google-auth-library', () => ({GoogleAuth: jest.fn()}));

describe('getGoogleIdToken', () => {
  const mockUrl = 'https://example.com';
  const mockToken = 'mock-id-token';

  let mockGetIdTokenClient: jest.Mock;
  let mockFetchIdToken: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    mockFetchIdToken = jest.fn().mockResolvedValue(mockToken);
    mockGetIdTokenClient = jest.fn().mockResolvedValue({
      idTokenProvider: {
        fetchIdToken: mockFetchIdToken,
      },
    });
    (GoogleAuth as jest.MockedClass<typeof GoogleAuth>).mockImplementation(
      () =>
        ({
          getIdTokenClient: mockGetIdTokenClient,
        }) as unknown as GoogleAuth
    );
  });

  it('should return a Bearer token on successful fetch', async () => {
    const token = await getGoogleIdToken(mockUrl);
    expect(token).toBe(`Bearer ${mockToken}`);
    expect(GoogleAuth).toHaveBeenCalledTimes(1);
    expect(mockGetIdTokenClient).toHaveBeenCalledWith(mockUrl);
    expect(mockFetchIdToken).toHaveBeenCalledWith(mockUrl);
  });

  it('should propagate errors from getIdTokenClient', async () => {
    const errorMessage = 'Failed to get ID token client';
    mockGetIdTokenClient.mockRejectedValue(new Error(errorMessage));

    await expect(getGoogleIdToken(mockUrl)).rejects.toThrow(errorMessage);
  });

  it('should propagate errors from fetchIdToken', async () => {
    const errorMessage = 'Failed to fetch ID token';
    mockFetchIdToken.mockRejectedValue(new Error(errorMessage));

    await expect(getGoogleIdToken(mockUrl)).rejects.toThrow(errorMessage);
  });
});
