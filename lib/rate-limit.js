// Tiny in-memory sliding-window rate limiter keyed by a string (usually client IP).
//
// Correct for a single long-running process (the persistent-host deployment).
// If this ever scales to multiple instances, swap the Map for a shared store
// (Redis / Upstash) so limits are enforced across the fleet.

export function createRateLimiter({ windowMs, max, sweepEvery = 60_000 }) {
  const hits = new Map(); // key -> number[] (timestamps within the window)
  let lastSweep = 0;

  return function check(key, now = Date.now()) {
    // Periodically drop stale keys so memory stays bounded.
    if (now - lastSweep > sweepEvery) {
      for (const [k, arr] of hits) {
        const kept = arr.filter((t) => now - t < windowMs);
        if (kept.length) hits.set(k, kept);
        else hits.delete(k);
      }
      lastSweep = now;
      if (hits.size > 50_000) hits.clear(); // hard backstop against unbounded growth
    }

    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      const retryMs = Math.max(0, windowMs - (now - recent[0]));
      return { ok: false, remaining: 0, retryMs };
    }
    recent.push(now);
    hits.set(key, recent);
    return { ok: true, remaining: max - recent.length, retryMs: 0 };
  };
}
