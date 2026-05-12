# MCP Toolbox JS SDKs: Architectural & Codebase Context

This document provides complete architectural and technical context for the `mcp-toolbox-sdk-js` monorepo. It serves as a primary reference guide for AI coding assistants and contributors to understand the core design patterns, transport layers, and schema compilation mechanisms used across the SDKs.

## Repository Overview
This repository is a JavaScript/TypeScript monorepo managed by [Turborepo](https://turbo.build/) (`turbo.json`). It hosts SDKs for consuming remote tools defined on an [MCP Toolbox](https://github.com/googleapis/mcp-toolbox) server, enabling developers to execute them as standard asynchronous functions or integrate them as native tool definitions into Agentic AI frameworks.

---

## Package Structure & Architecture

The repository is organized into two primary packages under the `packages/` directory:

### 1. `@toolbox-sdk/core` (`packages/toolbox-core`)
The base, framework-agnostic SDK responsible for network communication, protocol mapping, and runtime argument validation.
* **ToolboxClient**: The core entrypoint class. Manages HTTP configurations and dynamic request headers. It exposes methods to load single tools (`loadTool`) or entire tool collections (`loadToolset`) from a remote Toolbox server.
* **Protocol & Transports (`src/toolbox_core/mcp/`)**: Supports standard Model Context Protocol (MCP) revisions natively (e.g., `v20241105`, `v20250326`, `v20250618`, `v20251125`). The abstract base class `McpHttpTransportBase` handles protocol negotiation (requesting the `tools` capability) and extracts custom metadata annotations (`toolbox/authParam`, `toolbox/authInvoke`) to enforce authorization rules. Version-specific implementations map invocations to underlying JSON-RPC over HTTP requests.
* **Dynamic Schema Compilation (`createZodSchemaFromParams`)**: Translates standard JSON Schema parameters provided by the server into highly strict runtime [Zod](https://zod.dev/) schemas. This guarantees robust payload validation on the client side before triggering remote network calls.
* **ToolboxTool Factory**: Returns a callable asynchronous function that wraps remote tool execution. It supports highly modular configuration via utility functions to pre-bind static arguments (`bindParams`) and attach dynamic authentication resolvers (`addAuthTokenGetters`).

### 2. `@toolbox-sdk/adk` (`packages/toolbox-adk`)
An adapter SDK engineered to interface directly with the Google Agent Development Kit (ADK).
* **ToolboxTool Adapter**: Wraps a core tool callable object and inherits directly from the ADK's `BaseTool` abstraction.
* **Schema Translation (`ConvertZodToFunctionDeclaration`)**: Converts the underlying client-side Zod schema into Google GenAI's native `FunctionDeclaration` format via `_getDeclaration()`. This allows Gemini/GenAI models to autonomously reason about tool capabilities and provide properly structured parameters.
* **Execution Delegation**: Implements `runAsync(request)` to directly delegate tool execution to the underlying `@toolbox-sdk/core` function wrapper.

---

## Typical Execution Lifecycle

1. **Initialization**: A `ToolboxClient` is initialized with the target MCP Toolbox base URL and requested protocol version.
2. **Manifest Fetching**: Executing `loadTool("target-tool")` queries the server to retrieve the specific tool's schema and metadata description.
3. **Wrapper Construction**: The SDK resolves security dependencies, compiles Zod validation shapes, and instantiates an executable `ToolboxTool` wrapper.
4. **Invocation**: When invoked (by application logic or an LLM tool-call decision), input arguments are strictly validated locally. Pre-bound static parameters and resolved authorization tokens are merged into the request headers/payload, and a JSON-RPC `tools/call` sequence is fired to execute the logic on the remote server.
