// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { VerifyQueue } from '../src/main/lib/verifyqueue';
import type { FileReport, VerifySnapshot } from '../src/shared/types';

function report(detected: FileReport['detected']): FileReport {
  return {
    path: '/images/x',
    size: 1024,
    extension: '.x',
    detected,
    notes: [],
    alignment64k: true,
    extensionMatches: true,
  };
}

interface Harness {
  queue: VerifyQueue;
  resolveNext: (value: FileReport | null) => void;
  snapshots: VerifySnapshot[];
}

function harness(verifyImpl?: (path: string) => Promise<FileReport | null>): Harness {
  const snapshots: VerifySnapshot[] = [];
  const pending: Array<(value: FileReport | null) => void> = [];
  let counter = 0;

  const defaultVerify = (path: string): Promise<FileReport | null> =>
    new Promise((resolve) => {
      pending.push(resolve);
      void path;
    });

  const queue = new VerifyQueue({
    launcher: { verify: verifyImpl ?? defaultVerify },
    onChange: (snapshot) => snapshots.push(snapshot),
    nextId: () => `v-${++counter}`,
  });

  return {
    queue,
    resolveNext: (value) => pending.shift()?.(value),
    snapshots,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('VerifyQueue', () => {
  it('verifies items one at a time and attaches the report', async () => {
    const h = harness();
    h.queue.add(['/a.ffpkg', '/b.ffpkg']);
    await flush();

    expect(h.queue.snapshot().items.map((item) => item.status)).toEqual(['running', 'pending']);

    h.resolveNext(report('ufs2'));
    await flush();

    const items = h.queue.snapshot().items;
    expect(items[0].status).toBe('done');
    expect(items[0].report?.detected).toBe('ufs2');
    expect(items[1].status).toBe('running');
  });

  it('marks unreadable files as failed and keeps going', async () => {
    const h = harness();
    h.queue.add(['/missing.ffpkg']);
    await flush();

    h.resolveNext(null);
    await flush();

    const item = h.queue.snapshot().items[0];
    expect(item.status).toBe('failed');
    expect(item.error).toBeTruthy();
  });

  it('never lets a rejecting launcher break the queue', async () => {
    let call = 0;
    const h = harness(async (path) => {
      call += 1;
      if (call === 1) throw new Error('disk error');
      return report('exfat');
      void path;
    });
    h.queue.add(['/a.ffpkg', '/b.ffpkg']);
    await flush();

    const items = h.queue.snapshot().items;
    expect(items[0].status).toBe('failed');
    expect(items[0].error).toContain('disk error');
    expect(items[1].status).toBe('done');
  });

  it('skips duplicate and empty paths when adding a batch', async () => {
    const h = harness();
    const { items, skipped } = h.queue.add(['/a.ffpkg', '/a.ffpkg', '', '/b.ffpkg']);
    expect(items.map((item) => item.path)).toEqual(['/a.ffpkg', '/b.ffpkg']);
    expect(skipped).toBe(2);
  });

  it('removes pending and finished items but not the running one', async () => {
    const h = harness();
    h.queue.add(['/a.ffpkg', '/b.ffpkg']);
    await flush();

    expect(h.queue.remove('v-1')).toBe(false); // running
    expect(h.queue.remove('v-2')).toBe(true); // pending

    h.resolveNext(report('ufs2'));
    await flush();
    expect(h.queue.remove('v-1')).toBe(true); // finished now
    expect(h.queue.snapshot().items).toHaveLength(0);
  });

  it('clears everything except the running item', async () => {
    const h = harness();
    h.queue.add(['/a.ffpkg', '/b.ffpkg', '/c.ffpkg']);
    await flush();

    expect(h.queue.clear()).toBe(2);
    const items = h.queue.snapshot().items;
    expect(items.map((item) => item.status)).toEqual(['running']);

    h.resolveNext(report('ufs2'));
    await flush();
    expect(h.queue.snapshot().currentId).toBeNull();
  });

  it('emits a snapshot after every state change', async () => {
    const h = harness();
    h.queue.add(['/a.ffpkg']);
    await flush();
    h.resolveNext(report('ufs2'));
    await flush();

    expect(h.snapshots.length).toBeGreaterThanOrEqual(3); // add+running, done
    expect(h.snapshots.at(-1)?.items[0].status).toBe('done');
  });
});
