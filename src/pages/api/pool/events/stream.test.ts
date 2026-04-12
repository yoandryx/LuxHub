// src/pages/api/pool/events/stream.test.ts
// Phase 11-17: Unit tests for the SSE live fee arrival endpoint.
//
// Focus: method guard, poolId validation, SSE header correctness, initial
// snapshot emission, and pool-not-found handling. The 5s poll / 20s keepalive
// intervals are not exercised here — they're trivial wrappers around the same
// findById path used by the snapshot emission, and Jest fake timers + SSE
// streams are painful to combine. The poll branch is structurally identical
// to the snapshot branch and covered by type-checking + manual verification
// per the plan's verification section.

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the handler)
// ---------------------------------------------------------------------------

const mockFindById = jest.fn();

jest.mock('@/lib/models/Pool', () => ({
  Pool: {
    findById: (...args: unknown[]) => mockFindById(...args),
  },
}));

jest.mock('@/lib/database/mongodb', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import type { NextApiRequest, NextApiResponse } from 'next';
import { EventEmitter } from 'events';
import handler from './stream';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockReq = NextApiRequest & EventEmitter;

function createMockReq(overrides: Partial<NextApiRequest> = {}): MockReq {
  const emitter = new EventEmitter() as MockReq;
  emitter.method = 'GET';
  emitter.headers = {};
  emitter.query = {};
  Object.assign(emitter, overrides);
  return emitter;
}

type MockRes = NextApiResponse & {
  _status: number;
  _headers: Record<string, string>;
  _json: any;
  _writes: string[];
  _ended: boolean;
  _flushed: boolean;
};

function createMockRes(): MockRes {
  const emitter = new EventEmitter() as unknown as MockRes;
  emitter._status = 200;
  emitter._headers = {};
  emitter._json = null;
  emitter._writes = [];
  emitter._ended = false;
  emitter._flushed = false;

  const res = emitter as any;

  res.setHeader = (name: string, value: string) => {
    emitter._headers[name.toLowerCase()] = value;
    return res;
  };
  res.getHeader = (name: string) => emitter._headers[name.toLowerCase()];
  res.status = (code: number) => {
    emitter._status = code;
    return res;
  };
  res.json = (data: any) => {
    emitter._json = data;
    return res;
  };
  res.write = (chunk: string | Buffer) => {
    emitter._writes.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    return true;
  };
  res.end = () => {
    emitter._ended = true;
    return res;
  };
  res.flushHeaders = () => {
    emitter._flushed = true;
  };

  return emitter;
}

function parseSseWrites(writes: string[]): Array<{ event?: string; data?: any }> {
  // SSE framing: "event: <name>\n" + "data: <json>\n\n"
  const joined = writes.join('');
  const parts = joined
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean);

  return parts.map((part) => {
    const lines = part.split('\n');
    let event: string | undefined;
    let dataRaw = '';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataRaw += line.slice(5).trim();
      // lines starting with ":" are comments (keepalive); ignored here
    }
    let data: any = undefined;
    if (dataRaw) {
      try {
        data = JSON.parse(dataRaw);
      } catch {
        data = dataRaw;
      }
    }
    return { event, data };
  });
}

