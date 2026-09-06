import {describe, expect, it} from 'vitest';
import {RateGate} from './rate-gate';

function clock() {
    let t = 0;
    const waits: number[] = [];
    return {
        now: () => t,
        sleep: async (ms: number) => {
            waits.push(ms);
            t += ms;
        },
        waits,
        advance: (ms: number) => {
            t += ms;
        },
    };
}

describe('RateGate', () => {
    it('lets the limit through at once and waits for the oldest slot to age out', async () => {
        const c = clock();
        const gate = new RateGate({limit: 3, windowMs: 1000, now: c.now, sleep: c.sleep});
        await gate.acquire();
        c.advance(100);
        await gate.acquire();
        c.advance(100);
        await gate.acquire();
        expect(c.waits).toEqual([]);
        expect(gate.used).toBe(3);
        await gate.acquire(); // fourth: the first slot (t=0) frees at t=1000, now is 200
        expect(c.waits).toEqual([800]);
        expect(gate.waitedMs).toBe(800);
        expect(gate.used).toBe(3);
    });

    it('holds a full window when the provider says the minute is nearly spent', async () => {
        const c = clock();
        const gate = new RateGate({limit: 100, windowMs: 1000, now: c.now, sleep: c.sleep});
        await gate.acquire();
        gate.observe(1);
        await gate.acquire();
        expect(c.waits).toEqual([1000]);
        gate.observe(50);
        await gate.acquire();
        expect(c.waits).toEqual([1000]);
    });

    it('backs off after a 429 and counts slots taken without waiting', async () => {
        const c = clock();
        const gate = new RateGate({limit: 2, windowMs: 1000, now: c.now, sleep: c.sleep});
        gate.take();
        gate.take();
        gate.take();
        expect(gate.used).toBe(3);
        gate.backOff();
        await gate.acquire();
        expect(c.waits[0]).toBe(1000);
    });
});
