// Copyright 2025 Google LLC
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

import { resolveValue } from '../src/toolbox_core/utils';

describe('resolveValue', () => {
  // Test cases for literal values (non-functions)
  describe('when given a literal value', () => {
    test('should return a resolved promise with the same string value', async () => {
      const value = 'a literal string';
      await expect(resolveValue(value)).resolves.toBe(value);
    });

    test('should return a resolved promise with the same number value', async () => {
      const value = 123;
      await expect(resolveValue(value)).resolves.toBe(value);
    });

    test('should return a resolved promise with the same boolean value', async () => {
      const value = false;
      await expect(resolveValue(value)).resolves.toBe(value);
    });

    test('should return a resolved promise with a null value', async () => {
      const value = null;
      await expect(resolveValue(value)).resolves.toBeNull();
    });

    test('should return a resolved promise with an undefined value', async () => {
      const value = undefined;
      await expect(resolveValue(value)).resolves.toBeUndefined();
    });

    test('should return a resolved promise with the same object', async () => {
      const value = { key: 'value', nested: { a: 1 } };
      // Use .toEqual for deep object comparison
      await expect(resolveValue(value)).resolves.toEqual(value);
    });
  });

  // Test cases for synchronous functions
  describe('when given a synchronous function', () => {
    test('should execute the function and resolve with its return value', async () => {
      const syncFunction = () => 'result from sync function';
      await expect(resolveValue(syncFunction)).resolves.toBe('result from sync function');
    });

    test('should execute a function returning an object and resolve with that object', async () => {
      const obj = { data: 'test' };
      const syncFunction = () => obj;
      await expect(resolveValue(syncFunction)).resolves.toEqual(obj);
    });

    test('should return a rejected promise if the synchronous function throws an error', async () => {
      const error = new Error('Something went wrong');
      const failingSyncFunction = () => {
        throw error;
      };
      // .rejects checks for promise rejection, .toThrow checks the error itself
      await expect(resolveValue(failingSyncFunction)).rejects.toThrow(error);
    });
  });

  // Test cases for asynchronous (promise-returning) functions
  describe('when given an asynchronous function', () => {
    test('should await an async function and resolve with its value', async () => {
      const asyncFunction = async () => 'result from async function';
      await expect(resolveValue(asyncFunction)).resolves.toBe('result from async function');
    });

    test('should await a function returning a Promise and resolve with its value', async () => {
        const promiseFunction = () => Promise.resolve({ data: 'from promise' });
        await expect(resolveValue(promiseFunction)).resolves.toEqual({ data: 'from promise' });
    });

    test('should correctly handle a delay in an async function', async () => {
        const delayedAsyncFunction = async () => {
            return new Promise(resolve => {
                setTimeout(() => resolve('delayed result'), 20);
            });
        };
        await expect(resolveValue(delayedAsyncFunction)).resolves.toBe('delayed result');
    });

    test('should return a rejected promise if the async function rejects', async () => {
      const error = new Error('Async operation failed');
      const rejectingAsyncFunction = async () => {
        throw error;
      };
      await expect(resolveValue(rejectingAsyncFunction)).rejects.toThrow(error);
    });

    test('should return a rejected promise if the function returns a rejected promise', async () => {
        const error = new Error('Explicit rejection');
        const rejectingPromiseFunction = () => Promise.reject(error);
        await expect(resolveValue(rejectingPromiseFunction)).rejects.toThrow(error);
    });
  });
});