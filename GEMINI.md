# MCP Toolbox JS SDKs: Architectural & Codebase Context

This document provides complete architectural and technical context for the `mcp-toolbox-sdk-js` monorepo. It serves as a primary reference guide for AI coding assistants and contributors to understand the core design patterns, transport layers, schema compilation mechanisms, and file structures used across the SDKs.

## Repository Overview
This repository is a JavaScript/TypeScript monorepo managed by [Turborepo](https://turbo.build/) (`turbo.json`). It hosts SDKs designed to seamlessly integrate remote tools defined on an [MCP Toolbox](https://github.com/googleapis/mcp-toolbox) server into GenAI applications. These SDKs enable developers to load tools defined in Toolbox and execute them as standard asynchronous JS functions or objects within popular orchestration frameworks like Langchain, LlamaIndex, Genkit, or native Agentic development kits.

---

## Package Structure & Architecture

The repository is organized into two primary packages under the `packages/` directory:

### 1. `@toolbox-sdk/core` (`packages/toolbox-core`)
The base, framework-agnostic SDK responsible for network communication, protocol mapping, and runtime argument validation.
* **ToolboxClient**: The core entrypoint class. Manages HTTP configurations and dynamic request headers. It exposes methods to load single tools (`loadTool`) or entire tool collections (`loadToolset`) from a remote Toolbox server.
* **Protocol & Transports (`src/toolbox_core/mcp/`)**: Supports standard Model Context Protocol (MCP) revisions natively (e.g., `v20241105`, `v20250326`, `v20250618`, `v20251125`). The abstract base class `McpHttpTransportBase` handles protocol negotiation (requesting the `tools` capability) and extracts custom metadata annotations (`toolbox/authParam`, `toolbox/authInvoke`) to enforce authorization rules. Version-specific implementations map invocations to underlying JSON-RPC over HTTP requests.
* **Dynamic Schema Compilation (`createZodSchemaFromParams`)**: Translates standard JSON Schema parameters provided by the server into highly strict runtime [Zod](https://zod.dev/) schemas. This guarantees robust payload validation on the client side before triggering remote network calls.
* **ToolboxTool Factory**: Returns a callable asynchronous function that wraps remote tool execution. Each tool instance is immutable—configuration methods return new instances rather than modifying the original. It supports highly modular configuration via utility functions to pre-bind static arguments (`bindParams`) and attach dynamic authentication resolvers (`addAuthTokenGetters`).

### 2. `@toolbox-sdk/adk` (`packages/toolbox-adk`)
An adapter SDK engineered to interface directly with the Google Agent Development Kit (ADK).
* **ToolboxTool Adapter**: Wraps a core tool callable object and inherits directly from the ADK's `BaseTool` abstraction.
* **Schema Translation (`ConvertZodToFunctionDeclaration`)**: Converts the underlying client-side Zod schema into Google GenAI's native `FunctionDeclaration` format via `_getDeclaration()`. This allows Gemini/GenAI models to autonomously reason about tool capabilities and provide properly structured parameters.
* **Execution Delegation**: Implements `runAsync(request)` to directly delegate tool execution to the underlying `@toolbox-sdk/core` function wrapper.

---

## Architecture Patterns

### Immutable Configuration Pattern
Tool instances use an immutable configuration pattern where methods like `bindParams()` and `addAuthTokenGetters()` return new instances rather than modifying the original. This enables safe tool sharing, thread-safe configuration chaining, and side-effect-free execution preparation across different modules.

### Multi-Layered Authentication Architecture
The SDK implements a robust multi-layered authentication system to resolve security scopes:
1. **Client-Level**: Custom headers applied across all requests managed via `ClientHeadersConfig`.
2. **Tool-Level**: Per-tool token injection managed dynamically via `AuthTokenGetters`.
3. **Parameter-Level**: Authorization parameters specified natively inside schema capabilities.

### Protocol and Validation Layer
Zod schemas enforce end-to-end type safety and validate data shapes at multiple boundaries:
- **Manifest Validation**: Enforces schema compliance against `ZodManifestSchema`.
- **Runtime Argument Validation**: Local parsing against dynamically compiled input definitions prevents malformed outbound JSON-RPC messages.
- **Compile-Time Checks**: Strongly-typed interfaces derived directly from Zod shapes ensure codebase safety.

---

## Tool Execution Lifecycle

The SDK enforces a clean three-stage lifecycle for tools:
1. **Discovery**: `ToolboxClient` fetches, parses, and validates tool manifests from the remote Toolbox server.
2. **Configuration**: `ToolboxTool` instances are configured with static bound values and credential scopes using immutable chaining methods.
3. **Execution**: Tools are invoked asynchronously with client arguments, merging local validation shapes and firing optimized JSON-RPC requests.

---

## Key File Locations

### Source Code
- `packages/toolbox-core/src/toolbox_core/client.ts` - `ToolboxClient` core implementation.
- `packages/toolbox-core/src/toolbox_core/tool.ts` - `ToolboxTool` factory and callable function logic.
- `packages/toolbox-core/src/toolbox_core/protocol.ts` - Protocol versions, parameter mapping, and Zod schema builders.
- `packages/toolbox-core/src/toolbox_core/errorUtils.ts` - Standardized API error handling and context logging.
- `packages/toolbox-adk/src/toolbox_adk/tool.ts` - ADK `BaseTool` wrapper adapter implementation.
- `packages/toolbox-adk/src/toolbox_adk/protocol.ts` - Conversion from Zod shapes to Google GenAI `FunctionDeclaration`.

### Tests
- `packages/toolbox-core/test/test.client.ts` - Comprehensive client unit tests.
- `packages/toolbox-core/test/test.tool.ts` - Wrapper validation, argument parsing, and credential duplicate tests.

### Documentation
- `README.md` - Monorepo integration summaries and high-level architecture maps.
- `packages/toolbox-core/DEVELOPER.md` - Local environment bootstrapping instructions.

---

## Error Handling

Consistent error handling strategies are leveraged to optimize debugging context:
- **Validation Errors**: Throw contextual failures detailing the exact nested payload path using Zod reporting paths.
- **Network Errors**: Handled gracefully using `logApiError()`, logging full HTTP protocol responses or network timeouts cleanly.
- **Security Dependencies**: Direct developers explicitly on missing token scopes required to satisfy authorization gates.

---

## Citations & Core Snippets Reference

### Dynamic Header Configurations (`client.ts`)
```typescript
export type HeaderFunction = () => string | Promise<string>;
export type ClientHeaderProvider = string | HeaderFunction;
export type ClientHeadersConfig = Record<string, ClientHeaderProvider>;
```

### Immutable Chaining Mechanics (`tool.ts`)
```typescript
callable.bindParams = function (paramsToBind: BoundParams) {
  const originalParamKeys = Object.keys(this.params.shape);
  for (const paramName of Object.keys(paramsToBind)) {
    if (paramName in this.boundParams) {
      throw new Error(
        `Cannot re-bind parameter: parameter '${paramName}' is already bound in tool '${this.toolName}'.`
      );
    }
    if (!originalParamKeys.includes(paramName)) {
      throw new Error(
        `Unable to bind parameter: no parameter named '${paramName}' in tool '${this.toolName}'.`
      );
    }
  }

  const newBoundParams = {...this.boundParams, ...paramsToBind};
  return ToolboxTool(
    transport,
    this.toolName,
    this.description,
    this.params,
    this.authTokenGetters,
    this.requiredAuthnParams,
    this.requiredAuthzTokens,
    newBoundParams,
    this.clientHeaders
  );
};
```

### Standardized Error Logging (`errorUtils.ts`)
```typescript
export function logApiError(baseMessage: string, error: unknown): void {
  let loggableDetails: unknown;

  if (isAxiosError(error)) {
    if (error.response && typeof error.response.data !== 'undefined') {
      loggableDetails = error.response.data;
    } else {
      loggableDetails = error.message;
    }
  } else if (error instanceof Error) {
    loggableDetails = error.message;
  } else {
    loggableDetails = error;
  }
  console.error(baseMessage, loggableDetails);
}
```
