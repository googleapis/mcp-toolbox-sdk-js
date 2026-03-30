// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterEach,
} from '@jest/globals';

import {
  ATTR_ERROR_TYPE,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_MCP_METHOD_NAME,
  ATTR_MCP_PROTOCOL_VERSION,
  ATTR_NETWORK_PROTOCOL_NAME,
  ATTR_NETWORK_TRANSPORT,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  createOperationDurationHistogram,
  createSessionDurationHistogram,
  createTraceparentFromSpan,
  endSpan,
  extractServerInfo,
  initTelemetry,
  recordOperationDuration,
  recordSessionDuration,
  startSpan,
} from '../../src/toolbox_core/mcp/telemetry.js';
import type {
  Histogram,
  Span,
  Tracer,
  Meter,
} from '../../src/toolbox_core/mcp/telemetry.js';

let consoleWarnSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.clearAllMocks();
  consoleWarnSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// extractServerInfo
// ---------------------------------------------------------------------------

describe('extractServerInfo', () => {
  it('http url no port', () => {
    const {address, port, protocolName} = extractServerInfo(
      'http://example.com/path',
    );
    expect(address).toBe('example.com');
    expect(port).toBeNull();
    expect(protocolName).toBe('http');
  });

  it('https url with port', () => {
    const {address, port, protocolName} = extractServerInfo(
      'https://myserver.com:8443/mcp',
    );
    expect(address).toBe('myserver.com');
    expect(port).toBe(8443);
    expect(protocolName).toBe('https');
  });

  it('http url with port', () => {
    const {address, port, protocolName} = extractServerInfo(
      'http://localhost:8080',
    );
    expect(address).toBe('localhost');
    expect(port).toBe(8080);
    expect(protocolName).toBe('http');
  });

  it('falls back gracefully for invalid url', () => {
    const {protocolName} = extractServerInfo('not-a-url');
    expect(protocolName).toBe('http');
  });
});

// ---------------------------------------------------------------------------
// createOperationDurationHistogram
// ---------------------------------------------------------------------------

