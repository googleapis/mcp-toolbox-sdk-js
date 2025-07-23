# Development

This guide provides instructions for setting up your development environment to
contribute to the `@toolbox-sdk/core` package, which is part of the
`mcp-toolbox-sdk-js` monorepo.

## Versioning

This library adheres to [Semantic Versioning](http://semver.org/). Releases are
automated using [Release Please](https://github.com/googleapis/release-please),
which analyzes commit messages to determine version bumps.

## Processes

### Conventional Commit Messages
This repository utilizes [Conventional
Commits](https://www.conventionalcommits.org/) for structuring commit messages.
This standard is crucial for the automated release process managed by [Release
Please](https://github.com/googleapis/release-please?tab=readme-ov-file#how-should-i-write-my-commits),
which parses your Git history to create GitHub and npm releases.

## Install

Before you begin, ensure you have the following installed:

* Node.js ([LTS version recommended](https://nodejs.org/en/download/))

### Setup

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

4. Local Testing
    If you need to test changes in `@toolbox-sdk/core` against another local project
    or another package that consumes `@toolbox-sdk/core`, you can use npm link

    * In packages/toolbox-core

        ```bash
        npm link
        ```

    * In your consuming project

        ```bash
        npm link @toolbox-sdk/core
        ```  

    This creates a symbolic link, allowing changes in `@toolbox-sdk/core` to be
    immediately reflected in the consuming project without reinstallation.

    Don't forget to `npm unlink` when done!

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

#### Authentication in Local Tests
Integration tests involving authentication rely on environment variables for
`TOOLBOX_URL`, `TOOLBOX_VERSION`, and `GOOGLE_CLOUD_PROJECT`. For local runs,
you might need to mock or set up dummy authentication tokens. Refer to
[authTokenGetter](./test/e2e/test.e2e.ts#L214) for how authentication tokens (`authToken1`, `authToken2`)
are generated and used in the test environment. The `authMethods.ts` module
provides helper functions for obtaining Google ID tokens.

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
## Contribution Process

We welcome contributions to this project! Please review the following guidelines
before submitting.

### Contributor License Agreement (CLA)

Contributions to this project must be accompanied by a [Contributor License
Agreement](https://cla.developers.google.com/about) (CLA). This grants Google
permission to use and redistribute your contributions.

### Committing Changes

* **Branching:** Create a new branch for your feature or bug fix (e.g., `feature/my-new-feature` or `fix/issue-123`).
* **Commit Messages:** Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit message conventions.
* **Pre-submit checks:** On any PRs, presubmit checks like linters, unit tests
  and integration tests etc. are run. Make sure all checks are green before
  proceeding.

### Code Reviews

All submissions, including those by project members, require review. We use
[GitHub pull requests](https://help.github.com/articles/about-pull-requests/)
for this purpose.

* Ensure your pull request clearly describes the changes you are making.
* Ideally, your pull request should include code, tests, and updated
  documentation (if applicable) in a single submission.
* Code style and linting checks will run automatically. Please ensure they pass
  before requesting a review.
* A reviewer from the maintainer team will typically review your
  PR within 2-5 days and may request changes or approve it.
* On approval by a repo maintainer, *Squash and Merge* your PR.

## Releases & Pipelines

This project uses `release-please` for automated releases.

* **Release Automation:** [Release
  Please](https://github.com/googleapis/mcp-toolbox-sdk-js/blob/main/.github/release-please.yml)
  is configured to manage releases based on [Conventional
  Commits](#conventional-commit-messages). It creates release pull requests and
  tags.
* **Published Packages:** The release pipeline produces npm package(s),
  including:
    * `@toolbox-sdk/core`
  These packages are published to
    [npm](https://www.npmjs.com/).
* **Release Trigger:** Releases are typically triggered automatically based on
  merges to the `main` branch, as configured in [release-trigger.yml](https://github.com/googleapis/mcp-toolbox-sdk-js/blob/main/.github/release-trigger.yml).

## Support

If you encounter issues or have questions, please check the existing [GitHub
Issues](https://github.com/googleapis/genai-toolbox/issues) for the main Toolbox
project. If your issue is specific to one of the SDKs, please look for existing
issues [here](https://github.com/googleapis/mcp-toolbox-sdk-js/issues) or
open a new issue in this repository.

### Reporting Security Issues

For security-related concerns, please report them via
[g.co/vulnz](https://g.co/vulnz).
