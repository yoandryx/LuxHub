// src/pages/api/pool/events/stream.ts
// Phase 11-17: Server-Sent Events (SSE) endpoint for live pool fee arrival events.
//
// Streams snapshot + incremental updates of:
//   - accumulatedFeesLamports (AUTHORITATIVE, claim-driven)
//   - accumulatedFeesLamportsPending (pending fee estimate)
//   - tokenStatus (lifecycle state)
//
// Polls MongoDB every 5s and emits events only on change. Keepalive ping every 20s.
//
// Route convention: /api/pool/events/stream?poolId=<id> (singular "pool" matches
// existing pages-router pool endpoints like /api/pool/[id], /api/pool/confirm-custody).
//
// Note on Vercel serverless: Pro tier serverless functions terminate after ~60s,
// so the SSE connection is ended by the platform roughly every minute. The browser's
// EventSource automatically reconnects, so the client UX is a brief gap per minute.
// Acceptable for Feature 8 polish. True long-lived SSE would require Vercel Edge
// runtime, which doesn't currently support mongoose — out of scope for phase 11.

import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { Pool } from '@/lib/models/Pool';

const POLL_INTERVAL_MS = 5_000;
const KEEPALIVE_INTERVAL_MS = 20_000;

type StreamableRes = NextApiResponse & {
  flushHeaders?: () => void;
};

function sseEvent(res: NextApiResponse, event: string, data: unknown) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Connection may already be closed; let cleanup handle it.
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Accept poolId from query param (matching existing pool route convention).
  const rawPoolId = req.query.poolId;
  const poolId = Array.isArray(rawPoolId) ? rawPoolId[0] : rawPoolId;
  if (!poolId || typeof poolId !== 'string') {
    return res.status(400).json({ error: 'invalid_pool_id' });
  }

  // SSE headers — set before first write.
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Disable nginx/proxy buffering (Vercel respects this for streaming).
  res.setHeader('X-Accel-Buffering', 'no');
  (res as StreamableRes).flushHeaders?.();

  await dbConnect();

  let lastAccumulated = 0;
  let lastPending = 0;
  let lastState: string | undefined;
  let closed = false;

  const poolObjectId = poolId;

  // Emit initial snapshot.
  try {
    const pool: any = await Pool.findById(poolObjectId)
      .select(
        'accumulatedFeesLamports accumulatedFeesLamportsPending tokenStatus feeClaimInFlight lastFeeClaimAt'
      )
      .lean();

    if (!pool) {
      sseEvent(res, 'error', { error: 'pool_not_found' });
      try {
        res.end();
      } catch {
        /* noop */
      }
      return;
    }

    lastAccumulated = Number(pool.accumulatedFeesLamports || 0);
    lastPending = Number(pool.accumulatedFeesLamportsPending || 0);
    lastState = pool.tokenStatus;

    sseEvent(res, 'snapshot', {
      accumulatedFeesLamports: lastAccumulated,
      accumulatedFeesLamportsPending: lastPending,
      totalFeesLamports: lastAccumulated + lastPending,
      tokenStatus: lastState,
      feeClaimInFlight: !!pool.feeClaimInFlight,
      lastFeeClaimAt: pool.lastFeeClaimAt || null,
      ts: Date.now(),
    });
  } catch (err: any) {
    // Initial snapshot failure is non-fatal: subsequent poll tick may succeed.
    sseEvent(res, 'error', {
      error: 'snapshot_failed',
      message: err?.message || 'unknown_error',
    });
  }

  // Keepalive comment every 20s — keeps proxies from dropping the connection
  // and lets the client detect silent disconnects.
  const keepAlive = setInterval(() => {
    if (closed) return;
    try {
      res.write(': keepalive\n\n');
    } catch {
      /* connection gone — cleanup handles it */
    }
  }, KEEPALIVE_INTERVAL_MS);

  // Poll every 5s for fee/state deltas.
  const poll = setInterval(async () => {
    if (closed) return;
    try {
      const pool: any = await Pool.findById(poolObjectId)
        .select(
          'accumulatedFeesLamports accumulatedFeesLamportsPending tokenStatus feeClaimInFlight lastFeeClaimAt'
        )
        .lean();
      if (!pool) return;

      const newAcc = Number(pool.accumulatedFeesLamports || 0);
      const newPending = Number(pool.accumulatedFeesLamportsPending || 0);
      const newState: string | undefined = pool.tokenStatus;

      if (newAcc !== lastAccumulated || newPending !== lastPending) {
        const delta = newAcc - lastAccumulated + (newPending - lastPending);
        sseEvent(res, 'fees', {
          accumulatedFeesLamports: newAcc,
          accumulatedFeesLamportsPending: newPending,
          totalFeesLamports: newAcc + newPending,
          delta,
          accumulatedDelta: newAcc - lastAccumulated,
          pendingDelta: newPending - lastPending,
          feeClaimInFlight: !!pool.feeClaimInFlight,
          lastFeeClaimAt: pool.lastFeeClaimAt || null,
          ts: Date.now(),
        });
        lastAccumulated = newAcc;
        lastPending = newPending;
      }

      if (newState !== lastState) {
        sseEvent(res, 'state', {
          tokenStatus: newState,
          previous: lastState,
          ts: Date.now(),
        });
        lastState = newState;
      }
    } catch {
      // Silently absorb poll errors; next tick will retry. Avoid tearing down
      // the connection on a transient DB blip.
    }
  }, POLL_INTERVAL_MS);

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(keepAlive);
    clearInterval(poll);
    try {
      res.end();
    } catch {
      /* noop */
    }
  };

  // Cleanup on client disconnect or response close.
  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('close', cleanup);
}

// Node runtime (not edge — mongoose requires Node). Allow long-lived response.
export const config = {
  api: {
    responseLimit: false,
  },
};
