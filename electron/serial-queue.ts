// ============================================================
// One job at a time, in the order added, never on the caller's stack, bounded.
// ------------------------------------------------------------
// The diagnostics folder's write queue (diagnostics.ts). A promise chain, not a
// "draining" flag: each job runs in the .then of the one before it, so there is
// no state to get stuck. The flag it replaces (`draining ??= drain()`, cleared
// in drain's finally) stopped the queue for good if a drain ever finished before
// its first await: the finally ran first, then ??= stored a settled promise.
// ============================================================

export interface SerialQueue {
    /** Queues a job; false when the one in progress already has maxWaiting behind it. */
    add(job: () => Promise<unknown> | void): boolean;
    /** Resolves once every job added so far has finished. */
    idle(): Promise<void>;
}

export function serialQueue(maxWaiting: number, onError: (error: unknown) => void): SerialQueue {
    let tail: Promise<void> = Promise.resolve();
    /** Added and not finished: the one in progress and those waiting behind it. */
    let unfinished = 0;
    return {
        add(job) {
            if (unfinished > maxWaiting) return false;
            unfinished++;
            tail = tail
                .then(async () => { await job(); })
                .catch(onError) // a job that throws never stops the ones behind it
                .finally(() => { unfinished--; });
            return true;
        },
        idle: () => tail,
    };
}
