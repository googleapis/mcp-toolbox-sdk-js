# Development

Below are the details to set up a development environment and run tests.

## Install

1. Clone the repository:

    ```bash
    git clone https://github.com/googleapis/mcp-toolbox-sdk-js
    ```

1. Navigate to the package directory:

    ```bash
    cd mcp-toolbox-sdk-js/packages/toolbox-core
    ```

1. Install the package

    ```bash
    npm install
    ```

1. Make code changes and contribute to the SDK's development.

## Test

1. Navigate to the package directory if needed:

    ```bash
    cd mcp-toolbox-sdk-js/packages/toolbox-core
    ```

1. Install the SDK package

    ```bash
    npm install
    ```

1. Run unit and/or integration tests.

    ```bash
    npm run test:unit
    ```

    or

    ```bash
    npm run test:e2e
    ```

1. Run linter

   ```bash
    npm run lint
    ```

    Fix common lint issues

    ```bash
    npm run fix
    ```
