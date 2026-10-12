import { PrismaClient } from '@prisma/client';

const SLOW_QUERY_MS = 800;
const CLIENT_BUILD = 2;

function createClient() {
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

type AppPrisma = ReturnType<typeof createClient>;

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

export const prisma = cachedClient();
