// SPDX-License-Identifier: GPL-3.0-or-later
import type { SmpApi } from '../../../shared/types';

declare global {
  interface Window {
    smp: SmpApi;
  }
}

export const smp: SmpApi = window.smp;
