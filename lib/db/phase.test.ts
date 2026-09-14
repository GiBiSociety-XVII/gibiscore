import {describe, expect, it} from 'vitest';
import {timedFetch} from './phase';

describe('timedFetch', () => {
    it('gives up on a request that never answers', async () => {
        const hanging: typeof fetch = (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
        const started = Date.now();
        await expect(timedFetch(60, hanging)('https://db.example/rest')).rejects.toMatchObject({name: 'TimeoutError'});
        expect(Date.now() - started).toBeLessThan(2000);
    });
    it('passes a quick answer through, and honours the caller\'s own signal', async () => {
        const quick: typeof fetch = async () => new Response('ok');
        expect(await (await timedFetch(1000, quick)('https://db.example/rest')).text()).toBe('ok');
        const controller = new AbortController();
        const hanging: typeof fetch = (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
        const p = timedFetch(10_000, hanging)('https://db.example/rest', {signal: controller.signal});
        controller.abort(new Error('mine'));
        await expect(p).rejects.toMatchObject({message: 'mine'});
    });
});
