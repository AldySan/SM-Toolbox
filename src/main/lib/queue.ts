// SPDX-License-Identifier: GPL-3.0-or-later
// Build queue: items are validated when added and run one at a time; when a
// job finishes — successfully or not — the next pending item starts. The
// state machine is pure bookkeeping; launching jobs and notifying listeners
// are injected so the logic stays trivially testable.

import type { BuildSpec, ImageFormat, QueueItem, QueueProgress, QueueSnapshot } from '../../shared/types';
import type { JobResult } from './runner';

export interface QueueLauncher {
  /**
   * Start building `spec`. Rejects if the spec cannot run (missing tools,
   * vanished source, ...). Resolves with the job id and the completion
   * promise of the underlying runner. `hooks.onProgress` mirrors the job's
   * step events so the queue can show per-item progress.
   */
  launch(spec: BuildSpec, hooks: QueueLaunchHooks): Promise<{ jobId: string; done: Promise<JobResult> }>;
}

export interface QueueLaunchHooks {
  /** Called whenever the job moves to another step. */
  onProgress?(progress: QueueProgress): void;
}

export interface JobQueueOptions {
  launcher: QueueLauncher;
  /** Called with the full snapshot after every state change. */
  onChange(snapshot: QueueSnapshot): void;
  /** Generates ids; exposed for deterministic tests. */
  nextId?(): string;
}

function outputNameOf(spec: BuildSpec): string {
  return spec.outputFile.split(/[\\/]/).pop() ?? spec.outputFile;
}

export class JobQueue {
  private items: QueueItem[] = [];
  private currentId: string | null = null;
  private counter = 0;
  private readonly opts: JobQueueOptions;

  constructor(opts: JobQueueOptions) {
    this.opts = opts;
  }

  private nextId(): string {
    this.counter += 1;
    return this.opts.nextId ? this.opts.nextId() : `q-${this.counter}`;
  }

  snapshot(): QueueSnapshot {
    return {
      items: this.items.map((item) => ({ ...item })),
      currentId: this.currentId,
    };
  }

  private emit(): void {
    this.opts.onChange(this.snapshot());
  }

  add(spec: BuildSpec, title: string): QueueItem {
    const item: QueueItem = {
      id: this.nextId(),
      status: 'pending',
      addedAt: Date.now(),
      title,
      outputName: outputNameOf(spec),
      format: spec.format as ImageFormat,
      spec,
    };
    this.items.push(item);
    this.emit();
    void this.pump();
    return { ...item };
  }

  /** Remove a pending item; running items are cancelled through their job. */
  remove(id: string): boolean {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1 || this.items[index].status === 'running') return false;
    this.items.splice(index, 1);
    this.emit();
    return true;
  }

  /** Drop every pending item; returns how many were removed. */
  clearPending(): number {
    const before = this.items.length;
    this.items = this.items.filter((item) => item.status !== 'pending');
    const removed = before - this.items.length;
    if (removed > 0) this.emit();
    return removed;
  }

  isBusy(): boolean {
    return this.currentId !== null;
  }

  private patch(id: string, fields: Partial<QueueItem>): void {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return;
    this.items[index] = { ...this.items[index], ...fields };
  }

  private async pump(): Promise<void> {
    if (this.currentId) return;
    const next = this.items.find((item) => item.status === 'pending');
    if (!next) return;

    this.currentId = next.id;
    this.patch(next.id, { status: 'running', startedAt: Date.now() });
    this.emit();

    // Progress events arrive while the job runs; patching is guarded by the
    // running status so a late event can never resurrect a settled item.
    const hooks: QueueLaunchHooks = {
      onProgress: (progress) => {
        const item = this.items.find((candidate) => candidate.id === next.id);
        if (!item || item.status !== 'running') return;
        this.patch(next.id, { progress });
        this.emit();
      },
    };

    try {
      const { jobId, done } = await this.opts.launcher.launch(next.spec, hooks);
      this.patch(next.id, { jobId });
      this.emit();
      const result = await done;
      this.patch(next.id, {
        status: result.cancelled ? 'cancelled' : result.ok ? 'done' : 'failed',
        endedAt: Date.now(),
        note: result.note,
        progress: undefined,
      });
    } catch (error) {
      // Launcher refused to start the job (validation, spawn failure).
      this.patch(next.id, {
        status: 'failed',
        endedAt: Date.now(),
        note: error instanceof Error ? error.message : String(error),
        progress: undefined,
      });
    } finally {
      this.currentId = null;
      this.emit();
      // Continue with the rest of the queue regardless of this item's result.
      void this.pump();
    }
  }
}
