// SPDX-License-Identifier: GPL-3.0-or-later
import { useCallback, useEffect, useState } from 'react';
import type { BuildSpec, JobEvent } from '../../../shared/types';
import { smp } from './api';

const MAX_OUTPUT_CHARS = 2_000_000;

export interface JobState {
  id: string;
  title: string;
  status: 'running' | 'success' | 'error' | 'cancelled';
  currentStep: number;
  totalSteps: number;
  stepText: string;
  output: string;
  startedAt: number;
  endedAt?: number;
  exitCode?: number;
  note?: string;
}

function update(list: JobState[], id: string, patch: (job: JobState) => JobState): JobState[] {
  const index = list.findIndex((job) => job.id === id);
  if (index === -1) return list;
  const next = list.slice();
  next[index] = patch(next[index]);
  return next;
}

export function useJobs() {
  const [jobs, setJobs] = useState<JobState[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = smp.onJobEvent((event: JobEvent) => {
      setJobs((prev) => {
        switch (event.type) {
          case 'start':
            return [
              {
                id: event.jobId,
                title: event.title,
                status: 'running',
                currentStep: 0,
                totalSteps: event.steps,
                stepText: '',
                output: '',
                startedAt: Date.now(),
              },
              ...prev,
            ];
          case 'step':
            return update(prev, event.jobId, (job) => {
              const head = `\n── step ${event.index + 1}/${job.totalSteps}: ${event.description} ──\n$ ${event.command}\n`;
              return {
                ...job,
                currentStep: event.index + 1,
                stepText: event.description,
                output: append(job.output, head),
              };
            });
          case 'data':
            return update(prev, event.jobId, (job) => ({ ...job, output: append(job.output, event.chunk) }));
          case 'exit':
            return update(prev, event.jobId, (job) => ({
              ...job,
              status: event.ok ? 'success' : 'error',
              endedAt: Date.now(),
              exitCode: event.code,
              note: event.note ?? job.note,
              output: append(job.output, event.ok ? '\n── done ──\n' : `\n── failed (exit ${event.code}) ──\n`),
            }));
          case 'cancelled':
            return update(prev, event.jobId, (job) => ({
              ...job,
              status: 'cancelled',
              endedAt: Date.now(),
              output: append(job.output, '\n── cancelled ──\n'),
            }));
          default:
            return prev;
        }
      });
      if (event.type === 'start') {
        setActiveId(event.jobId);
      }
    });
    return unsubscribe;
  }, []);

  const start = useCallback(async (spec: BuildSpec) => {
    const { jobId } = await smp.jobs.run(spec);
    setActiveId(jobId);
    return jobId;
  }, []);

  const cancel = useCallback((jobId: string) => {
    void smp.jobs.cancel(jobId);
  }, []);

  return { jobs, activeId, setActiveId, start, cancel };
}

function append(output: string, chunk: string): string {
  const next = output + chunk;
  return next.length > MAX_OUTPUT_CHARS ? next.slice(next.length - MAX_OUTPUT_CHARS) : next;
}
