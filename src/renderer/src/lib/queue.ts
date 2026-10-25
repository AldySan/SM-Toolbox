// SPDX-License-Identifier: GPL-3.0-or-later
import { useCallback, useEffect, useState } from 'react';
import type { BuildSpec, QueueSnapshot } from '../../../shared/types';
import { smp } from './api';

const EMPTY: QueueSnapshot = { items: [], currentId: null };

export function useQueue() {
  const [snapshot, setSnapshot] = useState<QueueSnapshot>(EMPTY);

  useEffect(() => {
    void smp.queue.list().then(setSnapshot);
    const unsubscribe = smp.onQueueEvent((next) => setSnapshot(next));
    return unsubscribe;
  }, []);

  const add = useCallback(async (spec: BuildSpec) => {
    const { itemId } = await smp.queue.add(spec);
    return itemId;
  }, []);

  const remove = useCallback((itemId: string) => {
    void smp.queue.remove(itemId);
  }, []);

  const clearPending = useCallback(() => {
    void smp.queue.clear();
  }, []);

  const pending = snapshot.items.filter((item) => item.status === 'pending').length;
  const running = snapshot.items.find((item) => item.status === 'running') ?? null;

  return { snapshot, pending, running, add, remove, clearPending };
}
