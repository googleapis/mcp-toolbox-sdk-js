// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * OpenTelemetry telemetry utilities for MCP protocol.
 *
 * This module implements telemetry following the MCP Semantic Conventions:
 * https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp
 *
 * Note: OpenTelemetry is an optional peer dependency. Install with:
 *   npm install @opentelemetry/api
 */

let otelApi: typeof import('@opentelemetry/api') | null = null;

export interface TelemetryState {
  enabled: boolean;
  tracer: Tracer | null;
  operationDurationHistogram: Histogram | null;
  sessionDurationHistogram: Histogram | null;
}

const NULL_STATE: TelemetryState = {
  enabled: false,
  tracer: null,
  operationDurationHistogram: null,
  sessionDurationHistogram: null,
};

/**
 * Initialise telemetry asynchronously. Dynamically imports
 * \`@opentelemetry/api\`, creates a tracer + meter + histograms, and returns
 * them as a single TelemetryState. Returns all-null state when OTel is not
 * installed or \`enabled\` is false.
 *
 * Must be awaited (via ensureInitialized) before any span/metric helpers are
 * called.
 */
export async function initTelemetry(
  name = 'toolbox.mcp.sdk',
  version?: string,
): Promise<TelemetryState> {
  try {
    otelApi = await import('@opentelemetry/api');
  } catch {
    return NULL_STATE;
  }

  const tracer = otelApi.trace.getTracer(name, version);
  const meter = otelApi.metrics.getMeter(name, version ?? '');
  return {
    enabled: true,
    tracer,
    operationDurationHistogram: createOperationDurationHistogram(meter),
    sessionDurationHistogram: createSessionDurationHistogram(meter),
  };
}

export type Tracer = import('@opentelemetry/api').Tracer;
export type Meter = import('@opentelemetry/api').Meter;
export type Histogram = import('@opentelemetry/api').Histogram;
export type Span = import('@opentelemetry/api').Span;

// ---------------------------------------------------------------------------
// MCP Semantic Convention attribute names
// https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp
// ---------------------------------------------------------------------------

export const ATTR_MCP_METHOD_NAME = 'mcp.method.name';
export const ATTR_MCP_PROTOCOL_VERSION = 'mcp.protocol.version';
export const ATTR_MCP_SESSION_ID = 'mcp.session.id';
export const ATTR_ERROR_TYPE = 'error.type';
export const ATTR_GEN_AI_TOOL_NAME = 'gen_ai.tool.name';
export const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name';
export const ATTR_SERVER_ADDRESS = 'server.address';
export const ATTR_SERVER_PORT = 'server.port';
export const ATTR_NETWORK_TRANSPORT = 'network.transport';
export const ATTR_NETWORK_PROTOCOL_NAME = 'network.protocol.name';

// Metric names following MCP semantic conventions
export const METRIC_CLIENT_OPERATION_DURATION = 'mcp.client.operation.duration';
export const METRIC_CLIENT_SESSION_DURATION = 'mcp.client.session.duration';

// Histogram bucket boundaries for MCP metrics (in seconds)
// https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/#metrics
export const MCP_DURATION_BUCKETS = [
  0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60, 120, 300,
];

/**
 * Create histogram for MCP client operation duration.
 */
export function createOperationDurationHistogram(
  meter: Meter,
): Histogram | null {
  try {
    return meter.createHistogram(METRIC_CLIENT_OPERATION_DURATION, {
      unit: 's',
      description:
        'Duration of MCP client operations (requests/notifications) from the time it was sent until the response or ack is received.',
      advice: {explicitBucketBoundaries: MCP_DURATION_BUCKETS},
    });
  } catch {
    return null;
  }
}

/**
 * Create histogram for MCP client session duration.
 */
export function createSessionDurationHistogram(meter: Meter): Histogram | null {
  try {
    return meter.createHistogram(METRIC_CLIENT_SESSION_DURATION, {
      unit: 's',
      description: 'Total duration of MCP client sessions',
      advice: {explicitBucketBoundaries: MCP_DURATION_BUCKETS},
    });
  } catch {
    return null;
  }
}

/**
 * Extract server address, port, and protocol name from a URL string.
 */
export function extractServerInfo(url: string): {
  address: string;
  port: number | null;
  protocolName: string;
} {
  try {
    const parsed = new URL(url);
    const protocolName = parsed.protocol.replace(/:$/, '') || 'http';
    const address = parsed.hostname || parsed.host;
    const port = parsed.port ? parseInt(parsed.port, 10) : null;
    return {address, port, protocolName};
  } catch {
    return {address: url, port: null, protocolName: 'http'};
  }
}

/**
 * Extract W3C traceparent and tracestate directly from a span's context.
 *
 * @returns {traceparent, tracestate} — empty strings on failure or invalid context.
 */
export function createTraceparentFromSpan(span: Span): {
  traceparent: string;
  tracestate: string;
} {
  if (!otelApi) return {traceparent: '', tracestate: ''};
  try {
    const spanCtx = span.spanContext();
    if (!otelApi.trace.isSpanContextValid(spanCtx)) {
      return {traceparent: '', tracestate: ''};
    }
    const flags = spanCtx.traceFlags.toString(16).padStart(2, '0');
    const traceparent = `00-${spanCtx.traceId}-${spanCtx.spanId}-${flags}`;
    const tracestate = spanCtx.traceState?.serialize() ?? '';
    return {traceparent, tracestate};
  } catch {
    return {traceparent: '', tracestate: ''};
  }
}

