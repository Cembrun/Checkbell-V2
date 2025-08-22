// Optional helper to enable Redis-backed sessions when REDIS_URL is provided.
import session from 'express-session';
import Redis from 'ioredis';
import { createRequire } from 'module';

// connect-redis is a CommonJS module; use createRequire to load it in ESM context
const require = createRequire(import.meta.url);
const connectRedisMod = require('connect-redis');
// support both CJS (module.exports = fn) and ESM transpiled default export
const connectRedis = (connectRedisMod && connectRedisMod.default) ? connectRedisMod.default : connectRedisMod;
export function makeSessionMiddleware(options = {}) {
  const RedisStore = connectRedis(session);
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    const client = new Redis(redisUrl);
    return session({
      store: new RedisStore({ client }),
      secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 8,
      },
    });
  }

  // fallback to default memory store
  return session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8,
    },
  });
}

