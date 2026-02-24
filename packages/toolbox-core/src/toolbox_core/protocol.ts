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

export enum Protocol {
  MCP_v20241105 = '2024-11-05',
  MCP_v20250326 = '2025-03-26',
  MCP_v20250618 = '2025-06-18',
  MCP_v20251125 = '2025-11-25',
  MCP = MCP_v20250618, // Default MCP
  MCP_LATEST = MCP_v20251125,
}

export function getSupportedMcpVersions(): Protocol[] {
  return [
    Protocol.MCP_v20241105,
    Protocol.MCP_v20250326,
    Protocol.MCP_v20250618,
    Protocol.MCP_v20251125,
  ];
}

// Type Definitions
interface StringType {
  type: 'string';
}
interface IntegerType {
  type: 'integer';
}
interface FloatType {
  type: 'float';
}
interface BooleanType {
  type: 'boolean';
}

export type PrimitiveTypeSchema =
  | StringType
  | IntegerType
  | FloatType
  | BooleanType;

interface ArrayType {
  type: 'array';
  items: TypeSchema; // Recursive
}
interface ObjectType {
  type: 'object';
  additionalProperties?: boolean | PrimitiveTypeSchema;
}

// Union of all pure type definitions.
export type TypeSchema = PrimitiveTypeSchema | ArrayType | ObjectType;

// The base properties of a named parameter.
interface BaseParameter {
  name: string;
  description: string;
  authSources?: string[];
  required?: boolean;
}

export type ParameterSchema = BaseParameter & TypeSchema;

const ZodPrimitiveTypeSchema: z.ZodType<PrimitiveTypeSchema> =
  z.discriminatedUnion('type', [
    z.object({type: z.literal('string')}),
    z.object({type: z.literal('integer')}),
    z.object({type: z.literal('float')}),
    z.object({type: z.literal('boolean')}),
  ]);

// Zod schema for the pure type definitions. This must be lazy for recursion.
const ZodTypeSchema: z.ZodType<TypeSchema> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({type: z.literal('string')}),
    z.object({type: z.literal('integer')}),
    z.object({type: z.literal('float')}),
    z.object({type: z.literal('boolean')}),
    z.object({type: z.literal('array'), items: ZodTypeSchema}),
    z.object({
      type: z.literal('object'),
      additionalProperties: z
        .union([z.boolean(), ZodPrimitiveTypeSchema])
        .optional(),
    }),
  ]),
);

// Zod schema for the base properties.
const ZodBaseParameter = z.object({
  name: z.string().min(1, 'Parameter name cannot be empty'),
  description: z.string(),
  authSources: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});

export const ZodParameterSchema: z.ZodType<ParameterSchema> =
  ZodBaseParameter.and(ZodTypeSchema);

export const ZodToolSchema = z.object({
  description: z.string().min(1, 'Tool description cannot be empty'),
  parameters: z.array(ZodParameterSchema),
  authRequired: z.array(z.string()).optional(),
});

export const ZodManifestSchema = z.object({
  serverVersion: z.string().min(1, 'Server version cannot be empty'),
  tools: z.record(
    z.string().min(1, 'Tool name cannot be empty'),
    ZodToolSchema,
  ),
});

export type ZodManifest = z.infer<typeof ZodManifestSchema>;

function buildZodShapeFromTypeSchema(typeSchema: TypeSchema): ZodTypeAny {
  switch (typeSchema.type) {
    case 'string':
      return z.string();
    case 'integer':
      return z.number().int();
    case 'float':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(buildZodShapeFromTypeSchema(typeSchema.items));
    case 'object':
      if (typeof typeSchema.additionalProperties === 'object') {
        return z.record(
          z.string(),
          buildZodShapeFromTypeSchema(
            typeSchema.additionalProperties as TypeSchema,
          ),
        );
      } else if (typeSchema.additionalProperties === false) {
        return z.object({});
      } else {
        return z.record(z.string(), z.any());
      }
    default: {
      const _exhaustiveCheck: never = typeSchema;
      throw new Error(`Unknown parameter type: ${_exhaustiveCheck['type']}`);
    }
  }
}

function buildZodShapeFromParam(param: ParameterSchema): ZodTypeAny {
  const schema = buildZodShapeFromTypeSchema(param);
  if (param.required === false) {
    return schema.nullish();
  }
  return schema;
}

export function createZodSchemaFromParams(
  params: ParameterSchema[],
): ZodObject<ZodRawShape> {
  const shape: ZodRawShape = {};
  for (const param of params) {
    shape[param.name] = buildZodShapeFromParam(param);
  }
  return z.object(shape).strict();
}
