import { describe, expect, it } from 'vitest';
import { MediaRequestScheduler } from '../src/lib/mediaRequestScheduler';

describe('MediaRequestScheduler', () => {
  it('admits a Focus request before queued thumbnail requests', async () => {
    const scheduler = new MediaRequestScheduler(1);
    const starts: string[] = [];
    const firstThumb = scheduler.acquire('low');
    const queuedThumb = scheduler.acquire('low');
    const focus = scheduler.acquire('high');

    await firstThumb.admitted;
    starts.push('first thumbnail');
    firstThumb.release();
    await focus.admitted;
    starts.push('focus');
    expect(starts).toEqual(['first thumbnail', 'focus']);

    focus.release();
    await queuedThumb.admitted;
    starts.push('queued thumbnail');
    expect(starts).toEqual(['first thumbnail', 'focus', 'queued thumbnail']);
    queuedThumb.release();
  });
});
