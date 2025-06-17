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

/*
This module provides functions to obtain Google ID tokens, formatted as "Bearer" tokens,
for use in the "Authorization" header of HTTP requests.

Example User Experience:
import { ToolboxClient } from '@toolbox/core';
import { getGoogleIdToken } from '@toolbox/core/auth'

const URL = 'http://some-url'
const getGoogleIdTokenGetter = () => getGoogleIdToken(URL);
const client = new ToolboxClient(URL, null, {"Authorization": getGoogleIdTokenGetter});
*/

import {GoogleAuth, IdTokenClient} from 'google-auth-library';

const auth = new GoogleAuth();
const clientCache: {[key: string]: IdTokenClient} = {};

export async function getGoogleIdToken(url: string) {
  let client = clientCache[url];
  if (!client) {
    client = await auth.getIdTokenClient(url);
    clientCache[url] = client;
  }
  const id_token = await client.idTokenProvider.fetchIdToken(url);
  return `Bearer ${id_token}`;
}
