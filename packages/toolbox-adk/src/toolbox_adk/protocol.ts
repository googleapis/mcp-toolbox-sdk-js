// Copyright 2025 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {FunctionDeclaration, Schema, Type} from '@google/genai';
import {z, ZodObject, ZodRawShape, ZodTypeAny} from 'zod';

/**
 * Safely determines the JSON Schema type enum from a Zod type object.
 *
 * @param zodType The Zod type instance to inspect.
 * @returns A value from the `Type` enum.
 */
function getJsonSchemaTypeFromZod(zodType: ZodTypeAny): Type {
  if (zodType instanceof z.ZodString) return Type.STRING;
  if (zodType instanceof z.ZodNumber) return Type.NUMBER;
  if (zodType instanceof z.ZodBoolean) return Type.BOOLEAN;
  if (zodType instanceof z.ZodArray) return Type.ARRAY;
  if (zodType instanceof z.ZodObject) return Type.OBJECT;
    return Type.STRING;
}

/**
 * Converts a ZodObject schema into a FunctionDeclaration for the Google ADK.
 *
 * @param name The name of the function/tool.
 * @param description The description of the function/tool.
 * @param zodSchema The Zod schema for the tool's parameters.
 * @returns A FunctionDeclaration object for the Google Genai API.
 */
export function ConvertZodToFunctionDeclaration(
  name: string,
  description: string,
  zodSchema: ZodObject<ZodRawShape>,
): FunctionDeclaration {
  const properties: Record<string, Schema> = {};
  const required: string[] = [];

  if (!zodSchema?.shape) {
    return {
      name,
      description,
      parameters: {type: Type.OBJECT, properties, required},
    };
  }

  for (const [key, zodType] of Object.entries(zodSchema.shape)) {
    properties[key] = {
      type: getJsonSchemaTypeFromZod(zodType),
      description: zodType.description || '',
    };

    if (!zodType.isOptional()) {
      required.push(key);
    }
  }

  return {
    name,
    description,
    parameters: {
      type: Type.OBJECT,
      properties,
      required,
    },
  };
}