// Drain pending microtasks + any queued promise chains.
// Chains several microtask flushes so a promise awaited inside the handler
// (db connect -> findById -> .select -> .lean) has time to settle. Uses only
// microtasks so it stays compatible with Jest fake timers.
const flushPromises = async () => {
  for (let i = 0; i < 10; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  // Ensure no stray intervals linger between tests.
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/pool/events/stream', () => {
  it('returns 405 for non-GET requests', async () => {
    const req = createMockReq({ method: 'POST' });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(405);
    expect(res._json?.error).toBe('method_not_allowed');
    expect(res._headers['allow']).toBe('GET');
    // Should not have started an SSE stream.
    expect(res._writes).toHaveLength(0);
  });

  it('returns 400 when poolId query param is missing', async () => {
    const req = createMockReq({ query: {} as any });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json?.error).toBe('invalid_pool_id');
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns 400 when poolId is an array', async () => {
    const req = createMockReq({ query: { poolId: [] as any } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json?.error).toBe('invalid_pool_id');
  });

  it('sets SSE headers and flushes them before writing', async () => {
    // Use fake timers so the 5s poll + 20s keepalive never fire during the test.
    jest.useFakeTimers();

    mockFindById.mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve({
            accumulatedFeesLamports: 0,
            accumulatedFeesLamportsPending: 0,
            tokenStatus: 'funding',
            feeClaimInFlight: false,
            lastFeeClaimAt: null,
          }),
      }),
    });

    const req = createMockReq({ query: { poolId: 'pool-abc' } });
    const res = createMockRes();

    const pending = handler(req, res);
    // Let the initial snapshot await resolve.
    await flushPromises();

    expect(res._headers['content-type']).toMatch(/text\/event-stream/);
    expect(res._headers['cache-control']).toBe('no-cache, no-transform');
    expect(res._headers['connection']).toBe('keep-alive');
    expect(res._headers['x-accel-buffering']).toBe('no');
    expect(res._flushed).toBe(true);

    // Trigger cleanup so the handler's timers are cleared.
    req.emit('close');
    await pending;

    expect(res._ended).toBe(true);
  });

  it('emits an initial snapshot event with fee + state fields', async () => {
    jest.useFakeTimers();

    mockFindById.mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve({
            accumulatedFeesLamports: 12_000_000,
            accumulatedFeesLamportsPending: 3_000_000,
            tokenStatus: 'funding',
            feeClaimInFlight: false,
            lastFeeClaimAt: new Date('2026-04-12T00:00:00Z'),
          }),
      }),
    });

    const req = createMockReq({ query: { poolId: 'pool-abc' } });
    const res = createMockRes();

    const pending = handler(req, res);
    await flushPromises();

    const events = parseSseWrites(res._writes);
    const snapshot = events.find((e) => e.event === 'snapshot');

    expect(snapshot).toBeDefined();
    expect(snapshot!.data).toMatchObject({
      accumulatedFeesLamports: 12_000_000,
      accumulatedFeesLamportsPending: 3_000_000,
      totalFeesLamports: 15_000_000,
      tokenStatus: 'funding',
      feeClaimInFlight: false,
    });
    expect(typeof snapshot!.data.ts).toBe('number');

    // Verify correct pool lookup.
    expect(mockFindById).toHaveBeenCalledWith('pool-abc');

    req.emit('close');
    await pending;
  });

  it('emits error event and closes when pool is not found', async () => {
    jest.useFakeTimers();

    mockFindById.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve(null),
      }),
    });

    const req = createMockReq({ query: { poolId: 'missing-pool' } });
    const res = createMockRes();

    await handler(req, res);
    await flushPromises();

    const events = parseSseWrites(res._writes);
    const err = events.find((e) => e.event === 'error');

    expect(err).toBeDefined();
    expect(err!.data?.error).toBe('pool_not_found');
    expect(res._ended).toBe(true);
  });

  it('emits error event but stays open on initial snapshot DB failure', async () => {
    jest.useFakeTimers();

    mockFindById.mockReturnValue({
      select: () => ({
        lean: () => Promise.reject(new Error('boom')),
      }),
    });

    const req = createMockReq({ query: { poolId: 'pool-abc' } });
    const res = createMockRes();

    const pending = handler(req, res);
    await flushPromises();

    const events = parseSseWrites(res._writes);
    const err = events.find((e) => e.event === 'error');

    expect(err).toBeDefined();
    expect(err!.data?.error).toBe('snapshot_failed');
    expect(err!.data?.message).toBe('boom');
    // Stream should stay open so the next poll tick can retry.
    expect(res._ended).toBe(false);

    req.emit('close');
    await pending;
    expect(res._ended).toBe(true);
  });

  it('cleans up intervals and ends the response on req close', async () => {
    jest.useFakeTimers();
    const clearSpy = jest.spyOn(global, 'clearInterval');

    mockFindById.mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve({
            accumulatedFeesLamports: 0,
            accumulatedFeesLamportsPending: 0,
            tokenStatus: 'funding',
          }),
      }),
    });

    const req = createMockReq({ query: { poolId: 'pool-abc' } });
    const res = createMockRes();

    const pending = handler(req, res);
    await flushPromises();

    req.emit('close');
    await pending;

    // Two intervals were registered (keepalive + poll).
    expect(clearSpy).toHaveBeenCalledTimes(2);
    expect(res._ended).toBe(true);

    clearSpy.mockRestore();
  });
});
