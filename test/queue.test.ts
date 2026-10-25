// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { JobQueue } from '../src/main/lib/queue';
import type { BuildSpec, QueueSnapshot } from '../src/shared/types';
import type { JobResult } from '../src/main/lib/runner';

function spec(name: string): BuildSpec {
  return { format: 'ufs2', sourceDir: '/games/src', outputFile: `/out/${name}.ffpkg` };
}

interface Harness {
  queue: JobQueue;
  started: string[];
  resolve: (index: number, result: JobResult) => void;
  snapshots: QueueSnapshot[];
}

function harness(
  launchImpl?: (s: BuildSpec) => Promise<{ jobId: string; done: Promise<JobResult> }>,
): Harness {
  const started: string[] = [];
  const pending: Array<(result: JobResult) => void> = [];
  const snapshots: QueueSnapshot[] = [];

  const defaultLaunch = (s: BuildSpec): Promise<{ jobId: string; done: Promise<JobResult> }> => {
    const index = started.length;
    started.push(s.outputFile);
    const done = new Promise<JobResult>((resolve) => {
      pending[index] = resolve;
    });
    return Promise.resolve({ jobId: `job-${index + 1}`, done });
  };

  let counter = 0;
  const queue = new JobQueue({
    launcher: { launch: launchImpl ?? defaultLaunch },
    onChange: (snapshot) => snapshots.push(snapshot),
    nextId: () => `q-${++counter}`,
  });

  return { queue, started, resolve: (index, result) => pending[index]?.(result), snapshots };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('JobQueue', () => {
  it('runs items one at a time and starts the next after success', async () => {
    const h = harness();
    h.queue.add(spec('a'), 'Build a');
    h.queue.add(spec('b'), 'Build b');
    await flush();

    expect(h.started).toEqual(['/out/a.ffpkg']);
    expect(h.queue.snapshot().items.map((i) => i.status)).toEqual(['running', 'pending']);

    h.resolve(0, { code: 0, ok: true });
    await flush();

    expect(h.started).toEqual(['/out/a.ffpkg', '/out/b.ffpkg']);
    expect(h.queue.snapshot().items.map((i) => i.status)).toEqual(['done', 'running']);
  });

  it('continues to the next item after a failure', async () => {
    const h = harness();
    h.queue.add(spec('a'), 'Build a');
    h.queue.add(spec('b'), 'Build b');
    await flush();

    h.resolve(0, { code: 1, ok: false, note: 'tool failed' });
    await flush();

    expect(h.started).toEqual(['/out/a.ffpkg', '/out/b.ffpkg']);
    expect(h.queue.snapshot().items[0].status).toBe('failed');
    expect(h.queue.snapshot().items[0].note).toBe('tool failed');
  });

  it('marks cancelled items as cancelled and moves on', async () => {
    const h = harness();
    h.queue.add(spec('a'), 'Build a');
    h.queue.add(spec('b'), 'Build b');
    await flush();

    h.resolve(0, { code: -1, ok: false, note: 'Cancelled', cancelled: true });
    await flush();

    expect(h.queue.snapshot().items[0].status).toBe('cancelled');
    expect(h.started).toHaveLength(2);
  });

  it('records a launcher rejection as a failed item and continues', async () => {
    let call = 0;
    const h = harness(async (s) => {
      call += 1;
      if (call === 1) throw new Error('UFS2Tool was not found');
      void s;
      return { jobId: 'job-2', done: Promise.resolve({ code: 0, ok: true }) };
    });
    h.queue.add(spec('a'), 'Build a');
    h.queue.add(spec('b'), 'Build b');
    await flush();

    const items = h.queue.snapshot().items;
    expect(items[0].status).toBe('failed');
    expect(items[0].note).toBe('UFS2Tool was not found');
    expect(items[1].status).toBe('done');
  });

  it('removes only pending items', async () => {
    const h = harness();
    h.queue.add(spec('a'), 'Build a');
    h.queue.add(spec('b'), 'Build b');
    await flush();

    expect(h.queue.remove('q-1')).toBe(false); // running
    expect(h.queue.remove('q-2')).toBe(true); // pending
    expect(h.queue.snapshot().items).toHaveLength(1);

    h.resolve(0, { code: 0, ok: true });
    await flush();
    expect(h.started).toEqual(['/out/a.ffpkg']);
  });

  it('clearPending drops every pending item but keeps history', async () => {
    const h = harness();
    h.queue.add(spec('a'), 'Build a');
    h.queue.add(spec('b'), 'Build b');
    h.queue.add(spec('c'), 'Build c');
    await flush();

    expect(h.queue.clearPending()).toBe(2);
    expect(h.queue.snapshot().items.map((i) => i.status)).toEqual(['running']);

    h.resolve(0, { code: 0, ok: true });
    await flush();
    expect(h.started).toEqual(['/out/a.ffpkg']);
    expect(h.queue.snapshot().currentId).toBeNull();
  });

  it('emits a snapshot after every change', async () => {
    const h = harness();
    h.queue.add(spec('a'), 'Build a');
    await flush();
    h.resolve(0, { code: 0, ok: true });
    await flush();

    expect(h.snapshots.length).toBeGreaterThanOrEqual(4); // add, running, jobId, done
    expect(h.snapshots.at(-1)?.items[0].status).toBe('done');
  });
});
