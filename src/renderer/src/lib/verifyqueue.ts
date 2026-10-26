// SPDX-License-Identifier: GPL-3.0-or-later
import { useCallback, useEffect, useState } from 'react';
import type { VerifySnapshot } from '../../../shared/types';
import { smp } from './api';

const EMPTY: VerifySnapshot = { items: [], currentId: null };

export function useVerifyQueue() {
  const [snapshot, setSnapshot] = useState<VerifySnapshot>(EMPTY);

  useEffect(() => {
    void smp.verifyQueue.list().then(setSnapshot);
    const unsubscribe = smp.onVerifyQueueEvent((next) => setSnapshot(next));
    return unsubscribe;
  }, []);

  const add = useCallback(async (paths: string[]) => {
    const { added, skipped } = await smp.verifyQueue.add(paths);
    return { added, skipped };
  }, []);

  const remove = useCallback((itemId: string) => {
    void smp.verifyQueue.remove(itemId);
  }, []);

  const clear = useCallback(() => {
    void smp.verifyQueue.clear();
  }, []);

  const pending = snapshot.items.filter((item) => item.status === 'pending').length;
  const running = snapshot.items.find((item) => item.status === 'running') ?? null;

  return { snapshot, pending, running, add, remove, clear };
}
