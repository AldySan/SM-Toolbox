// SPDX-License-Identifier: GPL-3.0-or-later
import type { ReactNode } from 'react';

type Tone = 'info' | 'warn' | 'error';

export function Callout(props: { tone?: Tone; title?: string; children: ReactNode }) {
  const tone = props.tone ?? 'info';
  return (
    <div className={`callout callout-${tone}`}>
      {props.title && <div className="callout-title">{props.title}</div>}
      <div className="callout-body">{props.children}</div>
    </div>
  );
}
