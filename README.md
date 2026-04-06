![MCP Toolbox
Logo](https://raw.githubusercontent.com/googleapis/genai-toolbox/main/logo.png)

# MCP Toolbox SDKs for JS

[![License: Apache
2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Docs](https://img.shields.io/badge/Docs-MCP_Toolbox-blue)](https://mcp-toolbox.dev/)
[![Discord](https://img.shields.io/badge/Discord-%235865F2.svg?style=flat&logo=discord&logoColor=white)](https://discord.gg/Dmm69peqjh)
[![Medium](https://img.shields.io/badge/Medium-12100E?style=flat&logo=medium&logoColor=white)](https://medium.com/@mcp_toolbox)

This repository contains JavaScript SDKs for [MCP Toolbox](https://github.com/googleapis/genai-toolbox). These SDKs allow you to load and use tools defined in your MCP Toolbox server as standard JS functions or objects within your Agentic applications.

For comprehensive guides, tutorials, and advanced configuration, visit the [Main Documentation Site](https://mcp-toolbox.dev).

<!-- TOC -->

- [Available Packages](#available-packages)
- [Quick Start](#quick-start)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)

<!-- /TOC -->

## Available Packages

This repository hosts the following TS packages. Visit the [Main Documentation Site](https://mcp-toolbox.dev/sdks/js-sdk/) for detailed installation and usage instructions:

| Package | Target Use Case | Path | Documentation |
| :------ | :---------- | :--- | :---------- |
| `@toolbox-sdk/core` | Framework-agnostic / Custom apps | `packages/toolbox-core/` | [JS Core Guide](https://mcp-toolbox.dev/sdks/js-sdk/core/) |
| `@toolbox-sdk/adk` | ADK applications | `packages/toolbox-adk/` | [JS ADK Guide](https://mcp-toolbox.dev/sdks/js-sdk/adk/) |

## Quick Start

1.  **Set up the Toolbox Service**: Ensure you have a running MCP Toolbox server. Follow the [Toolbox Server Getting Started Guide](https://mcp-toolbox.dev/getting-started/introduction/#getting-started).
2.  **Install the Appropriate SDK**:
    ```bash
    # For the core, framework-agnostic SDK
    npm install @toolbox-sdk/core
    ```
    ```bash
    # For the ADK SDK
    npm install @toolbox-sdk/adk
    ```
3.  **Explore Tutorials**: Check out the [JS Quickstart Tutorial](https://mcp-toolbox.dev/getting-started/local_quickstart_js/) for a full walkthrough.
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
