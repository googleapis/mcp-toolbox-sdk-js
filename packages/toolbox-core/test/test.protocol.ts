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

import { ZodError } from 'zod';
import {
  ZodParameterSchema,
  ZodToolSchema,
  ZodManifestSchema,
  createZodObjectSchemaFromParameters,
} from '../src/toolbox_core/protocol';

// Helper function to get Zod errors for easier assertions
const getErrorMessages = (error: ZodError) => {
  return error.errors.map((e) => {
    if (e.path.length > 0) {
      return `${e.path.join('.')}: ${e.message}`;
    }
    return e.message;
  });
};

describe('ZodParameterSchema', () => {
  it('should validate a correct string parameter', () => {
    const data = { name: 'testString', description: 'A string', type: 'string' };
    expect(ZodParameterSchema.safeParse(data).success).toBe(true);
  });

  it('should validate a string parameter with authSources', () => {
    const data = { name: 'testString', description: 'A string', type: 'string', authSources: ['google', 'custom'] };
    expect(ZodParameterSchema.safeParse(data).success).toBe(true);
  });

  it('should invalidate a string parameter with an empty name', () => {
    const data = { name: '', description: 'A string', type: 'string' };
    const result = ZodParameterSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getErrorMessages(result.error)).toContain('name: Parameter name cannot be empty');
    }
  });

  it('should validate a correct integer parameter', () => {
    const data = { name: 'testInt', description: 'An integer', type: 'integer' };
    expect(ZodParameterSchema.safeParse(data).success).toBe(true);
  });

  it('should validate a correct float parameter', () => {
    const data = { name: 'testFloat', description: 'A float', type: 'float' };
    expect(ZodParameterSchema.safeParse(data).success).toBe(true);
  });

  it('should validate a correct boolean parameter', () => {
    const data = { name: 'testBool', description: 'A boolean', type: 'boolean' };
    expect(ZodParameterSchema.safeParse(data).success).toBe(true);
  });

  it('should validate a correct array parameter with string items', () => {
    const data = {
      name: 'testArray',
      description: 'An array of strings',
      type: 'array',
      items: { name: 'item_name', description: 'item_desc', type: 'string' },
    };
    expect(ZodParameterSchema.safeParse(data).success).toBe(true);
  });

  it('should validate a correct array parameter with integer items', () => {
    const data = {
      name: 'testArrayInt',
      description: 'An array of integers',
      type: 'array',
      items: { name: 'int_item', description: 'item_desc', type: 'integer' },
    };
    expect(ZodParameterSchema.safeParse(data).success).toBe(true);
  });


  it('should validate a nested array parameter', () => {
    const data = {
      name: 'outerArray',
      description: 'Outer array',
      type: 'array',
      items: {
        name: 'innerArray',
        description: 'Inner array of integers',
        type: 'array',
        items: { name: 'intItem', description: 'integer item', type: 'integer' },
      },
    };
    const result = ZodParameterSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should invalidate an array parameter with missing items definition', () => {
    const data = {
      name: 'testArray',
      description: 'An array',
      type: 'array',
      // items is missing
    };
    const result = ZodParameterSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getErrorMessages(result.error)).toEqual(
        expect.arrayContaining([expect.stringMatching(/items: Required/i)])
      );
    }
  });

  it('should invalidate an array parameter with item having an empty name', () => {
    const data = {
      name: 'testArray',
      description: 'An array',
      type: 'array',
      items: { name: '', description: 'item desc', type: 'string' },
    };
    const result = ZodParameterSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getErrorMessages(result.error)).toContain('items.name: Parameter name cannot be empty');
    }
  });

   it('should invalidate if type is missing', () => {
    const data = { name: 'testParam', description: 'A param' };
    const result = ZodParameterSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
        expect(getErrorMessages(result.error)).toEqual(
          expect.arrayContaining([expect.stringMatching(/Invalid discriminator value/i)])
        );
    }
  });
});

describe('ZodToolSchema', () => {
  const validParameter = { name: 'param1', description: 'String param', type: 'string' as const };

  it('should validate a correct tool schema', () => {
    const data = {
      description: 'My test tool',
      parameters: [validParameter],
    };
    expect(ZodToolSchema.safeParse(data).success).toBe(true);
  });

  it('should validate a tool schema with authRequired', () => {
    const data = {
      description: 'My auth tool',
      parameters: [],
      authRequired: ['google_oauth'],
    };
    expect(ZodToolSchema.safeParse(data).success).toBe(true);
  });

  it('should invalidate a tool schema with an empty description', () => {
    const data = {
      description: '',
      parameters: [validParameter],
    };
    const result = ZodToolSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getErrorMessages(result.error)).toContain('description: Tool description cannot be empty');
    }
  });

  it('should invalidate a tool schema with an invalid parameter', () => {
    const data = {
      description: 'My test tool',
      parameters: [{ name: '', description: 'Empty name param', type: 'string' }], // Invalid parameter
    };
    const result = ZodToolSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getErrorMessages(result.error)).toContain('parameters.0.name: Parameter name cannot be empty');
    }
  });
});

