# Development

This guide provides instructions for setting up your development environment to contribute to the `toolbox-core` package, which is part of the `mcp-toolbox-sdk-js` monorepo.

## Prerequisites

Before you begin, ensure you have the following installed:

* Node.js ([LTS version recommended](https://nodejs.org/en/download/))

## Setup

These steps will guide you through setting up the monorepo and this specific package for development.

1. Clone the repository:

    ```bash
    git clone https://github.com/googleapis/mcp-toolbox-sdk-js.git
    ```

2. Navigate to the **package directory**:

    ```bash
    cd mcp-toolbox-sdk-js/packages/toolbox-core
    ```

3. Install dependencies for your package:

    ```bash
    npm install
    ```

## Development Workflow

1. **Make Code Changes:**
    Implement your features or bug fixes within the `packages/toolbox-core/src` directory (or relevant source folder).

2. **Build (if applicable):**
    If this package uses TypeScript or another compilation step, you'll need to build it. Check the `package.json` for a build script.

    ```bash
    npm run build
    ```

## Testing

Ensure all tests pass before submitting your changes. Tests are typically run from within the `packages/toolbox-core` directory.

> [!IMPORTANT]
> Dependencies (including testing tools) should have been installed during the initial `npm install` at the monorepo root.

1. **Run Unit Tests:**

    ```bash
    npm run test:unit
    ```

1. **Run End-to-End (E2E) / Integration Tests:**

    ```bash
    npm run test:e2e
    ```

## Linting and Formatting

This project uses linters (e.g., ESLint) and formatters (e.g., Prettier) to maintain code quality and consistency.

1. **Run Linter:**
    Check your code for linting errors:

    ```bash
    npm run lint
    ```

2. **Fix Lint/Format Issues:**
    Automatically fix fixable linting and formatting issues:

    ```bash
    npm run fix
    ```

## Committing Changes

* **Branching:** Create a new branch for your feature or bug fix (e.g., `feature/my-new-feature` or `fix/issue-123`).
* **Commit Messages:** Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit message conventions.
* **Pre-submit checks:** On any PRs, presubmit checks like linters, unit tests
  and integration tests etc. are run. Make sure all checks are green before
  proceeding.
* **Submitting a PR:** On approval by a repo maintainer, *Squash and Merge* your PR.

## Further Information

* If you encounter issues or have questions, please open an [issue](https://github.com/googleapis/mcp-toolbox-sdk-js/issues) on the GitHub repository.
