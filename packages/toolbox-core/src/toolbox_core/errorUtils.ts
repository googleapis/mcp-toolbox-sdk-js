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

import {isAxiosError} from 'axios';

/**
 * Logs a standardized error message to the console, differentiating between
 * Axios errors with response data, Axios errors without response data (e.g., network errors),
 * and other types of errors.
 *
 * @param {string} baseMessage - The base message to log, e.g., "Error fetching data from".
 * @param {unknown} error - The error object caught.
 */
export function logApiError(baseMessage: string, error: unknown): void {
  let loggableDetails: unknown;

  if (isAxiosError(error)) {
    // Check if the error is from Axios and has response data
    if (error.response && typeof error.response.data !== 'undefined') {
      loggableDetails = error.response.data;
    } else {
      // Axios error without response data (e.g., network error, timeout)
      loggableDetails = error.message;
    }
  } else if (error instanceof Error) {
    loggableDetails = error.message;
  } else {
    loggableDetails = error; // Fallback for non-Error types or unknown errors
  }
  console.error(baseMessage, loggableDetails);
}
