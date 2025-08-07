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

import {ZodError, ZodTypeAny} from 'zod';
import {
  ZodParameterSchema,
  ZodToolSchema,
  ZodManifestSchema,
  ParameterSchema,
  createZodSchemaFromParams,
} from '../src/toolbox_core/protocol';

// HELPER FUNCTIONS

const getErrorMessages = (error: ZodError): string[] => {
  return error.issues.map(e => {
    if (e.path.length > 0) {
      return `${e.path.join('.')}: ${e.message}`;
    }
    return e.message;
  });
};

const expectParseSuccess = (schema: ZodTypeAny, data: unknown) => {
  const result = schema.safeParse(data);
  expect(result.success).toBe(true);
};

const expectParseFailure = (
  schema: ZodTypeAny,
  data: unknown,
  errorMessageCheck: (errors: string[]) => void,
) => {
  const result = schema.safeParse(data);
  expect(result.success).toBe(false);

  if (!result.success) {
    errorMessageCheck(getErrorMessages(result.error));
  } else {
    fail(
      `Parsing was expected to fail for ${JSON.stringify(data)} but succeeded.`,
    );
  }
};

// TESTS

describe('ZodParameterSchema', () => {
  const validParameterTestCases = [
    {
      description: 'correct string parameter',
      data: {name: 'testString', description: 'A string', type: 'string'},
    },
    {
      description: 'string parameter with authSources',
      data: {
        name: 'testString',
        description: 'A string',
        type: 'string',
        authSources: ['google', 'custom'],
      },
    },
    {
      description: 'correct integer parameter',
      data: {name: 'testInt', description: 'An integer', type: 'integer'},
    },
    {
      description: 'correct float parameter',
      data: {name: 'testFloat', description: 'A float', type: 'float'},
    },
    {
      description: 'correct boolean parameter',
      data: {name: 'testBool', description: 'A boolean', type: 'boolean'},
    },
    {
      description: 'correct array parameter with string items',
      data: {
        name: 'testArray',
        description: 'An array of strings',
        type: 'array',
        items: {name: 'item_name', description: 'item_desc', type: 'string'},
      },
    },
    {
      description: 'correct array parameter with integer items',
      data: {
        name: 'testArrayInt',
        description: 'An array of integers',
        type: 'array',
        items: {name: 'int_item', description: 'item_desc', type: 'integer'},
      },
    },
    {
      description: 'nested array parameter',
      data: {
        name: 'outerArray',
        description: 'Outer array',
        type: 'array',
        items: {
          name: 'innerArray',
          description: 'Inner array of integers',
          type: 'array',
          items: {
            name: 'intItem',
            description: 'integer item',
            type: 'integer',
          },
        },
      },
    },
    {
      description: 'string parameter with required set to false',
      data: {
        name: 'optionalString',
        description: 'An optional string',
        type: 'string',
        required: false,
      },
    },
    {
      description: 'string parameter with required set to true',
      data: {
        name: 'requiredString',
        description: 'A required string',
        type: 'string',
        required: true,
      },
    },
    {
      description: 'integer parameter with required set to false',
      data: {
        name: 'optionalInt',
        description: 'An optional integer',
        type: 'integer',
        required: false,
      },
    },
    {
      description: 'integer parameter with required set to true',
      data: {
        name: 'requiredInt',
        description: 'A required integer',
        type: 'integer',
        required: true,
      },
    },
  ];

  test.each(validParameterTestCases)(
    'should validate a $description',
    ({data}) => {
      expectParseSuccess(ZodParameterSchema, data);
    },
  );

  it('should invalidate a string parameter with an empty name', () => {
    const data = {name: '', description: 'A string', type: 'string'};
    expectParseFailure(ZodParameterSchema, data, errors => {
      expect(errors).toContain('name: Parameter name cannot be empty');
    });
  });

  it('should invalidate an array parameter with missing items definition', () => {
    const data = {name: 'testArray', description: 'An array', type: 'array'};
    expectParseFailure(ZodParameterSchema, data, errors => {
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            'items: Invalid input: expected object, received undefined',
          ),
        ]),
      );
    });
  });
  
  it('should invalidate if type is missing', () => {
    const data = {name: 'testParam', description: 'A param'}; // type is missing
    expectParseFailure(ZodParameterSchema, data, errors => {
      expect(errors).toEqual(
        expect.arrayContaining([expect.stringMatching('type: Invalid input')]),
      );
    });
  });
});

describe('ZodToolSchema', () => {
  const validParameter = {
    name: 'param1',
    description: 'String param',
    type: 'string' as const,
  };

  it('should validate a correct tool schema', () => {
    const data = {
      description: 'My test tool',
      parameters: [validParameter],
    };
    expectParseSuccess(ZodToolSchema, data);
  });

  it('should validate a tool schema with authRequired', () => {
    const data = {
      description: 'My auth tool',
      parameters: [],
      authRequired: ['google_oauth'],
    };
    expectParseSuccess(ZodToolSchema, data);
  });

  it('should invalidate a tool schema with an empty description', () => {
    const data = {description: '', parameters: [validParameter]};
    expectParseFailure(ZodToolSchema, data, errors => {
      expect(errors).toContain('description: Tool description cannot be empty');
    });
  });

  it('should invalidate a tool schema with an invalid parameter', () => {
    const data = {
      description: 'My test tool',
      parameters: [{name: '', description: 'Empty name param', type: 'string'}],
    };
    expectParseFailure(ZodToolSchema, data, errors => {
      expect(errors).toContain(
        'parameters.0.name: Parameter name cannot be empty',
      );
    });
  });
});