describe('createOperationDurationHistogram', () => {
  it('creates histogram when meter is provided', () => {
    const mockHistogram = {record: jest.fn()};
    const mockMeter = {
      createHistogram: jest
        .fn<() => typeof mockHistogram>()
        .mockReturnValue(mockHistogram),
    };
    const result = createOperationDurationHistogram(
      mockMeter as unknown as Meter,
    );
    expect(result).not.toBeNull();
    expect(mockMeter.createHistogram).toHaveBeenCalledTimes(1);
  });

  it('returns null when histogram creation throws', () => {
    const mockMeter = {
      createHistogram: jest.fn<() => never>().mockImplementation(() => {
        throw new Error('failed');
      }),
    };
    const result = createOperationDurationHistogram(
      mockMeter as unknown as Meter,
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createSessionDurationHistogram
// ---------------------------------------------------------------------------

describe('createSessionDurationHistogram', () => {
  it('creates histogram when meter is provided', () => {
    const mockHistogram = {record: jest.fn()};
    const mockMeter = {
      createHistogram: jest
        .fn<() => typeof mockHistogram>()
        .mockReturnValue(mockHistogram),
    };
    const result = createSessionDurationHistogram(
      mockMeter as unknown as Meter,
    );
    expect(result).not.toBeNull();
    expect(mockMeter.createHistogram).toHaveBeenCalledTimes(1);
  });

  it('passes explicitBucketBoundaries advice to meter.createHistogram', () => {
    const mockHistogram = {record: jest.fn()};
    const createHistogram = jest.fn().mockReturnValue(mockHistogram);
    const mockMeter = {createHistogram};

    createSessionDurationHistogram(mockMeter as unknown as Meter);

    expect(createHistogram).toHaveBeenCalledWith(
      'mcp.client.session.duration',
      expect.objectContaining({
        advice: expect.objectContaining({
          explicitBucketBoundaries: expect.any(Array),
        }),
      }),
    );
  });

  it('returns null when histogram creation throws', () => {
    const mockMeter = {
      createHistogram: jest.fn<() => never>().mockImplementation(() => {
        throw new Error('failed');
      }),
    };
    const result = createSessionDurationHistogram(
      mockMeter as unknown as Meter,
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// startSpan
// ---------------------------------------------------------------------------

describe('startSpan', () => {
  it('returns null span with empty strings when tracer is null', () => {
    const result = startSpan(
      null,
      'tools/list',
      '2025-06-18',
      'http://example.com',
    );
    expect(result.span).toBeNull();
    expect(result.traceparent).toBe('');
    expect(result.tracestate).toBe('');
  });
});

// ---------------------------------------------------------------------------
// endSpan
// ---------------------------------------------------------------------------

describe('endSpan', () => {
  it('does nothing when span is null', () => {
    expect(() => endSpan(null)).not.toThrow();
  });

  it('calls span.end() on success (no error)', () => {
    const mockSpan = {
      end: jest.fn(),
      setStatus: jest.fn(),
      setAttribute: jest.fn(),
    } as unknown as Span;
    endSpan(mockSpan);
    expect(mockSpan.end).toHaveBeenCalledTimes(1);
    expect(mockSpan.setStatus).not.toHaveBeenCalled();
  });

  it('handles exception thrown by span.end() gracefully', () => {
    const mockSpan = {
      end: jest.fn().mockImplementation(() => {
        throw new Error('end failed');
      }),
      setStatus: jest.fn(),
      setAttribute: jest.fn(),
    } as unknown as Span;
    expect(() => endSpan(mockSpan)).not.toThrow();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// recordOperationDuration
// ---------------------------------------------------------------------------

describe('recordOperationDuration', () => {
  it('does nothing when histogram is null', () => {
    expect(() =>
      recordOperationDuration(
        null,
        0.5,
        'tools/list',
        '2025-06-18',
        'http://example.com',
      ),
    ).not.toThrow();
  });

  it('records basic operation attributes', () => {
    const mockHistogram = {record: jest.fn()} as unknown as Histogram;
    recordOperationDuration(
      mockHistogram,
      0.5,
      'tools/list',
      '2025-06-18',
      'http://example.com',
    );
    expect(mockHistogram.record).toHaveBeenCalledTimes(1);

    const [duration, attrs] = (mockHistogram.record as jest.Mock).mock
      .calls[0] as [number, Record<string, unknown>];
    expect(duration).toBe(0.5);
    expect(attrs[ATTR_MCP_METHOD_NAME]).toBe('tools/list');
    expect(attrs[ATTR_MCP_PROTOCOL_VERSION]).toBe('2025-06-18');
    expect(attrs[ATTR_SERVER_ADDRESS]).toBe('example.com');
    expect(attrs[ATTR_NETWORK_PROTOCOL_NAME]).toBe('http');
  });

  it('records server port when present in url', () => {
    const mockHistogram = {record: jest.fn()} as unknown as Histogram;
    recordOperationDuration(
      mockHistogram,
      0.5,
      'tools/list',
      '2025-06-18',
      'http://example.com:9090',
    );

    const attrs = (mockHistogram.record as jest.Mock).mock
      .calls[0][1] as Record<string, unknown>;
    expect(attrs[ATTR_SERVER_PORT]).toBe(9090);
  });

  it('does not record server.port when absent from url', () => {
    const mockHistogram = {record: jest.fn()} as unknown as Histogram;
    recordOperationDuration(
      mockHistogram,
      0.5,
      'tools/list',
      '2025-06-18',
      'http://example.com',
    );

    const attrs = (mockHistogram.record as jest.Mock).mock
      .calls[0][1] as Record<string, unknown>;
    expect(attrs[ATTR_SERVER_PORT]).toBeUndefined();
  });

  it('records tool name and operation name for tools/call', () => {
    const mockHistogram = {record: jest.fn()} as unknown as Histogram;
    recordOperationDuration(
      mockHistogram,
      1.0,
      'tools/call',
      '2025-06-18',
      'http://example.com',
      'my_tool',
    );

    const attrs = (mockHistogram.record as jest.Mock).mock
      .calls[0][1] as Record<string, unknown>;
    expect(attrs[ATTR_GEN_AI_TOOL_NAME]).toBe('my_tool');
    expect(attrs[ATTR_GEN_AI_OPERATION_NAME]).toBe('execute_tool');
  });

  it('records network transport when provided', () => {
    const mockHistogram = {record: jest.fn()} as unknown as Histogram;
    recordOperationDuration(
      mockHistogram,
      0.3,
      'tools/list',
      '2025-06-18',
      'http://example.com',
      undefined,
      'tcp',
    );

    const attrs = (mockHistogram.record as jest.Mock).mock
      .calls[0][1] as Record<string, unknown>;
    expect(attrs[ATTR_NETWORK_TRANSPORT]).toBe('tcp');
  });

  it('records error type when error is provided', () => {
    const mockHistogram = {record: jest.fn()} as unknown as Histogram;
    const error = new TypeError('call failed');
    recordOperationDuration(
      mockHistogram,
      0.8,
      'tools/call',
      '2025-06-18',
      'http://example.com',
      undefined,
      undefined,
      error,
    );

    const attrs = (mockHistogram.record as jest.Mock).mock
      .calls[0][1] as Record<string, unknown>;
    expect(attrs[ATTR_ERROR_TYPE]).toBe('TypeError');
  });

  it('handles exception thrown by histogram.record() gracefully', () => {
    const mockHistogram = {
      record: jest.fn().mockImplementation(() => {
        throw new Error('record failed');
      }),
    } as unknown as Histogram;
    expect(() =>
      recordOperationDuration(
        mockHistogram,
        0.5,
        'tools/list',
        '2025-06-18',
        'http://example.com',
      ),
    ).not.toThrow();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// recordSessionDuration
// ---------------------------------------------------------------------------

describe('recordSessionDuration', () => {
  it('does nothing when histogram is null', () => {
    expect(() =>
      recordSessionDuration(null, 10.0, '2025-06-18', 'http://example.com'),
    ).not.toThrow();
  });

  it('records basic session attributes', () => {
    const mockHistogram = {record: jest.fn()} as unknown as Histogram;
    recordSessionDuration(
      mockHistogram,
      5.0,
      '2025-06-18',
      'http://example.com',
    );
    expect(mockHistogram.record).toHaveBeenCalledTimes(1);

    const [duration, attrs] = (mockHistogram.record as jest.Mock).mock
      .calls[0] as [number, Record<string, unknown>];
    expect(duration).toBe(5.0);
    expect(attrs[ATTR_MCP_PROTOCOL_VERSION]).toBe('2025-06-18');
    expect(attrs[ATTR_SERVER_ADDRESS]).toBe('example.com');
    expect(attrs[ATTR_NETWORK_PROTOCOL_NAME]).toBe('http');
  });

  it('records server port when present', () => {
    const mockHistogram = {record: jest.fn()} as unknown as Histogram;
    recordSessionDuration(
      mockHistogram,
      5.0,
      '2025-06-18',
      'http://example.com:8080',
    );

    const attrs = (mockHistogram.record as jest.Mock).mock
      .calls[0][1] as Record<string, unknown>;
    expect(attrs[ATTR_SERVER_PORT]).toBe(8080);
  });

  it('records network transport when provided', () => {
    const mockHistogram = {record: jest.fn()} as unknown as Histogram;
    recordSessionDuration(
      mockHistogram,
      5.0,
      '2025-06-18',
      'http://example.com',
      'tcp',
    );

    const attrs = (mockHistogram.record as jest.Mock).mock
      .calls[0][1] as Record<string, unknown>;
    expect(attrs[ATTR_NETWORK_TRANSPORT]).toBe('tcp');
  });

  it('records error type when error is provided', () => {
    const mockHistogram = {record: jest.fn()} as unknown as Histogram;
    const error = new RangeError('disconnected');
    recordSessionDuration(
      mockHistogram,
      2.0,
      '2025-06-18',
      'http://example.com',
      undefined,
      error,
    );

    const attrs = (mockHistogram.record as jest.Mock).mock
      .calls[0][1] as Record<string, unknown>;
    expect(attrs[ATTR_ERROR_TYPE]).toBe('RangeError');
  });

  it('handles exception thrown by histogram.record() gracefully', () => {
    const mockHistogram = {
      record: jest.fn().mockImplementation(() => {
        throw new Error('record failed');
      }),
    } as unknown as Histogram;
    expect(() =>
      recordSessionDuration(
        mockHistogram,
        5.0,
        '2025-06-18',
        'http://example.com',
      ),
    ).not.toThrow();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// OTel-available paths — requires @opentelemetry/api to be loadable.
// initTelemetry() is called once in beforeAll, setting TELEMETRY_AVAILABLE=true
// and otelApi for the rest of this describe block.
// NOTE: These tests must remain at the END of this file so the module-level
// state change does not affect the earlier tests that rely on
// TELEMETRY_AVAILABLE=false.
// ---------------------------------------------------------------------------

describe('with OTel available (after initTelemetry)', () => {
  beforeAll(async () => {
    await initTelemetry();
  });

  describe('createTraceparentFromSpan', () => {
    it('returns valid traceparent for a span with valid context', () => {
      const mockSpan = {
        spanContext: () => ({
          traceId: 'a'.repeat(32),
          spanId: 'b'.repeat(16),
          traceFlags: 1,
          traceState: {serialize: () => 'vendor=value'},
        }),
      } as unknown as Span;

      const {traceparent, tracestate} = createTraceparentFromSpan(mockSpan);

      expect(traceparent).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-[0-9a-f]{2}$/);
      expect(tracestate).toBe('vendor=value');
    });

    it('returns empty strings for an invalid span context (all-zero ids)', () => {
      const mockSpan = {
        spanContext: () => ({
          traceId: '0'.repeat(32),
          spanId: '0'.repeat(16),
          traceFlags: 0,
        }),
      } as unknown as Span;

      const {traceparent, tracestate} = createTraceparentFromSpan(mockSpan);

      expect(traceparent).toBe('');
      expect(tracestate).toBe('');
    });
  });

  describe('startSpan (OTel installed)', () => {
    it('creates a span and returns a traceparent when tracer is provided', () => {
      const mockSpan = {
        setAttribute: jest.fn(),
        end: jest.fn(),
        spanContext: () => ({
          traceId: 'a'.repeat(32),
          spanId: 'b'.repeat(16),
          traceFlags: 1,
          traceState: {serialize: () => ''},
        }),
      };
      const mockTracer = {
        startSpan: jest.fn(() => mockSpan),
      } as unknown as Tracer;

      const {span, traceparent} = startSpan(
        mockTracer,
        'tools/call',
        '2025-06-18',
        'http://example.com:8080',
        'myTool',
        'tcp',
      );

      expect(span).not.toBeNull();
      expect(traceparent).not.toBe('');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        ATTR_GEN_AI_OPERATION_NAME,
        'execute_tool',
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        ATTR_SERVER_PORT,
        8080,
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        ATTR_NETWORK_TRANSPORT,
        'tcp',
      );
    });

    it('returns null span and warns when tracer.startSpan throws', () => {
      const mockTracer = {
        startSpan: jest.fn(() => {
          throw new Error('tracer error');
        }),
      } as unknown as Tracer;

      const {span, traceparent, tracestate} = startSpan(
        mockTracer,
        'tools/list',
        '2025-06-18',
        'http://example.com',
      );

      expect(span).toBeNull();
      expect(traceparent).toBe('');
      expect(tracestate).toBe('');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('endSpan with error (OTel installed)', () => {
    it('sets error status and records error type when error is provided', () => {
      const mockSpan = {
        end: jest.fn(),
        setStatus: jest.fn(),
        setAttribute: jest.fn(),
      } as unknown as Span;

      endSpan(mockSpan, new TypeError('something failed'));

      expect(mockSpan.setStatus).toHaveBeenCalledWith(
        expect.objectContaining({message: 'something failed'}),
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        ATTR_ERROR_TYPE,
        'TypeError',
      );
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });
});
