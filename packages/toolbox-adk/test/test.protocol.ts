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

import {z} from 'zod';
import {ConvertZodToFunctionDeclaration} from '../src/toolbox_adk/protocol.js';
import {Type} from '@google/genai';

describe('ConvertZodToFunctionDeclaration', () => {
  it('should convert a basic Zod schema to a FunctionDeclaration', () => {
    const name = 'get_weather';
    const description = 'Get the weather for a location';
    const zodSchema = z.object({
      location: z
        .string()
        .describe('The city and state, e.g. San Francisco, CA'),
      unit: z
        .enum(['celsius', 'fahrenheit'])
        .optional()
        .describe('The unit of temperature'),
    });

    const result = ConvertZodToFunctionDeclaration(
      name,
      description,
      zodSchema,
    );

    expect(result).toEqual({
      name: 'get_weather',
      description: 'Get the weather for a location',
      parameters: {
        type: Type.OBJECT,
        properties: {
          location: {
            type: Type.STRING,
            description: 'The city and state, e.g. San Francisco, CA',
          },
          unit: {
            type: Type.STRING,
            description: 'The unit of temperature',
          },
        },
        required: ['location'],
      },
    });
  });

  it('should handle a Zod schema with no properties', () => {
    const name = 'get_time';
    const description = 'Get the current time';
    const zodSchema = z.object({});

    const result = ConvertZodToFunctionDeclaration(
      name,
      description,
      zodSchema,
    );

    expect(result).toEqual({
      name: 'get_time',
      description: 'Get the current time',
      parameters: {
        type: Type.OBJECT,
        properties: {},
        required: [],
      },
    });
  });

  it('should handle a Zod schema with various data types', () => {
    const name = 'create_user';
    const description = 'Create a new user';
    const zodSchema = z.object({
      username: z.string(),
      age: z.number().int(), // Changed to .int()
      weight: z.number(), // Added to test standard number
      is_active: z.boolean(),
      tags: z.array(z.string()),
      profile: z.object({
        email: z.string(),
        address: z.string().optional(),
      }),
    });

    const result = ConvertZodToFunctionDeclaration(
      name,
      description,
      zodSchema,
    );

    expect(result).toEqual({
      name: 'create_user',
      description: 'Create a new user',
      parameters: {
        type: Type.OBJECT,
        properties: {
          username: {
            type: Type.STRING,
            description: '',
          },
          age: {
            type: Type.INTEGER, // Updated expectation
            description: '',
          },
          weight: {
            type: Type.NUMBER, // Updated expectation
            description: '',
          },
          is_active: {
            type: Type.BOOLEAN,
            description: '',
          },
          tags: {
            type: Type.ARRAY,
            description: '',
          },
          profile: {
            type: Type.OBJECT,
            description: '',
          },
        },
        required: ['username', 'age', 'weight', 'is_active', 'tags', 'profile'],
      },
    });
  });

  it('should handle a Zod schema with all optional properties', () => {
    const name = 'update_settings';
    const description = 'Update user settings';
    const zodSchema = z.object({
      theme: z.string().optional(),
      notifications_enabled: z.boolean().optional(),
    });

    const result = ConvertZodToFunctionDeclaration(
      name,
      description,
      zodSchema,
    );

    // This test now passes because your updated getJsonSchemaTypeFromZod
    // function correctly unwraps ZodOptional.
    expect(result).toEqual({
      name: 'update_settings',
      description: 'Update user settings',
      parameters: {
        type: Type.OBJECT,
        properties: {
          theme: {
            type: Type.STRING,
            description: '',
          },
          notifications_enabled: {
            type: Type.BOOLEAN,
            description: '',
          },
        },
        required: [],
      },
    });
  });

  it('should handle a Zod schema with no description for properties', () => {
    const name = 'log_event';
    const description = 'Log an event';
    const zodSchema = z.object({
      event_name: z.string(),
      event_data: z.object({}),
    });

    const result = ConvertZodToFunctionDeclaration(
      name,
      description,
      zodSchema,
    );

    expect(result).toEqual({
      name: 'log_event',
      description: 'Log an event',
      parameters: {
        type: Type.OBJECT,
        properties: {
          event_name: {
            type: Type.STRING,
            description: '',
          },
          event_data: {
            type: Type.OBJECT,
            description: '',
          },
        },
        required: ['event_name', 'event_data'],
      },
    });
  });

  // --- NEW TEST ---
  it('should handle z.null() and z.nullable() types', () => {
    const name = 'process_data';
    const description = 'Process some data';
    const zodSchema = z.object({
      user_id: z.string().nullable(), // Should unwrap to STRING
      error_code: z.null(), // Should be NULL
    });

    const result = ConvertZodToFunctionDeclaration(
      name,
      description,
      zodSchema,
    );

    expect(result).toEqual({
      name: 'process_data',
      description: 'Process some data',
      parameters: {
        type: Type.OBJECT,
        properties: {
          user_id: {
            type: Type.STRING,
            description: '',
          },
          error_code: {
            type: Type.NULL,
            description: '',
          },
        },
        required: ['user_id', 'error_code'],
      },
    });
  });

  it('should return TYPE_UNSPECIFIED for unsupported Zod types', () => {
    const name = 'unsupported_test';
    const description = 'Test unsupported types';
    const zodSchema = z.object({
      start_date: z.date(),
      user_count: z.bigint(),
    });

    const result = ConvertZodToFunctionDeclaration(
      name,
      description,
      zodSchema,
    );

    expect(result).toEqual({
      name: 'unsupported_test',
      description: 'Test unsupported types',
      parameters: {
        type: Type.OBJECT,
        properties: {
          start_date: {
            type: Type.TYPE_UNSPECIFIED,
            description: '',
          },
          user_count: {
            type: Type.TYPE_UNSPECIFIED,
            description: '',
          },
        },
        required: ['start_date', 'user_count'],
      },
    });
  });
});
