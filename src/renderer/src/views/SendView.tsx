// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react';
import type { AppSettings, SendEvent } from '../../../shared/types';
import { smp } from '../lib/api';
import { Callout } from '../components/Callout';
import { PathField } from '../components/PathField';

type SendStatus =
  | { phase: 'idle' }
  | { phase: 'busy'; text: string }
  | { phase: 'connecting' }
  | { phase: 'sending'; sent: number; total: number }
  | { phase: 'done'; sent: number }
  | { phase: 'failed'; message: string }
  | { phase: 'cancelled' };

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  return `${bytes} B`;
}

export function SendView(props: {
  settings: AppSettings | null;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  const [elfPath, setElfPath] = useState('');
  const [status, setStatus] = useState<SendStatus>({ phase: 'idle' });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hostInput, setHostInput] = useState('');

  useEffect(() => {
    const unsubscribe = smp.onSendEvent((event: SendEvent) => {
      if (activeId && event.sendId !== activeId) return;
      switch (event.type) {
        case 'connecting':
          setStatus({ phase: 'connecting' });
          break;
        case 'connected':
          setStatus({ phase: 'sending', sent: 0, total: 0 });
          break;
        case 'progress':
          setStatus({ phase: 'sending', sent: event.sent, total: event.total });
          break;
        case 'sent':
          setStatus({ phase: 'done', sent: event.sent });
          break;
        case 'failed':
          setStatus({ phase: 'failed', message: event.message });
          break;
        case 'cancelled':
          setStatus({ phase: 'cancelled' });
          break;
        default:
          break;
      }
    });
    return unsubscribe;
  }, [activeId]);

  const downloadPayload = async () => {
    setStatus({ phase: 'busy', text: 'Downloading the latest shadowmountplus.elf…' });
    const result = await smp.tools.downloadPayload();
    if (result.ok && result.path) {
      setElfPath(result.path);
      setStatus({ phase: 'idle' });
    } else {
      setStatus({ phase: 'failed', message: result.error ?? 'Download failed' });
    }
  };

  const send = async () => {
    const host = (hostInput || props.settings?.ps5.host || '').trim();
    if (!host) {
      setStatus({ phase: 'failed', message: 'Enter the console IP address first.' });
      return;
    }
    if (!elfPath) {
      setStatus({ phase: 'failed', message: 'Pick a payload file or download it first.' });
      return;
    }
    const port = props.settings?.ps5.port || 9021;
    setStatus({ phase: 'connecting' });
    try {
      const { sendId } = await smp.send.payload({ host, port, elfPath });
      setActiveId(sendId);
      if (props.settings) {
        const recent = [host, ...(props.settings.recentHosts ?? []).filter((item) => item !== host)].slice(0, 5);
        props.onChange({ ps5: { host, port }, recentHosts: recent });
      }
    } catch (error) {
      setStatus({ phase: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const cancel = () => {
    if (activeId) void smp.send.cancel(activeId);
  };

  const busy =
    status.phase === 'busy' || status.phase === 'connecting' || (status.phase === 'sending' && status.total >= 0 && activeId !== null);

  return (
    <div className="view">
      <div className="view-head">
        <h1>Send payload</h1>
        <p className="sub">
          Transfer <code>shadowmountplus.elf</code> to a jailbroken console running a payload listener on port 9021.
        </p>
      </div>

      <div className="card">
        <div className="field">
          <label>Console address</label>
          <div className="pathfield">
            <input
              type="text"
              className="mono"
              value={hostInput || props.settings?.ps5.host || ''}
              placeholder="192.168.1.42"
              spellCheck={false}
              onChange={(event) => setHostInput(event.target.value)}
            />
          </div>
          {(props.settings?.recentHosts?.length ?? 0) > 0 && (
            <div className="chip-row">
              {props.settings?.recentHosts.map((recent) => (
                <button key={recent} type="button" className="struct-badge chip" onClick={() => setHostInput(recent)}>
                  {recent}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <label>Port</label>
          <input
            type="number"
            value={props.settings?.ps5.port ?? 9021}
            min={1}
            max={65535}
            onChange={(event) =>
              props.onChange({ ps5: { host: hostInput || props.settings?.ps5.host || '', port: Number(event.target.value) || 9021 } })
            }
          />
          <div className="field-hint">The default listener port for PS5 payload senders is 9021.</div>
        </div>

        <PathField
          label="Payload file (shadowmountplus.elf)"
          value={elfPath}
          kind="file"
          dialogTitle="Select shadowmountplus.elf"
          filters={[{ name: 'ELF payload', extensions: ['elf'] }]}
          placeholder="downloaded automatically on demand"
          onChange={setElfPath}
        />
        <div className="run-row">
          <button type="button" className="btn" onClick={() => void downloadPayload()}>
            Download latest payload
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void send()}>
            Send to console
          </button>
          {busy && status.phase !== 'busy' && (
            <button type="button" className="btn danger" onClick={cancel}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {status.phase === 'busy' && <Callout tone="info">{status.text}</Callout>}
      {status.phase === 'connecting' && <Callout tone="info">Connecting to the console…</Callout>}
      {status.phase === 'sending' && (
        <div className="card">
          <div className="progress-track">
            {status.total > 0 && (
              <div className="progress-fill" style={{ width: `${Math.min(100, (status.sent / status.total) * 100)}%` }} />
            )}
          </div>
          <p className="field-hint">
            Transferred {formatBytes(status.sent)}
            {status.total > 0 ? ` of ${formatBytes(status.total)}` : ''}
          </p>
        </div>
      )}
      {status.phase === 'done' && (
        <Callout tone="info" title="Sent">
          The payload was transferred ({formatBytes(status.sent)}). Wait for the ShadowMount+ notification on the
          console.
        </Callout>
      )}
      {status.phase === 'cancelled' && <Callout tone="warn">Transfer cancelled.</Callout>}
      {status.phase === 'failed' && <Callout tone="error" title="Transfer failed">{status.message}</Callout>}

      <div className="card">
        <h2>Tips</h2>
        <ul className="steps plain-list">
          <li>The console must be jailbroken with a payload listener active (for example via the browser exploit or an autoloaded listener).</li>
          <li>If the connection times out, re-run the exploit on the console — listeners are per-boot unless autoloaded.</li>
          <li>For automatic startup on every boot, add the payload to <code>autoload.txt</code> with plk-autoloader.</li>
        </ul>
      </div>
    </div>
  );
}