describe('ZodManifestSchema', () => {
  const validTool = {
    description: 'Tool A does something',
    parameters: [{ name: 'input', description: 'input string', type: 'string' as const }],
  };

  it('should validate a correct manifest schema', () => {
    const data = {
      serverVersion: '1.0.0',
      tools: {
        toolA: validTool,
        toolB: {
          description: 'Tool B does something else',
          parameters: [{ name: 'count', description: 'count number', type: 'integer' as const }],
          authRequired: ['admin'],
        },
      },
    };
    expect(ZodManifestSchema.safeParse(data).success).toBe(true);
  });

  it('should invalidate a manifest schema with an empty serverVersion', () => {
    const data = {
      serverVersion: '',
      tools: { toolA: validTool },
    };
    const result = ZodManifestSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getErrorMessages(result.error)).toContain('serverVersion: Server version cannot be empty');
    }
  });

  it('should invalidate a manifest schema with an empty tool name', () => {
    const data = {
      serverVersion: '1.0.0',
      tools: {
        '': validTool, // Empty tool name
      },
    };
    const result = ZodManifestSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getErrorMessages(result.error)).toEqual(
         expect.arrayContaining([expect.stringMatching(/Tool name cannot be empty/i)])
      );
    }
  });

  it('should invalidate a manifest schema with an invalid tool structure', () => {
    const data = {
      serverVersion: '1.0.0',
      tools: {
        toolA: {
          description: '',
          parameters: [],
        },
      },
    };
    const result = ZodManifestSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getErrorMessages(result.error)).toContain('tools.toolA.description: Tool description cannot be empty');
    }
  });
});

describe('createZodObjectSchemaFromParameters', () => {
  it('should create an empty Zod object for an empty parameters array', () => {
    const params: any[] = [];
    const schema = createZodObjectSchemaFromParameters(params);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ anyKey: 'anyValue' }).success).toBe(false); // Strict object
  });

  it('should create a Zod object schema from mixed parameter types', () => {
    const params = [
      { name: 'username', description: 'User login name', type: 'string' as const },
      { name: 'age', description: 'User age', type: 'integer' as const },
      { name: 'isActive', description: 'User status', type: 'boolean' as const },
    ];
    const schema = createZodObjectSchemaFromParameters(params);

    const validData = { username: 'john_doe', age: 30, isActive: true };
    expect(schema.safeParse(validData).success).toBe(true);

    const invalidData1 = { username: 'john_doe', age: '30', isActive: true }; // age as string
    const result1 = schema.safeParse(invalidData1);
    expect(result1.success).toBe(false);
    if (!result1.success) expect(getErrorMessages(result1.error)).toContain('age: Expected number, received string');

    const invalidData2 = { username: 'john_doe', isActive: true }; // missing age
    const result2 = schema.safeParse(invalidData2);
    expect(result2.success).toBe(false);
    if (!result2.success) expect(getErrorMessages(result2.error)).toContain('age: Required');
  });

  it('should create a Zod object schema with an array parameter', () => {
    const params = [
      {
        name: 'tags',
        description: 'List of tags',
        type: 'array' as const,
        items: { name: 'tag_item', description: 'A tag', type: 'string' as const },
      },
      { name: 'id', description: 'd', type: 'integer' as const}
    ];
    const schema = createZodObjectSchemaFromParameters(params);

    const validData = { tags: ['news', 'tech'], id: 1 };
    expect(schema.safeParse(validData).success).toBe(true);

    const invalidData = { tags: ['news', 123], id: 1 }; // number in string array
    const result = schema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      // The error path will be tags.1 (for the second item in the array)
      expect(getErrorMessages(result.error)).toContain('tags.1: Expected string, received number');
    }
  });

  it('should create a Zod object schema with a nested array parameter', () => {
    const params = [
      {
        name: 'matrix',
        description: 'A matrix of numbers',
        type: 'array' as const,
        items: {
          name: 'row',
          description: 'A row in the matrix',
          type: 'array' as const,
          items: { name: 'cell', description: 'A cell value', type: 'float' as const },
        },
      },
    ];
    const schema = createZodObjectSchemaFromParameters(params);

    const validData = { matrix: [[1.0, 2.5], [3.0, 4.5]] };
    expect(schema.safeParse(validData).success).toBe(true);

    const invalidData = { matrix: [[1.0, '2.5'], [3.0, 4.5]] }; // string in float array
    const result = schema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if(!result.success) {
        expect(getErrorMessages(result.error)).toContain('matrix.0.1: Expected number, received string');
    }
  });
});