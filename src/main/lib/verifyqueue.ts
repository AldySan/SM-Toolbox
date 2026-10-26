// SPDX-License-Identifier: GPL-3.0-or-later
// Verification queue: many images can be queued at once and are checked one
// after another. Pure bookkeeping, mirroring JobQueue — the actual header
// check is injected as a launcher so the logic stays unit-testable.

import type { FileReport, VerifyItem, VerifySnapshot } from '../../shared/types';

export interface VerifyLauncher {
  /**
   * Verify `path`. Resolves with the report, or `null` when the file cannot
   * be read at all. Never rejects: an unreadable file is a failed item, not a
   * broken queue.
   */
  verify(path: string): Promise<FileReport | null>;
}

export interface VerifyQueueOptions {
  launcher: VerifyLauncher;
  /** Called with the full snapshot after every state change. */
  onChange(snapshot: VerifySnapshot): void;
  /** Generates ids; exposed for deterministic tests. */
  nextId?(): string;
}

function nameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export class VerifyQueue {
  private items: VerifyItem[] = [];
  private currentId: string | null = null;
  private counter = 0;
  private readonly opts: VerifyQueueOptions;

  constructor(opts: VerifyQueueOptions) {
    this.opts = opts;
  }

  private nextId(): string {
    this.counter += 1;
    return this.opts.nextId ? this.opts.nextId() : `v-${this.counter}`;
  }

  snapshot(): VerifySnapshot {
    return {
      items: this.items.map((item) => ({ ...item })),
      currentId: this.currentId,
    };
  }

  private emit(): void {
    this.opts.onChange(this.snapshot());
  }

  /** Queue a batch of files; duplicate paths already in the list are skipped. */
  add(paths: string[]): { items: VerifyItem[]; skipped: number } {
    const known = new Set(this.items.map((item) => item.path));
    const added: VerifyItem[] = [];
    let skipped = 0;
    for (const path of paths) {
      if (typeof path !== 'string' || path.length === 0 || known.has(path)) {
        skipped += 1;
        continue;
      }
      known.add(path);
      const item: VerifyItem = {
        id: this.nextId(),
        status: 'pending',
        addedAt: Date.now(),
        path,
        name: nameOf(path),
      };
      added.push(item);
      this.items.push(item);
    }
    if (added.length > 0) {
      this.emit();
      void this.pump();
    }
    return { items: added.map((item) => ({ ...item })), skipped };
  }

  /** Remove a pending or finished item; the running one cannot be removed. */
  remove(id: string): boolean {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1 || this.items[index].status === 'running') return false;
    this.items.splice(index, 1);
    this.emit();
    return true;
  }

  /** Drop everything that is not currently running; returns how many went. */
  clear(): number {
    const before = this.items.length;
    this.items = this.items.filter((item) => item.status === 'running');
    const removed = before - this.items.length;
    if (removed > 0) this.emit();
    return removed;
  }

  private patch(id: string, fields: Partial<VerifyItem>): void {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return;
    this.items[index] = { ...this.items[index], ...fields };
  }

  private async pump(): Promise<void> {
    if (this.currentId) return;
    const next = this.items.find((item) => item.status === 'pending');
    if (!next) return;

    this.currentId = next.id;
    this.patch(next.id, { status: 'running' });
    this.emit();

    try {
      const report = await this.opts.launcher.verify(next.path);
      if (report) {
        this.patch(next.id, { status: 'done', report });
      } else {
        this.patch(next.id, { status: 'failed', error: 'Could not read the file (missing or not a regular file).' });
      }
    } catch (error) {
      // Defensive: the launcher is expected to resolve, never reject.
      this.patch(next.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.currentId = null;
      this.emit();
      void this.pump();
    }
  }
}
