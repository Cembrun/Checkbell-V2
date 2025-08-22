// Optional helper to enable Redis-backed sessions when REDIS_URL is provided.
// This module avoids requiring connect-redis/ioredis at module-import time to
// prevent ESM/CJS import errors on some hosts. If Redis initialization fails
// the function falls back to the default memory store.
import session from 'express-session';
import { createRequire } from 'module';

export function makeSessionMiddleware(options = {}) {
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
    const connectRedisFactory = (connectRedisMod && connectRedisMod.default) ? connectRedisMod.default : connectRedisMod;
    const RedisStore = connectRedisFactory(session);
    const IORedis = require('ioredis');
    const client = new IORedis(redisUrl);

    return session({
      ...baseOpts,
      store: new RedisStore({ client }),
    });
  } catch (e) {
    // Log the issue and return a safe in-memory session middleware
    console.error('redis-session-optional: Redis session init failed:', e && e.message ? e.message : e);
    return session(baseOpts);
  }
}

