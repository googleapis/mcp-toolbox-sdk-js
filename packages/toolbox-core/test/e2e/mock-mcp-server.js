/* global require, console */
const express = require('express');
const app = express();
app.use(express.json());

const PORT = 5001;

const tools = [
  {
    name: 'get-n-rows',
    description: 'Returns n rows',
    parameters: {
      type: 'object',
      properties: {
        num_rows: {type: 'string', description: 'n'},
      },
      required: ['num_rows'],
    },
    run: args => {
      const n = parseInt(args.num_rows);
      if (isNaN(n)) return 'error: NaN';
      return Array.from({length: n}, (_, i) => `row${i + 1}`).join(' ');
    },
  },
  {
    name: 'get-row-by-id',
    description: 'Returns row by ID',
    parameters: {
      type: 'object',
      properties: {
        id: {type: 'string', description: 'id'},
      },
      required: ['id'],
    },
    run: args => `row${args.id}`,
  },
  {
    name: 'get-row-by-id-auth',
    description: 'Returns row by ID (auth)',
    authRequired: ['my-test-auth'],
    parameters: {
      type: 'object',
      properties: {
        id: {type: 'string', description: 'id'},
      },
      required: ['id'],
    },
    run: args => `row${args.id}`,
  },
  {
    name: 'get-row-by-email-auth',
    description: 'Returns rows (auth)',
    authRequired: ['my-test-auth'],
    parameters: {
      type: 'object',
      properties: {},
    },
    run: () => 'row4 row5 row6',
  },
  {
    name: 'get-row-by-content-auth',
    description: 'Returns rows (auth)',
    authRequired: ['my-test-auth'],
    parameters: {
      type: 'object',
      properties: {},
    },
    run: () => 'row1',
  },
  {
    name: 'search-rows',
    description: 'Searches rows',
    parameters: {
      type: 'object',
      properties: {
        email: {type: 'string', description: 'email'},
        id: {type: 'integer', description: 'id'},
        data: {type: 'string', description: 'data'},
      },
      required: ['email'],
    },
    run: args => {
      const results = [];
      const email = args.email;
      const id = args.id;
      const data = args.data;

      // Mock logic matching test.e2e.ts expectations
      if (email === 'twishabansal@google.com') {
        if (data === 'row3') {
          results.push({id: 3, email, data: 'row3'});
        } else if (id === 1) {
          results.push({id: 1, email, data: 'row1'});
        } else if (id === null || id === undefined) {
          if (data === null || data === undefined) {
            results.push({id: 2, email, data: 'row2'});
          }
        }
      } else if (email === 'other@test.com') {
        // returns nothing
      }
      return JSON.stringify(results);
    },
  },
  {
    name: 'process-data',
    description: 'Processes maps',
    parameters: {
      type: 'object',
      properties: {
        execution_context: {type: 'object', description: 'ctx'},
        user_scores: {
          type: 'object',
          description: 'scores',
          additionalProperties: {type: 'integer'},
        },
        feature_flags: {
          type: 'object',
          description: 'flags',
          additionalProperties: {type: 'boolean'},
        },
      },
      required: ['execution_context', 'user_scores'],
    },
    run: args => JSON.stringify(args),
  },
];

const toolsets = {
  'my-toolset': ['get-row-by-id'],
  'my-toolset-2': ['get-n-rows', 'get-row-by-id'],
};

function handleRPC(req, res, toolsetName) {
  const {method, params, id} = req.body;

  if (method === 'initialize') {
    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params.protocolVersion,
        capabilities: {tools: {}},
        serverInfo: {name: 'mock-toolbox', version: '0.27.0'},
      },
    });
  }

  if (method === 'list_tools' || method === 'tools/list') {
    let filteredTools = tools;
    if (toolsetName) {
      if (!toolsets[toolsetName]) {
        return res.json({
          jsonrpc: '2.0',
          id,
          error: {code: -32600, message: 'toolset does not exist'},
        });
      }
      filteredTools = tools.filter(t => toolsets[toolsetName].includes(t.name));
    }
    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        tools: filteredTools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.parameters,
          authRequired: t.authRequired,
        })),
      },
    });
  }

  if (method === 'call_tool' || method === 'tools/call') {
    const toolName = params.name;
    const tool = tools.find(t => t.name === toolName);
    if (!tool) {
      return res.json({
        jsonrpc: '2.0',
        id,
        error: {code: -32601, message: 'tool not found'},
      });
    }

    // Auth check
    if (tool.authRequired) {
      const authHeader = req.headers.authorization;
      if (
        !authHeader ||
        authHeader === 'Bearer null' ||
        authHeader === 'Bearer undefined'
      ) {
        return res.json({
          jsonrpc: '2.0',
          id,
          error: {code: 401, message: 'Unauthorized'},
        });
      }
      // Simulate "insufficient claims" if token is 'invalid-token'
      if (authHeader.includes('invalid-token')) {
        return res.json({
          jsonrpc: '2.0',
          id,
          error: {code: 403, message: 'Forbidden'},
        });
      }
    }

    const result = tool.run(params.arguments || {});
    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        content: [{type: 'text', text: String(result)}],
      },
    });
  }

  res.json({
    jsonrpc: '2.0',
    id,
    error: {code: -32601, message: 'Method not found'},
  });
}

app.post('/mcp/', (req, res) => handleRPC(req, res));
app.post('/mcp/:toolset', (req, res) =>
  handleRPC(req, res, req.params.toolset),
);

app.listen(PORT, () => {
  console.log(`Mock MCP server listening on port ${PORT}`);
});
