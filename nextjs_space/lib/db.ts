import 'server-only';
import { PrismaClient } from '@prisma/client';

const SLOW_QUERY_MS = 800;
const CLIENT_BUILD = 2;

function createRealClient() {
  return new PrismaClient().$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (model === 'MaintenanceLog') return query(args);
          const started = Date.now();
          try {
            const result = await query(args);
            const durationMs = Date.now() - started;
            if (durationMs >= SLOW_QUERY_MS) {
              void import('@/lib/logger').then(({ logEvent }) => logEvent({
                severity: 'WARN',
                source: 'prisma',
                message: `Slow query ${model}.${operation}`,
                durationMs,
                meta: { model, operation },
              }));
            }
            return result;
          } catch (error) {
            const err = error instanceof Error ? error : new Error('Prisma query failed');
            void import('@/lib/logger').then(({ logEvent }) => logEvent({
              severity: 'ERROR',
              source: 'prisma',
              message: err.message,
              stack: err.stack,
              meta: { model, operation },
            }));
            throw error;
          }
        },
      },
    },
  });
}

type AppPrisma = ReturnType<typeof createRealClient>;

function buildStub(): AppPrisma {
  const stub = new Proxy(function stubFn() { return stub; }, {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      return stub;
    },
    apply() {
      return stub;
    },
  });
  return stub as unknown as AppPrisma;
}

function createClient(): AppPrisma {
  // The client generated during Vercel install throws if constructed while pages are collected.
  if (process.env.NEXT_PHASE === 'phase-production-build') return buildStub();
  return createRealClient();
}

const globalForPrisma = globalThis as unknown as {
  prisma?: AppPrisma;
  prismaBuild?: number;
};

function cachedClient(): AppPrisma {
  if (globalForPrisma.prisma && globalForPrisma.prismaBuild === CLIENT_BUILD) return globalForPrisma.prisma;
  const next = createClient();
  globalForPrisma.prisma = next;
  globalForPrisma.prismaBuild = CLIENT_BUILD;
  return next;
}

/** First property access creates the client. Importing this module during page collection does not connect. */
export const prisma: AppPrisma = new Proxy({} as AppPrisma, {
  get(_target, prop, receiver) {
    const client = cachedClient();
    const value = Reflect.get(client as object, prop, receiver);
    if (typeof value !== 'function' || value === client) return value;
    return value.bind(client);
  },
});
