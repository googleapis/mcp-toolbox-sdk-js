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

import {z, ZodRawShape, ZodTypeAny, ZodObject} from 'zod';

// Define All Interfaces

interface BaseParameter {
  name: string;
  description: string;
  authSources?: string[];
}

interface StringParameter extends BaseParameter {
  type: 'string';
}

interface IntegerParameter extends BaseParameter {
  type: 'integer';
}

interface FloatParameter extends BaseParameter {
  type: 'float';
}

interface BooleanParameter extends BaseParameter {
  type: 'boolean';
}

interface ArrayParameter extends BaseParameter {
  type: 'array';
  items: ParameterSchema; // Recursive reference to the ParameterSchema type
}

export type ParameterSchema =
  | StringParameter
  | IntegerParameter
  | FloatParameter
  | BooleanParameter
  | ArrayParameter;

// Get all Zod schema types

const ZodBaseParameter = z.object({
  name: z.string().min(1, 'Parameter name cannot be empty'),
  description: z.string(),
  authSources: z.array(z.string()).optional(),
});

export const ZodParameterSchema = z.lazy(() =>
  z.discriminatedUnion('type', [
    ZodBaseParameter.extend({
      type: z.literal('string'),
    }),
    ZodBaseParameter.extend({
      type: z.literal('integer'),
    }),
    ZodBaseParameter.extend({
      type: z.literal('float'),
    }),
    ZodBaseParameter.extend({
      type: z.literal('boolean'),
    }),
    ZodBaseParameter.extend({
      type: z.literal('array'),
      items: ZodParameterSchema, // Recursive reference for the item's definition
    }),
  ])
) as z.ZodType<ParameterSchema>;

export const ZodToolSchema = z.object({
  description: z.string().min(1, 'Tool description cannot be empty'),
  parameters: z.array(ZodParameterSchema),
  authRequired: z.array(z.string()).optional(),
});

export const ZodManifestSchema = z.object({
  serverVersion: z.string().min(1, 'Server version cannot be empty'),
  tools: z.record(
    z.string().min(1, 'Tool name cannot be empty'),
    ZodToolSchema
  ),
});

/**
 * Recursively builds a Zod schema for a single parameter based on its TypeScript definition.
 * @param param The ParameterSchema (TypeScript type) to convert.
 * @returns A ZodTypeAny representing the schema for this parameter.
 */
function buildZodShapeFromParam(param: ParameterSchema): ZodTypeAny {
  switch (param.type) {
    case 'string':
      return z.string();
    case 'integer':
      return z.number().int();
    case 'float':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array':
      // Recursively build the schema for array items
      return z.array(buildZodShapeFromParam(param.items));
    default: {
      // This ensures exhaustiveness at compile time if ParameterSchema is a discriminated union
      const _exhaustiveCheck: never = param;
      throw new Error(`Unknown parameter type: ${_exhaustiveCheck['type']}`);
    }
  }
}

/**
 * Creates a ZodObject schema from an array of ParameterSchema (TypeScript types).
 * This combined schema is used by ToolboxTool to validate its call arguments.
 * @param params Array of ParameterSchema objects.
 * @returns A ZodObject schema.
 */
export function createZodSchemaFromParams(
  params: ParameterSchema[]
): ZodObject<ZodRawShape> {
  const shape: ZodRawShape = {};
  for (const param of params) {
    shape[param.name] = buildZodShapeFromParam(param);
  }
  return z.object(shape).strict();
}
