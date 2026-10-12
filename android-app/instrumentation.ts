export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installProcessGuards } = await import('@/lib/logger');
    installProcessGuards();
  }
}

type RequestErrorContext = {
  routePath?: string;
  routeType?: string;
  routerKind?: string;
};

/** Next.js calls this for unhandled server exceptions, including API route failures. */
export async function onRequestError(error: unknown, request: { path?: string; method?: string }, context: RequestErrorContext) {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { logEvent } = await import('@/lib/logger');
    const err = error instanceof Error ? error : new Error('Unhandled request error');
    const route = context.routePath || request.path || '';
    await logEvent({
      severity: route.startsWith('/api/chat') ? 'CRITICAL' : 'ERROR',
      source: 'api',
      message: err.message,
      route,
      stack: err.stack,
      meta: { method: request.method || '', routeType: context.routeType || '' },
    });
  }
}
