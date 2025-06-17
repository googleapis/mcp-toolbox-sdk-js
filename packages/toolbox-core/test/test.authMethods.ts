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

import {GoogleAuth} from 'google-auth-library';

type GetGoogleIdToken = (url: string) => Promise<string>;

describe('getGoogleIdToken', () => {
  const mockUrl = 'https://example.com';
  const mockToken = 'mock-id-token';

  let getGoogleIdToken: GetGoogleIdToken;
  let MockedGoogleAuth: jest.MockedClass<typeof GoogleAuth>;
  let mockGetIdTokenClient: jest.Mock;
  let mockFetchIdToken: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    mockFetchIdToken = jest.fn();
    mockGetIdTokenClient = jest.fn();

    jest.mock('google-auth-library', () => {
      return {
        GoogleAuth: jest.fn().mockImplementation(() => ({
          getIdTokenClient: mockGetIdTokenClient,
        })),
      };
    });

    // With the mocks fully configured, dynamically require the modules.
    // This ensures our code runs against the fresh mocks we just set up.
    const authMethods = require('../src/toolbox_core/authMethods');
    const {GoogleAuth: GA} = require('google-auth-library');
    getGoogleIdToken = authMethods.getGoogleIdToken;
    MockedGoogleAuth = GA;

    mockGetIdTokenClient.mockResolvedValue({
      idTokenProvider: {fetchIdToken: mockFetchIdToken},
    });
    mockFetchIdToken.mockResolvedValue(mockToken);
  });

  it('should return a Bearer token on successful fetch', async () => {
    const token = await getGoogleIdToken(mockUrl);
    expect(token).toBe(`Bearer ${mockToken}`);

    expect(MockedGoogleAuth).toHaveBeenCalledTimes(1);
    expect(mockGetIdTokenClient).toHaveBeenCalledWith(mockUrl);
    expect(mockGetIdTokenClient).toHaveBeenCalledTimes(1);
    expect(mockFetchIdToken).toHaveBeenCalledWith(mockUrl);
    expect(mockFetchIdToken).toHaveBeenCalledTimes(1);
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

  it('should fetch the token only once when called multiple times', async () => {
    const token1 = await getGoogleIdToken(mockUrl);
    const token2 = await getGoogleIdToken(mockUrl);
    await getGoogleIdToken(mockUrl);

    expect(token1).toBe(`Bearer ${mockToken}`);
    expect(token2).toBe(`Bearer ${mockToken}`);

    // `GoogleAuth` constructor was only ever called once.
    expect(MockedGoogleAuth).toHaveBeenCalledTimes(1);

    // The client is only fetched once.
    expect(mockGetIdTokenClient).toHaveBeenCalledTimes(1);
  });
});
