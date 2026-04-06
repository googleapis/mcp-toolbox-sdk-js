![MCP Toolbox Logo](https://raw.githubusercontent.com/googleapis/mcp-toolbox/main/logo.png)

# MCP Toolbox SDKs for Javascript

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

The @toolbox-sdk/adk package provides a Javascript interface to the [MCP Toolbox]((https://github.com/googleapis/mcp-toolbox)) service, specifically designed for seamless integration with Google ADK TS. It allows you to load tools defined in the Toolbox service and use them directly within your ADK agents and workflows.

For detailed guides, authentication examples, and advanced configuration, visit the [JS SDK ADK Guide](https://mcp-toolbox.dev/sdks/js-sdk/adk/).

<!-- TOC -->

- [MCP Toolbox SDKs for Javascript](#mcp-toolbox-sdks-for-javascript)
- [Supported Environments](#supported-environments)
    - [Installation](#installation)
    - [Quickstart](#quickstart)
    - [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)

<!-- /TOC -->

# Supported Environments

This SDK is a standard Node.js package built with TypeScript, ensuring broad
compatibility with the modern JavaScript ecosystem.

- Node.js: Actively supported on Node.js v18.x and higher. The package is
  compatible with both modern ES Modules (import) and legacy CommonJS
  (require).
- TypeScript: The SDK is written in TypeScript and ships with its own type
  declarations, providing a first-class development experience with
  autocompletion and type-checking out of the box.
- JavaScript: Fully supports modern JavaScript in Node.js environments.

## Installation

```bash
npm install @toolbox-sdk/adk
```

## Quickstart

Here's a minimal example to get you started. Ensure your Toolbox service is running and accessible.

```javascript

import { ToolboxClient } from '@toolbox-sdk/adk';  
const client = new ToolboxClient(URL);  

async function quickstart() {  
  try {  
      const tools = await client.loadToolset();  
      // Use tools  
  } catch (error) {  
      console.error("unable to load toolset:", error.message);  
  }  
}  
quickstart();  
```

> [!NOTE]
> This guide uses modern ES Module (`import`) syntax. If your project uses
> CommonJS, you can import the library using require: `const { ToolboxClient }
> = require('@toolbox-sdk/adk')`;.

## Usage

The `core` package provides a framework-agnostic way to interact with your  MCP Toolbox server. For detailed guides and advanced configuration, please visit the following sections on our [Documentation Site](https://mcp-toolbox.dev/sdks/js-sdk/adk/):

- [Transport Protocols](https://mcp-toolbox.dev/sdks/js-sdk/adk/#transport-protocols)
- [Loading Tools](https://mcp-toolbox.dev/sdks/js-sdk/adk/#loading-tools)
- [Invoking Tools](https://mcp-toolbox.dev/sdks/js-sdk/adk/#invoking-tools)
- [Client to Server Authentication](https://mcp-toolbox.dev/sdks/js-sdk/adk/#client-to-server-authentication)
- [Authenticating Tools](https://mcp-toolbox.dev/sdks/js-sdk/adk/#authenticating-tools)
- [Binding Parameter Values](https://mcp-toolbox.dev/sdks/js-sdk/adk/#binding-parameter-values)

# Contributing

Contributions are welcome! Please refer to the [DEVELOPER.md](./DEVELOPER.md)
file for guidelines on how to set up a development environment and run tests.

# License

This project is licensed under the Apache License 2.0. See the
[LICENSE](https://github.com/googleapis/mcp-toolbox/blob/main/LICENSE) file for details.

# Support

If you encounter issues or have questions, check the existing [GitHub Issues](https://github.com/googleapis/mcp-toolbox/issues) for the main Toolbox project.
