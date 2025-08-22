// Optional helper to enable Redis-backed sessions when REDIS_URL is provided.
// This module avoids requiring connect-redis/ioredis at module-import time to
// prevent ESM/CJS import errors on some hosts. If Redis initialization fails
// the function falls back to the default memory store.
import session from 'express-session';
import { createRequire } from 'module';

export async function makeSessionMiddleware(options = {}) {
  const redisUrl = process.env.REDIS_URL;
  const secret = process.env.SESSION_SECRET || 'dev-secret-change-me';

  const baseOpts = {
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8,
    },
    ...options,
  };

  if (!redisUrl) {
    // No redis configured -> use memory store
    return session(baseOpts);
  }

  // Try to require connect-redis and ioredis at runtime. If anything fails
  // (missing package, export shape mismatch, connection error) fall back to
  // the memory store so the server can still start.
  try {
    const require = createRequire(import.meta.url);
    const connectRedisMod = require('connect-redis');
    const IORedis = require('ioredis');
    // Provide explicit TLS and retry/connect options that work better with Upstash
  const client = new IORedis(redisUrl, {
      tls: {},
      // reduce noisy retry loop; RedisStore will work with a connected client
      maxRetriesPerRequest: 5,
      connectTimeout: 10000,
      enableReadyCheck: true,
      // exponential backoff for reconnects
      retryStrategy: (times) => Math.min(1000 * 2 ** times, 30000),
    });
    // Helpful logs for deployment verification
    client.on('connect', () => {
      console.log('redis-session-optional: Redis client connect');
    });
    client.on('ready', () => {
      console.log('redis-session-optional: Redis client ready');
    });
    client.on('reconnecting', (delay) => {
      console.warn('redis-session-optional: Redis client reconnecting, delay=' + delay);
    });
    client.on('error', (err) => {
      console.error('redis-session-optional: Redis client error:', err && err.message ? err.message : err);
    });

    // Quick connectivity check: ping with timeout to avoid long blocking on startup
    const pingPromise = client.ping();
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('PING_TIMEOUT')), 2500));
    try {
      await Promise.race([pingPromise, timeout]);
    } catch (e) {
      console.error('redis-session-optional: Redis ping failed, falling back to memory store:', e && e.message ? e.message : e);
      try { client.disconnect(); } catch {}
      return session(baseOpts);
    }

    // connect-redis has changed export shapes across versions. Try common patterns:
    try {
      // Pattern A: module is a function that returns a Store constructor when passed session
      if (typeof connectRedisMod === 'function') {
        const StoreCtor = connectRedisMod(session);
        if (typeof StoreCtor === 'function') {
          return session({ ...baseOpts, store: new StoreCtor({ client }) });
        }
        // If StoreCtor is an object (rare), try to instantiate or use directly
        try {
          return session({ ...baseOpts, store: new StoreCtor({ client }) });
        } catch (e) {
          // fallback: maybe StoreCtor itself is already a store instance
          return session({ ...baseOpts, store: StoreCtor });
        }
      }

      // Pattern B: module.default is the factory
      if (connectRedisMod && typeof connectRedisMod.default === 'function') {
        const StoreCtor = connectRedisMod.default(session);
        if (typeof StoreCtor === 'function') {
          return session({ ...baseOpts, store: new StoreCtor({ client }) });
        }
        try {
          return session({ ...baseOpts, store: new StoreCtor({ client }) });
        } catch (e) {
          return session({ ...baseOpts, store: StoreCtor });
        }
      }

      // Pattern C: module exports a RedisStore class
      if (connectRedisMod && (connectRedisMod.RedisStore || (connectRedisMod.default && connectRedisMod.default.RedisStore))) {
        const StoreClass = connectRedisMod.RedisStore || connectRedisMod.default.RedisStore;
        return session({ ...baseOpts, store: new StoreClass({ client }) });
      }

      throw new Error('Unsupported connect-redis export shape');
    } catch (e) {
      console.error('redis-session-optional: Redis session init failed:', e && e.message ? e.message : e);
      return session(baseOpts);
    }
  } catch (e) {
    // Log the issue and return a safe in-memory session middleware
    console.error('redis-session-optional: Redis session init failed:', e && e.message ? e.message : e);
    return session(baseOpts);
  }
}

