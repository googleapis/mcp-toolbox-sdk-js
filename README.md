![MCP Toolbox
Logo](https://raw.githubusercontent.com/googleapis/genai-toolbox/main/logo.png)

# MCP Toolbox SDKs for JS

[![License: Apache
2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Docs](https://img.shields.io/badge/Docs-MCP_Toolbox-blue)](https://googleapis.github.io/genai-toolbox/)
[![Discord](https://img.shields.io/badge/Discord-%235865F2.svg?style=flat&logo=discord&logoColor=white)](https://discord.gg/Dmm69peqjh)
[![Medium](https://img.shields.io/badge/Medium-12100E?style=flat&logo=medium&logoColor=white)](https://medium.com/@mcp_toolbox)

This repository contains JS SDKs designed to seamlessly integrate the
functionalities of the [MCP
Toolbox](https://github.com/googleapis/genai-toolbox) into your Gen AI
applications. These SDKs allow you to load tools defined in Toolbox and use them
as standard JS functions or objects within popular orchestration frameworks
or your custom code.

This simplifies the process of incorporating external functionalities (like
Databases or APIs) managed by Toolbox into your GenAI applications.

<!-- TOC -->

- [Overview](#overview)
- [Which Package Should I Use?](#which-package-should-i-use)
- [Available Packages](#available-packages)
- [Getting Started](#getting-started)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)

<!-- /TOC -->

## Overview

The MCP Toolbox service provides a centralized way to manage and expose tools
(like API connectors, database query tools, etc.) for use by GenAI applications.

These JS SDKs act as clients for that service. They handle the communication needed to:

* Fetch tool definitions from your running Toolbox instance.
* Provide convenient JS objects or functions representing those tools.
* Invoke the tools (calling the underlying APIs/services configured in Toolbox).
* Handle authentication and parameter binding as needed.

By using these SDKs, you can easily leverage your Toolbox-managed tools directly
within your JS applications or AI orchestration frameworks.

## Which Package Should I Use?

Choosing the right package depends on how you are building your application:

- [`@toolbox-sdk/core`](https://github.com/googleapis/mcp-toolbox-sdk-js/tree/main/packages/toolbox-core):
  This is a framework agnostic way to connect the tools to popular frameworks
  like Langchain, LlamaIndex and Genkit.

## Available Packages

This repository hosts the following TS packages. See the package-specific
README for detailed installation and usage instructions:

| Package | Target Use Case | Integration | Path | Details (README) | Npm Version |
| :------ | :---------- | :---------- | :---------------------- | :---------- | :--------- 
| `toolbox-core` | Framework-agnostic / Custom applications | Use directly / Custom | `packages/toolbox-core/` | 📄 [View README](https://github.com/googleapis/mcp-toolbox-sdk-js/blob/main/packages/toolbox-core/README.md) | ![npm](https://img.shields.io/npm/v/@toolbox-sdk/core) |

## Getting Started

To get started using Toolbox tools with an application, follow these general steps:

1. **Set up and Run the Toolbox Service:**

    Before using the SDKs, you need the main MCP Toolbox service running. Follow
    the instructions here: [**Toolbox Getting Started
    Guide**](https://github.com/googleapis/genai-toolbox?tab=readme-ov-file#getting-started)

2. **Install the Appropriate SDK:**

    Choose the package based on your needs (see "[Which Package Should I Use?](#which-package-should-i-use)" above) and install it:

    ```bash
    # For the core, framework-agnostic SDK
    npm install @toolbox-sdk/core
    ```

3. **Use the SDK:**

    Consult the README for your chosen package (linked in the "[Available
    Packages](#available-packages)" section above) for detailed instructions on
    how to connect the client, load tool definitions, invoke tools, configure
    authentication/binding, and integrate them into your application or
    framework.

## Contributing

Contributions are welcome! Please refer to the
[`CONTRIBUTING.md`](https://github.com/googleapis/mcp-toolbox-sdk-js/blob/main/CONTRIBUTING.md)
to get started.

## License

This project is licensed under the Apache License 2.0. See the
[LICENSE](https://github.com/googleapis/mcp-toolbox-sdk-js/blob/main/LICENSE) file
for details.

## Support

If you encounter issues or have questions, please check the existing [GitHub
Issues](https://github.com/googleapis/genai-toolbox/issues) for the main Toolbox
project. If your issue is specific to one of the SDKs, please look for existing
issues [here](https://github.com/googleapis/mcp-toolbox-sdk-js/issues) or
open a new issue in this repository.
