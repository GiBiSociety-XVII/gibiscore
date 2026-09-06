/**
 * Sliding-window limiter for the per-minute allowance of the plan. Pure:
 * the clock and the sleep are injected so it can be tested in no time.
 *
 * A process (one Vercel function invocation) keeps one gate: every request
 * takes a slot before it starts, and when the minute's slots are gone the
 * caller waits for the oldest one to age out. The provider's own headers
 * win over our count: when they say the minute is nearly spent, the gate
 * holds until the window turns, whatever our count says.
 */
export interface RateGateOptions {
    /** Requests allowed per window. */
    limit: number;
    /** Window length, default one minute (the provider's, plus a second of slack). */
    windowMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}

export const MINUTE_WINDOW_MS = 61_000;

export class RateGate {
    private readonly limit: number;
    private readonly windowMs: number;
    private readonly now: () => number;
    private readonly sleep: (ms: number) => Promise<void>;
    private starts: number[] = [];
    private holdUntil = 0;
    /** Time spent waiting, for the job logs. */
    waitedMs = 0;

    constructor(options: RateGateOptions) {
        this.limit = Math.max(1, options.limit);
        this.windowMs = options.windowMs ?? MINUTE_WINDOW_MS;
        this.now = options.now ?? (() => Date.now());
        this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    }

    /** Requests started in the current window. */
    get used(): number {
        this.prune(this.now());
        return this.starts.length;
    }

    private prune(at: number) {
        const cutoff = at - this.windowMs;
        while (this.starts.length > 0 && this.starts[0] <= cutoff) this.starts.shift();
    }

    /** Wait for a slot, then take it. */
    async acquire(): Promise<void> {
        for (;;) {
            const at = this.now();
            this.prune(at);
            const wait = Math.max(this.holdUntil - at, this.starts.length >= this.limit ? this.starts[0] + this.windowMs - at : 0);
            if (wait <= 0) break;
            this.waitedMs += wait;
            await this.sleep(wait);
        }
        this.starts.push(this.now());
    }

    /** Take a slot without waiting (the live job): the count stays right for whoever waits. */
    take(): void {
        this.starts.push(this.now());
    }

    /**
     * The provider's headers after a response: `remaining` requests in its
     * minute. When it is nearly spent, hold every caller until the window
     * turns. The provider's window edge is unknown, so a full minute is
     * waited: cheap insurance against a 429 that would cost a retry.
     */
    observe(remaining: number | null): void {
        if (remaining !== null && remaining <= 2) this.holdUntil = Math.max(this.holdUntil, this.now() + this.windowMs);
    }

    /** A 429 came back: hold for a window, the count was wrong. */
    backOff(): void {
        this.holdUntil = Math.max(this.holdUntil, this.now() + this.windowMs);
    }
}
