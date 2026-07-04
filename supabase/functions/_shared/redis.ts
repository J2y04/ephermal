/**
 * Upstash Redis REST client — shared utility for Supabase Edge Functions
 *
 * Uses the Upstash Redis REST API (no TCP — works in Deno/Edge environments).
 *
 * Required env vars:
 *   UPSTASH_REDIS_REST_URL   — https://your-db.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN — your token
 *
 * Usage:
 *   import { redis } from '../_shared/redis.ts';
 *   await redis.set('key', 'value', 60);   // set with 60s TTL
 *   const val = await redis.get('key');     // null if missing/expired
 */

const REDIS_URL   = Deno.env.get('UPSTASH_REDIS_REST_URL');
const REDIS_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

/** Returns true if Upstash credentials are configured */
export function redisAvailable(): boolean {
  return !!(REDIS_URL && REDIS_TOKEN);
}

async function command<T>(cmd: (string | number)[]): Promise<T | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(`${REDIS_URL}/${cmd.map(encodeURIComponent).join('/')}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    if (!res.ok) return null;
    const { result } = await res.json();
    return result as T;
  } catch {
    return null;
  }
}

export const redis = {
  /** Get a string value. Returns null if key missing or expired. */
  async get(key: string): Promise<string | null> {
    return command<string>(['GET', key]);
  },

  /** Set a key. If ttlSeconds is given, sets EX TTL. */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await command(['SET', key, value, 'EX', ttlSeconds]);
    } else {
      await command(['SET', key, value]);
    }
  },

  /** Get JSON (parsed). Returns null if missing. */
  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  },

  /** Set JSON (serialized). */
  async setJSON(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  },

  /** Delete a key. */
  async del(key: string): Promise<void> {
    await command(['DEL', key]);
  },

  /** Delete all keys matching a pattern (SCAN + DEL). */
  async delPattern(pattern: string): Promise<void> {
    if (!REDIS_URL || !REDIS_TOKEN) return;
    try {
      const res = await fetch(`${REDIS_URL}/scan/0/match/${encodeURIComponent(pattern)}/count/100`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      });
      if (!res.ok) return;
      const { result } = await res.json();
      const keys: string[] = result?.[1] ?? [];
      for (const key of keys) await this.del(key);
    } catch {}
  },

  /** Check if a key exists. */
  async exists(key: string): Promise<boolean> {
    const r = await command<number>(['EXISTS', key]);
    return r === 1;
  },

  /** Atomic increment. On first call (result === 1) sets TTL in seconds.
   *  Returns null when Redis is unavailable — callers must handle the null case. */
  async incr(key: string, ttlSeconds?: number): Promise<number | null> {
    const result = await command<number>(['INCR', key]);
    if (result === null) return null;
    if (result === 1 && ttlSeconds) {
      await command(['EXPIRE', key, ttlSeconds]);
    }
    return result;
  },
};

/** Build a cache key for user-scoped API responses */
export function cacheKey(userId: string, action: string, scope?: string): string {
  const parts = ['ephermal', userId, action];
  if (scope) parts.push(scope);
  return parts.join(':');
}
