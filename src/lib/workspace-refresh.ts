/** Component-local only: no cross-tab, cross-session or server data cache. */
export function createRefreshGate() {
  let flight: { controller: AbortController; promise: Promise<void> } | undefined;
  const invalidate = () => { flight?.controller.abort(); flight = undefined; };
  return {
    invalidate,
    run(operation: (signal: AbortSignal) => Promise<void>, deduplicate = true): Promise<void> {
      if (deduplicate && flight) return flight.promise;
      invalidate();
      const controller = new AbortController();
      const entry = {controller,promise:Promise.resolve()};
      entry.promise = operation(controller.signal).finally(() => { if (flight === entry) flight = undefined; });
      flight = entry;
      return entry.promise;
    },
  };
}

export class TransientWorkspaceError extends Error {}

/** Retry only explicitly transient read failures, once, revalidating auth each time. */
export async function recoverWorkspaceRead(operation: () => Promise<void>, signal: AbortSignal) {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try { return await operation(); }
    catch (error) {
      if (!(error instanceof TransientWorkspaceError) || attempt >= 1) throw error;
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort',abort); resolve(); },250+Math.floor(Math.random()*250));
        signal.addEventListener('abort',abort,{once:true});
        if (signal.aborted) abort();
      });
    }
  }
}
