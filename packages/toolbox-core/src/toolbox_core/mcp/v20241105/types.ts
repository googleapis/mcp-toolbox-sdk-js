// Copyright 2026 Google LLC
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

export const RequestParamsSchema = z.object({}).passthrough();
export type RequestParams = z.infer<typeof RequestParamsSchema>;

export const JSONRPCRequestSchema = z.object({
  jsonrpc: z.literal('2.0').default('2.0'),
  id: z.union([z.string(), z.number()]).optional(), // Default handled in usage, or logic
  method: z.string(),
  params: z.record(z.any()).optional().nullable(),
});
export type JSONRPCRequest = z.infer<typeof JSONRPCRequestSchema>;

export const JSONRPCNotificationSchema = z.object({
  jsonrpc: z.literal('2.0').default('2.0'),
  method: z.string(),
  params: z.record(z.any()).optional().nullable(),
});
export type JSONRPCNotification = z.infer<typeof JSONRPCNotificationSchema>;

export const JSONRPCResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: z.record(z.any()),
});
export type JSONRPCResponse = z.infer<typeof JSONRPCResponseSchema>;

export const ErrorDataSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.any().optional().nullable(),
});
export type ErrorData = z.infer<typeof ErrorDataSchema>;

export const JSONRPCErrorSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  error: ErrorDataSchema,
});
export type JSONRPCError = z.infer<typeof JSONRPCErrorSchema>;

export const BaseMetadataSchema = z.object({
  name: z.string(),
});
export type BaseMetadata = z.infer<typeof BaseMetadataSchema>;

export const ImplementationSchema = BaseMetadataSchema.extend({
  version: z.string(),
});
export type Implementation = z.infer<typeof ImplementationSchema>;

export const ClientCapabilitiesSchema = z.object({}).passthrough();
export type ClientCapabilities = z.infer<typeof ClientCapabilitiesSchema>;

export const InitializeRequestParamsSchema = RequestParamsSchema.extend({
  protocolVersion: z.string(),
  capabilities: ClientCapabilitiesSchema,
  clientInfo: ImplementationSchema,
});
export type InitializeRequestParams = z.infer<
  typeof InitializeRequestParamsSchema
>;

export const ServerCapabilitiesSchema = z.object({
  prompts: z.record(z.any()).optional().nullable(),
  tools: z.record(z.any()).optional().nullable(),
});
export type ServerCapabilities = z.infer<typeof ServerCapabilitiesSchema>;

export const InitializeResultSchema = z.object({
  protocolVersion: z.string(),
  capabilities: ServerCapabilitiesSchema,
  serverInfo: ImplementationSchema,
  instructions: z.string().optional().nullable(),
});
export type InitializeResult = z.infer<typeof InitializeResultSchema>;

export const ToolSchema = BaseMetadataSchema.extend({
  description: z.string().optional().nullable(),

  inputSchema: z.record(z.any()),
});
export type Tool = z.infer<typeof ToolSchema>;

export const ListToolsResultSchema = z.object({
  tools: z.array(ToolSchema),
});
export type ListToolsResult = z.infer<typeof ListToolsResultSchema>;

export const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
export type TextContent = z.infer<typeof TextContentSchema>;

export const CallToolResultSchema = z.object({
  content: z.array(TextContentSchema),
  isError: z.boolean().default(false).optional(),
});
export type CallToolResult = z.infer<typeof CallToolResultSchema>;

// Generic Request/Notification types for internal usage (not full schemas)
export type MCPRequest<T> = {
  method: string;
  params?: Record<string, any> | any | null; // Allow Schema-like types too?
  getResultModel: () => z.ZodType<T>;
};

export type MCPNotification = {
  method: string;
  params?: Record<string, any> | any | null;
};

// Request/Notification Classes/Factories
export const InitializeRequest: MCPRequest<InitializeResult> = {
  method: 'initialize',
  // params handled at runtime
  getResultModel: () => InitializeResultSchema,
};

export const InitializedNotification: MCPNotification = {
  method: 'notifications/initialized',
  params: {},
};

export const ListToolsRequest: MCPRequest<ListToolsResult> = {
  method: 'tools/list',
  params: {},
  getResultModel: () => ListToolsResultSchema,
};

export const CallToolRequestParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.any()),
});
export type CallToolRequestParams = z.infer<typeof CallToolRequestParamsSchema>;

export const CallToolRequest: MCPRequest<CallToolResult> = {
  method: 'tools/call',
  // params computed at runtime
  getResultModel: () => CallToolResultSchema,
};