/**
 * Start a telemetry span for an MCP operation and extract W3C propagation
 * headers so they can be forwarded to the server.
 *
 * The span is briefly activated to extract traceparent/tracestate, then
 * deactivated. Call endSpan() to finish it.
 *
 * @returns {span, traceparent, tracestate} — span is null on failure.
 */
export function startSpan(
  tracer: Tracer | null,
  methodName: string,
  protocolVersion: string,
  serverUrl: string,
  toolName?: string,
  networkTransport?: string,
): {span: Span | null; traceparent: string; tracestate: string} {
  if (!tracer || !otelApi) return {span: null, traceparent: '', tracestate: ''};

  let span: Span | null = null;
  try {
    const spanName = toolName ? `${methodName} ${toolName}` : methodName;
    span = tracer.startSpan(spanName, {
      kind: otelApi.SpanKind.CLIENT,
    });

    // Set required attributes
    span.setAttribute(ATTR_MCP_METHOD_NAME, methodName);
    span.setAttribute(ATTR_MCP_PROTOCOL_VERSION, protocolVersion);

    const {address, port, protocolName} = extractServerInfo(serverUrl);
    span.setAttribute(ATTR_SERVER_ADDRESS, address);
    span.setAttribute(ATTR_NETWORK_PROTOCOL_NAME, protocolName);
    if (port !== null) {
      span.setAttribute(ATTR_SERVER_PORT, port);
    }

    if (networkTransport) {
      span.setAttribute(ATTR_NETWORK_TRANSPORT, networkTransport);
    }

    if (toolName) {
      span.setAttribute(ATTR_GEN_AI_TOOL_NAME, toolName);
    }
    if (methodName === 'tools/call') {
      span.setAttribute(ATTR_GEN_AI_OPERATION_NAME, 'execute_tool');
    }

    // Extract W3C traceparent/tracestate to propagate context to the server.
    // https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/#context-propagation
    const {traceparent, tracestate} = createTraceparentFromSpan(span);

    return {span, traceparent, tracestate};
  } catch (e) {
    console.warn('startSpan failed:', e);
    if (span !== null) {
      span.end();
    }
    return {span: null, traceparent: '', tracestate: ''};
  }
}

/**
 * End a telemetry span. Safe to call with a null span.
 */
export function endSpan(span: Span | null, error?: Error): void {
  if (!span) return;
  try {
    if (error) {
      if (otelApi) {
        span.setStatus({
          code: otelApi.SpanStatusCode.ERROR,
          message: error.message,
        });
      }
      span.setAttribute(ATTR_ERROR_TYPE, error.constructor.name);
    }
    span.end();
  } catch (e) {
    console.warn('endSpan failed:', e);
  }
}

/**
 * Record MCP client operation duration metric.
 */
export function recordOperationDuration(
  histogram: Histogram | null,
  durationSeconds: number,
  methodName: string,
  protocolVersion: string,
  serverUrl: string,
  toolName?: string,
  networkTransport?: string,
  error?: Error,
): void {
  if (!histogram) return;
  try {
    const {address, port, protocolName} = extractServerInfo(serverUrl);
    const attributes: Record<string, string | number> = {
      [ATTR_MCP_METHOD_NAME]: methodName,
      [ATTR_MCP_PROTOCOL_VERSION]: protocolVersion,
      [ATTR_SERVER_ADDRESS]: address,
      [ATTR_NETWORK_PROTOCOL_NAME]: protocolName,
    };

    if (port !== null) {
      attributes[ATTR_SERVER_PORT] = port;
    }
    if (networkTransport) {
      attributes[ATTR_NETWORK_TRANSPORT] = networkTransport;
    }
    if (toolName) {
      attributes[ATTR_GEN_AI_TOOL_NAME] = toolName;
    }
    if (methodName === 'tools/call') {
      attributes[ATTR_GEN_AI_OPERATION_NAME] = 'execute_tool';
    }
    if (error) {
      attributes[ATTR_ERROR_TYPE] = error.constructor.name;
    }

    histogram.record(durationSeconds, attributes);
  } catch (e) {
    console.warn('recordOperationDuration failed:', e);
  }
}

/**
 * Record MCP client session duration metric.
 */
export function recordSessionDuration(
  histogram: Histogram | null,
  durationSeconds: number,
  protocolVersion: string,
  serverUrl: string,
  networkTransport?: string,
  error?: Error,
): void {
  if (!histogram) return;
  try {
    const {address, port, protocolName} = extractServerInfo(serverUrl);
    const attributes: Record<string, string | number> = {
      [ATTR_MCP_PROTOCOL_VERSION]: protocolVersion,
      [ATTR_SERVER_ADDRESS]: address,
      [ATTR_NETWORK_PROTOCOL_NAME]: protocolName,
    };

    if (port !== null) {
      attributes[ATTR_SERVER_PORT] = port;
    }
    if (networkTransport) {
      attributes[ATTR_NETWORK_TRANSPORT] = networkTransport;
    }
    if (error) {
      attributes[ATTR_ERROR_TYPE] = error.constructor.name;
    }

    histogram.record(durationSeconds, attributes);
  } catch (e) {
    console.warn('recordSessionDuration failed:', e);
  }
}
