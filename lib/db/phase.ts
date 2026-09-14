/**
 * Whether this code runs inside `next build`, where pages are prerendered.
 * A database that does not answer then must not sink the build: reads
 * get one short attempt and the pages fall back to their empty state,
 * to be filled at runtime when the timer revalidates them.
 */
export const isBuildPhase = () => process.env.NEXT_PHASE === 'phase-production-build';

/** How long one database request may take: short at build time, generous when serving (a slow evening must not read as an outage). */
export const requestTimeoutMs = () => (isBuildPhase() ? 5_000 : 30_000);

/** A fetch that gives up after `ms`: a database that hangs (a saturated instance, a gateway waiting on it) fails fast instead of holding a page or a build. */
export function timedFetch(ms: number, base: typeof fetch = fetch): typeof fetch {
    return (input, init) => {
        const timeout = AbortSignal.timeout(ms);
        const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
        return base(input, {...init, signal});
    };
}
