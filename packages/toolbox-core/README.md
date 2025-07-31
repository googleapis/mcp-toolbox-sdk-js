![MCP Toolbox Logo](https://raw.githubusercontent.com/googleapis/genai-toolbox/main/logo.png)

# MCP Toolbox SDKs for Javascript

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

This SDK allows you to seamlessly integrate the functionalities of
[Toolbox](https://github.com/googleapis/genai-toolbox) allowing you to load and
use tools defined in the service as standard JS functions within your GenAI
applications.

This simplifies integrating external functionalities (like APIs, databases, or
custom logic) managed by the Toolbox into your workflows, especially those
involving Large Language Models (LLMs).

<!-- TOC ignore:true -->
- [Supported Environments](#supported-environments)
- [Installation](#installation)
- [Quickstart](#quickstart)
- [Usage](#usage)
- [Loading Tools](#loading-tools)
  - [Load a toolset](#load-a-toolset)
  - [Load a single tool](#load-a-single-tool)
- [Invoking Tools](#invoking-tools)
- [Client to Server Authentication](#client-to-server-authentication)
  - [When is Client-to-Server Authentication Needed?](#when-is-client-to-server-authentication-needed)
  - [How it works](#how-it-works)
  - [Configuration](#configuration)
  - [Authenticating with Google Cloud Servers](#authenticating-with-google-cloud-servers)
  - [Step by Step Guide for Cloud Run](#step-by-step-guide-for-cloud-run)
- [Authenticating Tools](#authenticating-tools)
  - [When is Authentication Needed?](#when-is-authentication-needed)
  - [Supported Authentication Mechanisms](#supported-authentication-mechanisms)
  - [Step 1: Configure Tools in Toolbox Service](#step-1-configure-tools-in-toolbox-service)
  - [Step 2: Configure SDK Client](#step-2-configure-sdk-client)
    - [Provide an ID Token Retriever Function](#provide-an-id-token-retriever-function)
    - [Option A: Add Authentication to a Loaded Tool](#option-a-add-authentication-to-a-loaded-tool)
    - [Option B: Add Authentication While Loading Tools](#option-b-add-authentication-while-loading-tools)
  - [Complete Authentication Example](#complete-authentication-example)
- [Binding Parameter Values](#binding-parameter-values)
  - [Why Bind Parameters?](#why-bind-parameters)
  - [Option A: Binding Parameters to a Loaded Tool](#option-a-binding-parameters-to-a-loaded-tool)
  - [Option B: Binding Parameters While Loading Tools](#option-b-binding-parameters-while-loading-tools)
  - [Binding Dynamic Values](#binding-dynamic-values)
- [Using with Orchestration Frameworks](#using-with-orchestration-frameworks)
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
npm install @toolbox-sdk/core
```

## Quickstart

Here's a minimal example to get you started. Ensure your Toolbox service is running and accessible.

```javascript

import { ToolboxClient } from '@toolbox-sdk/core';  
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
> = require('@toolbox-sdk/core')`;.

## Usage

Import and initialize a Toolbox client, pointing it to the URL of your running
Toolbox service.

```javascript
import { ToolboxClient } from '@toolbox-sdk/core';

// Replace with the actual URL where your Toolbox service is running
const URL = 'http://127.0.0.1:5000';

let client = new ToolboxClient(URL);
const tools = await client.loadToolset();

// Use the client and tools as per requirement
```

All interactions for loading and invoking tools happen through this client.
> [!IMPORTANT]
> Closing the `ToolboxClient` also closes the underlying network session shared by
> all tools loaded from that client. As a result, any tool instances you have
> loaded will cease to function and will raise an error if you attempt to invoke
> them after the client is closed.

> [!NOTE]
> For advanced use cases, you can provide an external `AxiosInstance`
> during initialization (e.g., `ToolboxClient(url, my_session)`).

## Loading Tools

You can load tools individually or in groups (toolsets) as defined in your
Toolbox service configuration. Loading a toolset is convenient when working with
multiple related functions, while loading a single tool offers more granular
control.

### Load a toolset

A toolset is a collection of related tools. You can load all tools in a toolset
or a specific one:

```javascript
// Load all tools
const tools = await toolbox.loadToolset()

// Load a specific toolset
const tools = await toolbox.loadToolset("my-toolset")
```

### Load a single tool

Loads a specific tool by its unique name. This provides fine-grained control.

```javascript
const tool = await toolbox.loadTool("my-tool")
```

## Invoking Tools

Once loaded, tools behave like awaitable JS functions. You invoke them using
`await` and pass arguments corresponding to the parameters defined in the tool's
configuration within the Toolbox service.

```javascript
const tool = await toolbox.loadTool("my-tool")
const result = await tool({a: 5, b: 2})
```

> [!TIP]
> For a more comprehensive guide on setting up the Toolbox service itself, which
> you'll need running to use this SDK, please refer to the [Toolbox Quickstart
> Guide](https://googleapis.github.io/genai-toolbox/getting-started/local_quickstart).

## Client to Server Authentication

This section describes how to authenticate the ToolboxClient itself when
connecting to a Toolbox server instance that requires authentication. This is
crucial for securing your Toolbox server endpoint, especially when deployed on
platforms like Cloud Run, GKE,  or any environment where unauthenticated access is restricted.

This client-to-server authentication ensures that the Toolbox server can verify
the identity of the client making the request before any tool is loaded or
called. It is different from [Authenticating Tools](#authenticating-tools),
which deals with providing credentials for specific tools within an already
connected Toolbox session.

### When is Client-to-Server Authentication Needed?

You'll need this type of authentication if your Toolbox server is configured to
deny unauthenticated requests. For example:

- Your Toolbox server is deployed on Cloud Run and configured to "Require authentication."
- Your server is behind an Identity-Aware Proxy (IAP) or a similar
  authentication layer.
- You have custom authentication middleware on your self-hosted Toolbox server.

Without proper client authentication in these scenarios, attempts to connect or
make calls (like `load_tool`) will likely fail with `Unauthorized` errors.

### How it works

The `ToolboxClient` allows you to specify functions that dynamically generate
HTTP headers for every request sent to the Toolbox server. The most common use
case is to add an [Authorization
header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Authorization)
with a bearer token (e.g., a Google ID token).

These header-generating functions are called just before each request, ensuring
that fresh credentials or header values can be used.

### Configuration

You can configure these dynamic headers as seen below:

```javascript
import { ToolboxClient } from '@toolbox-sdk/core';
import {getGoogleIdToken} from '@toolbox-sdk/core/auth'

const URL = 'http://127.0.0.1:5000';
const getGoogleIdTokenGetter = () => getGoogleIdToken(URL);
const client = new ToolboxClient(URL, null, {"Authorization": getGoogleIdTokenGetter});

// Use the client as usual
```

### Authenticating with Google Cloud Servers

For Toolbox servers hosted on Google Cloud (e.g., Cloud Run) and requiring
`Google ID token` authentication, the helper module
[auth_methods](src/toolbox_core/authMethods.ts) provides utility functions.

### Step by Step Guide for Cloud Run

1. **Configure Permissions**: [Grant](https://cloud.google.com/run/docs/securing/managing-access#service-add-principals) the `roles/run.invoker` IAM role on the Cloud
   Run service to the principal. This could be your `user account email` or a
   `service account`.
2. **Configure Credentials**
    - Local Development: Set up
   [ADC](https://cloud.google.com/docs/authentication/set-up-adc-local-dev-environment).
    - Google Cloud Environments: When running within Google Cloud (e.g., Compute
      Engine, GKE, another Cloud Run service, Cloud Functions), ADC is typically
      configured automatically, using the environment's default service account.
3. **Connect to the Toolbox Server**

    ```javascript
    import { ToolboxClient } from '@toolbox-sdk/core';
    import {getGoogleIdToken} from '@toolbox-sdk/core/auth'

    const URL = 'http://127.0.0.1:5000';
    const getGoogleIdTokenGetter = () => getGoogleIdToken(URL);
    const client = new ToolboxClient(URL, null, {"Authorization": getGoogleIdTokenGetter});

    // Use the client as usual
    ```

## Authenticating Tools

> [!WARNING]
> **Always use HTTPS** to connect your application with the Toolbox service,
> especially in **production environments** or whenever the communication
> involves **sensitive data** (including scenarios where tools require
> authentication tokens). Using plain HTTP lacks encryption and exposes your
> application and data to significant security risks, such as eavesdropping and
> tampering.

Tools can be configured within the Toolbox service to require authentication,
ensuring only authorized users or applications can invoke them, especially when
accessing sensitive data.

### When is Authentication Needed?

Authentication is configured per-tool within the Toolbox service itself. If a
tool you intend to use is marked as requiring authentication in the service, you
must configure the SDK client to provide the necessary credentials (currently
Oauth2 tokens) when invoking that specific tool.

### Supported Authentication Mechanisms

The Toolbox service enables secure tool usage through **Authenticated Parameters**. For detailed information on how these mechanisms work within the Toolbox service and how to configure them, please refer to [Toolbox Service Documentation - Authenticated Parameters](https://googleapis.github.io/genai-toolbox/resources/tools/#authenticated-parameters)

### Step 1: Configure Tools in Toolbox Service

First, ensure the target tool(s) are configured correctly in the Toolbox service
to require authentication. Refer to the [Toolbox Service Documentation -
Authenticated
Parameters](https://googleapis.github.io/genai-toolbox/resources/tools/#authenticated-parameters)
for instructions.

### Step 2: Configure SDK Client

Your application needs a way to obtain the required Oauth2 token for the
authenticated user. The SDK requires you to provide a function capable of
retrieving this token *when the tool is invoked*.

#### Provide an ID Token Retriever Function

You must provide the SDK with a function (sync or async) that returns the
necessary token when called. The implementation depends on your application's
authentication flow (e.g., retrieving a stored token, initiating an OAuth flow).

> [!IMPORTANT]
> The name used when registering the getter function with the SDK (e.g.,
> `"my_api_token"`) must exactly match the `name` of the corresponding
> `authServices` defined in the tool's configuration within the Toolbox service.

```javascript

async function getAuthToken() {
    // ... Logic to retrieve ID token (e.g., from local storage, OAuth flow)
    // This example just returns a placeholder. Replace with your actual token retrieval.
    return "YOUR_ID_TOKEN" // Placeholder
}    
```

> [!TIP]
> Your token retriever function is invoked every time an authenticated parameter
> requires a token for a tool call. Consider implementing caching logic within
> this function to avoid redundant token fetching or generation, especially for
> tokens with longer validity periods or if the retrieval process is
> resource-intensive.

#### Option A: Add Authentication to a Loaded Tool

You can add the token retriever function to a tool object *after* it has been
loaded. This modifies the specific tool instance.

```javascript
const URL = 'http://127.0.0.1:5000';
let client = new ToolboxClient(URL);
let tool = await client.loadTool("my-tool")

const authTool = tool.addAuthTokenGetter("my_auth", get_auth_token)  // Single token

// OR

const multiAuthTool = tool.addAuthTokenGetters({
    "my_auth_1": getAuthToken1,
    "my_auth_2": getAuthToken2,
})  // Multiple tokens
```

#### Option B: Add Authentication While Loading Tools

You can provide the token retriever(s) directly during the `loadTool` or
`loadToolset` calls. This applies the authentication configuration only to the
tools loaded in that specific call, without modifying the original tool objects
if they were loaded previously.

```javascript
const authTool = await toolbox.loadTool("toolName", {"myAuth": getAuthToken})

// OR

const authTools = await toolbox.loadToolset({"myAuth": getAuthToken})
```

> [!NOTE]
> Adding auth tokens during loading only affect the tools loaded within that
> call.

### Complete Authentication Example

```javascript
import { ToolboxClient } from '@toolbox-sdk/core';

async function getAuthToken() {
    // ... Logic to retrieve ID token (e.g., from local storage, OAuth flow)
    // This example just returns a placeholder. Replace with your actual token retrieval.
    return "YOUR_ID_TOKEN" // Placeholder
}

const URL = 'http://127.0.0.1:5000';
let client = new ToolboxClient(URL);
const tool = await client.loadTool("my-tool");
const authTool = tool.addAuthTokenGetters({"my_auth": getAuthToken});
const result = await authTool({input:"some input"});
console.log(result);
```

## Binding Parameter Values

The SDK allows you to pre-set, or "bind", values for specific tool parameters
before the tool is invoked or even passed to an LLM. These bound values are
fixed and will not be requested or modified by the LLM during tool use.

### Why Bind Parameters?

- **Protecting sensitive information:**  API keys, secrets, etc.
- **Enforcing consistency:** Ensuring specific values for certain parameters.
- **Pre-filling known data:**  Providing defaults or context.

> [!IMPORTANT]
> The parameter names used for binding (e.g., `"api_key"`) must exactly match the
> parameter names defined in the tool's configuration within the Toolbox
> service.

> [!NOTE]
> You do not need to modify the tool's configuration in the Toolbox service to
> bind parameter values using the SDK.

### Option A: Binding Parameters to a Loaded Tool

Bind values to a tool object *after* it has been loaded. This modifies the
specific tool instance.

```javascript

import { ToolboxClient } from '@toolbox-sdk/core';

const URL = 'http://127.0.0.1:5000';
let client = new ToolboxClient(URL);
const tool = await client.loadTool("my-tool");

const boundTool = tool.bindParam("param", "value");

// OR

const boundTool = tool.bindParams({"param": "value"});
```

### Option B: Binding Parameters While Loading Tools

Specify bound parameters directly when loading tools. This applies the binding
only to the tools loaded in that specific call.

```javascript
const boundTool = await client.loadTool("my-tool", null, {"param": "value"})

// OR

const boundTools = await client.loadToolset(null, {"param": "value"})
```

> [!NOTE]
> Bound values during loading only affect the tools loaded in that call.

### Binding Dynamic Values

Instead of a static value, you can bind a parameter to a synchronous or
asynchronous function. This function will be called *each time* the tool is
invoked to dynamically determine the parameter's value at runtime.

```javascript

async function getDynamicValue() {
    // Logic to determine the value
    return "dynamicValue";
}

const dynamicBoundTool = tool.bindParam("param", getDynamicValue)
```

> [!IMPORTANT]
> You don't need to modify tool configurations to bind parameter values.

# Using with Orchestration Frameworks

<details open>

<summary>Langchain</summary>

[LangchainJS](https://js.langchain.com/docs/introduction/)

```javascript
import {ToolboxClient} from "@toolbox-sdk/core"
import { tool } from "@langchain/core/tools";

let client = ToolboxClient(URL)
multiplyTool = await client.loadTool("multiply")

const multiplyNumbers = tool(multiplyTool, {
    name: multiplyTool.getName(),
    description: multiplyTool.getDescription(),
    schema: multiplyTool.getParamSchema()
});

await multiplyNumbers.invoke({ a: 2, b: 3 });
```

The `multiplyNumbers` tool is compatible with [Langchain/Langraph
agents](http://js.langchain.com/docs/concepts/agents/)
such as [React
Agents](https://langchain-ai.github.io/langgraphjs/reference/functions/langgraph_prebuilt.createReactAgent.html).

</details>

<details>

<summary>LlamaIndex</summary>

[LlamaindexTS](https://ts.llamaindex.ai/)

```javascript
import {ToolboxClient} from "@toolbox-sdk/core"
import { tool } from "llamaindex";

let client = ToolboxClient(URL)
multiplyTool = await client.loadTool("multiply")

const multiplyNumbers = tool({
    name: multiplyTool.getName(),
    description: multiplyTool.getDescription(),
    parameters: multiplyTool.getParamSchema(),
    execute: mutliplyTool
});

await multiplyNumbers.call({ a: 2, b: 3 });
```

The `multiplyNumbers` tool is compatible with LlamaIndex
[agents](https://ts.llamaindex.ai/docs/llamaindex/migration/deprecated/agent)
and [agent
workflows](https://ts.llamaindex.ai/docs/llamaindex/modules/agents/agent_workflow).

</details>

<details>

<summary>Genkit</summary>

[GenkitJS](https://genkit.dev/docs/get-started/#_top)
```javascript
import {ToolboxClient} from "@toolbox-sdk/core"
import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';


let client = ToolboxClient(URL)
multiplyTool = await client.loadTool("multiply")

const ai = genkit({
  plugins: [googleAI()],
  model: googleAI.model('gemini-1.5-pro'),
});

const multiplyNumbers = ai.defineTool({
    name: multiplyTool.getName(),
    description: multiplyTool.getDescription(),
    inputSchema: multiplyTool.getParamSchema(),
  },
  multiplyTool,
);

await ai.generate({
  prompt: 'Can you multiply 5 and 7?',
  tools: [multiplyNumbers],
});
```

</details>

# Contributing

Contributions are welcome! Please refer to the [DEVELOPER.md](./DEVELOPER.md)
file for guidelines on how to set up a development environment and run tests.

# License

This project is licensed under the Apache License 2.0. See the
[LICENSE](https://github.com/googleapis/genai-toolbox/blob/main/LICENSE) file for details.

# Support

If you encounter issues or have questions, check the existing [GitHub Issues](https://github.com/googleapis/genai-toolbox/issues) for the main Toolbox project.
