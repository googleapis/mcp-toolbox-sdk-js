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

import {
  resolveValue,
  identifyAuthRequirements,
} from '../src/toolbox_core/utils';

describe('resolveValue', () => {
  it('should return the value directly if it is not a function', async () => {
    const value = 'test-value';
    expect(await resolveValue(value)).toBe(value);

    const numValue = 123;
    expect(await resolveValue(numValue)).toBe(numValue);

    const objValue = {key: 'val'};
    expect(await resolveValue(objValue)).toBe(objValue);
  });

  it('should call the function and return its result if it is a synchronous function', async () => {
    const syncFn = () => 'sync-result';
    expect(await resolveValue(syncFn)).toBe('sync-result');
  });

  it('should call the function and return its resolved promise if it is an asynchronous function', async () => {
    const asyncFn = async () => {
      await new Promise(r => setTimeout(r, 10));
      return 'async-result';
    };
    expect(await resolveValue(asyncFn)).toBe('async-result');
  });

  it('should handle a function returning a promise directly', async () => {
    const promiseFn = () => Promise.resolve('promise-result');
    expect(await resolveValue(promiseFn)).toBe('promise-result');
  });
});

describe('identifyAuthRequirements', () => {
  it('should return empty requirements and used services if none are provided', () => {
    const [params, tokens, used] = identifyAuthRequirements({}, [], []);
    expect(params).toEqual({});
    expect(tokens).toEqual([]);
    expect(used).toEqual(new Set());
  });

  it('should return all authn params as required if no services match', () => {
    const reqAuthnParams = {param1: ['serviceA', 'serviceB']};
    const [params, tokens, used] = identifyAuthRequirements(
      reqAuthnParams,
      [],
      ['serviceC']
    );
    expect(params).toEqual(reqAuthnParams);
    expect(tokens).toEqual([]);
    expect(used).toEqual(new Set());
  });

  it('should return all authz tokens as required if no services match', () => {
    const reqAuthzTokens = ['serviceA', 'serviceB'];
    const [params, tokens, used] = identifyAuthRequirements(
      {},
      reqAuthzTokens,
      ['serviceC']
    );
    expect(params).toEqual({});
    expect(tokens).toEqual(reqAuthzTokens);
    expect(used).toEqual(new Set());
  });

  it('should identify used services for authn params and remove them from required', () => {
    const reqAuthnParams = {
      param1: ['serviceA', 'serviceB'],
      param2: ['serviceC'],
    };
    const [params, tokens, used] = identifyAuthRequirements(
      reqAuthnParams,
      [],
      ['serviceA', 'serviceD']
    );
    expect(params).toEqual({param2: ['serviceC']});
    expect(tokens).toEqual([]);
    expect(used).toEqual(new Set(['serviceA']));
  });

  it('should identify used services for authz tokens and remove them from required', () => {
    const reqAuthzTokens = ['serviceA', 'serviceB', 'serviceC'];
    const [params, tokens, used] = identifyAuthRequirements(
      {},
      reqAuthzTokens,
      ['serviceB', 'serviceD']
    );
    expect(params).toEqual({});
    expect(tokens).toEqual([]);
    expect(used).toEqual(new Set(['serviceB']));
  });

  it('should handle mixed authn and authz requirements with partial matches', () => {
    const reqAuthnParams = {
      param1: ['serviceA', 'serviceB'],
      param3: ['serviceE'],
    };
    const reqAuthzTokens = ['serviceC', 'serviceD'];
    const availableServices = ['serviceA', 'serviceC', 'serviceF'];

    const [params, tokens, used] = identifyAuthRequirements(
      reqAuthnParams,
      reqAuthzTokens,
      availableServices
    );

    expect(params).toEqual({param3: ['serviceE']});
    expect(tokens).toEqual([]);
    expect(used).toEqual(new Set(['serviceA', 'serviceC']));
  });

  it('should correctly identify used services when multiple available services match a single authn param requirement', () => {
    const reqAuthnParams = {param1: ['serviceA', 'serviceB']};
    const [params, tokens, used] = identifyAuthRequirements(
      reqAuthnParams,
      [],
      ['serviceA', 'serviceB', 'serviceC']
    );
    expect(params).toEqual({});
    expect(tokens).toEqual([]);
    expect(used).toEqual(new Set(['serviceA', 'serviceB']));
  });

  it('should correctly identify used services when multiple available services match a single authz token requirement', () => {
    const reqAuthzTokens = ['serviceA', 'serviceB'];
    const [params, tokens, used] = identifyAuthRequirements(
      {},
      reqAuthzTokens,
      ['serviceA', 'serviceC']
    );
    expect(params).toEqual({});
    expect(tokens).toEqual([]);
    expect(used).toEqual(new Set(['serviceA']));
  });
});