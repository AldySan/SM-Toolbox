// SPDX-License-Identifier: GPL-3.0-or-later

export function StatusDot(props: { ok: boolean; warn?: boolean }) {
  const className = props.ok ? 'ok' : props.warn ? 'warn' : 'err';
  return <span className={`dot ${className}`} aria-hidden="true" />;
}