describe('ZodManifestSchema', () => {
  const validTool = {
    description: 'Tool A does something',
    parameters: [
      {name: 'input', description: 'input string', type: 'string' as const},
    ],
  };

  it('should validate a correct manifest schema', () => {
    const data = {
      serverVersion: '1.0.0',
      tools: {
        toolA: validTool,
        toolB: {
          description: 'Tool B does something else',
          parameters: [
            {
              name: 'count',
              description: 'count number',
              type: 'integer' as const,
            },
          ],
          authRequired: ['admin'],
        },
      },
    };
    expectParseSuccess(ZodManifestSchema, data);
  });

  it('should invalidate a manifest schema with an empty serverVersion', () => {
    const data = {serverVersion: '', tools: {toolA: validTool}};
    expectParseFailure(ZodManifestSchema, data, errors => {
      expect(errors).toContain('serverVersion: Server version cannot be empty');
    });
  });

  it('should invalidate a manifest schema with an empty tool name', () => {
    const data = {serverVersion: '1.0.0', tools: {'': validTool}};
    expectParseFailure(ZodManifestSchema, data, errors => {
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.stringMatching('tools.: Invalid key in record'),
        ]),
      );
    });
  });

  it('should invalidate a manifest schema with an invalid tool structure', () => {
    const data = {
      serverVersion: '1.0.0',
      tools: {toolA: {description: '', parameters: []}},
    };
    expectParseFailure(ZodManifestSchema, data, errors => {
      expect(errors).toContain(
        'tools.toolA.description: Tool description cannot be empty',
      );
    });
  });
});

describe('createZodObjectSchemaFromParameters', () => {
  it('should create an empty Zod object for an empty parameters array (and be strict)', () => {
    const params: ParameterSchema[] = [];
    const schema = createZodSchemaFromParams(params);

    expectParseSuccess(schema, {});
    expectParseFailure(schema, {anyKey: 'anyValue'}, errors => {
      expect(errors.some(e => /unrecognized key/i.test(e))).toBe(true);
    });
  });

  it('should create a Zod object schema from mixed parameter types and validate data', () => {
    const params: ParameterSchema[] = [
      {
        name: 'username',
        description: 'User login name',
        type: 'string' as const,
      },
      {name: 'age', description: 'User age', type: 'integer' as const},
      {name: 'isActive', description: 'User status', type: 'boolean' as const},
    ];
    const schema = createZodSchemaFromParams(params);

    expectParseSuccess(schema, {username: 'john_doe', age: 30, isActive: true});

    expectParseFailure(
      schema,
      {username: 'john_doe', age: '30', isActive: true},
      errors =>
        expect(errors).toContain(
          'age: Invalid input: expected number, received string',
        ),
    );
    expectParseFailure(schema, {username: 'john_doe', isActive: true}, errors =>
      expect(errors).toContain(
        'age: Invalid input: expected number, received undefined',
      ),
    );
  });

  it('should create a Zod object schema with an array parameter', () => {
    const params: ParameterSchema[] = [
      {
        name: 'tags',
        description: 'List of tags',
        type: 'array' as const,
        items: {
          name: 'tag_item',
          description: 'A tag',
          type: 'string' as const,
        },
      },
      {name: 'id', description: 'An identifier', type: 'integer' as const},
    ];
    const schema = createZodSchemaFromParams(params);

    expectParseSuccess(schema, {tags: ['news', 'tech'], id: 1});

    expectParseFailure(schema, {tags: ['news', 123], id: 1}, errors => {
      expect(errors).toContain(
        'tags.1: Invalid input: expected string, received number',
      );
    });
  });

  it('should create a Zod object schema with a nested array parameter', () => {
    const params: ParameterSchema[] = [
      {
        name: 'matrix',
        description: 'A matrix of numbers',
        type: 'array' as const,
        items: {
          name: 'row',
          description: 'A row in the matrix',
          type: 'array' as const,
          items: {
            name: 'cell',
            description: 'A cell value',
            type: 'float' as const,
          },
        },
      },
    ];
    const schema = createZodSchemaFromParams(params);

    expectParseSuccess(schema, {
      matrix: [
        [1.0, 2.5],
        [3.0, 4.5],
      ],
    });

    expectParseFailure(
      schema,
      {
        matrix: [
          [1.0, '2.5'],
          [3.0, 4.5],
        ],
      },
      errors => {
        expect(errors).toContain(
          'matrix.0.1: Invalid input: expected number, received string',
        );
      },
    );
  });

  it('should throw an error when creating schema from parameter with unknown type', () => {
    const paramsWithUnknownType: ParameterSchema[] = [
      {
        name: 'faultyParam',
        description: 'This param has an unhandled type',
        type: 'someUnrecognizedType',
      } as unknown as ParameterSchema,
    ];
    expect(() => createZodSchemaFromParams(paramsWithUnknownType)).toThrow(
      'Unknown parameter type: someUnrecognizedType',
    );
  });

  describe('optional parameters', () => {
    const params: ParameterSchema[] = [
      {name: 'requiredParam', description: 'required', type: 'string' as const},
      {
        name: 'optionalParam',
        description: 'optional',
        type: 'string' as const,
        required: false,
      },
    ];
    const schema = createZodSchemaFromParams(params);

    it('should fail if a required parameter is missing', () => {
      expectParseFailure(schema, {optionalParam: 'value'}, errors => {
        expect(errors).toContain(
          'requiredParam: Invalid input: expected string, received undefined',
        );
      });
    });

    it('should succeed if an optional parameter is missing', () => {
      expectParseSuccess(schema, {requiredParam: 'value'});
    });

    it('should succeed if an optional parameter is null', () => {
      expectParseSuccess(schema, {requiredParam: 'value', optionalParam: null});
    });

    it('should succeed if an optional parameter is undefined', () => {
      expectParseSuccess(schema, {
        requiredParam: 'value',
        optionalParam: undefined,
      });
    });
  });
});
