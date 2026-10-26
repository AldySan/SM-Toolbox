// SPDX-License-Identifier: GPL-3.0-or-later
import { smp } from '../lib/api';
import type { FileFilter } from '../../../shared/types';

export function PathField(props: {
  label: string;
  value: string;
  placeholder?: string;
  kind?: 'folder' | 'file' | 'save';
  filters?: FileFilter[];
  dialogTitle?: string;
  defaultName?: string;
  onChange: (path: string) => void;
  hint?: string;
}) {
  const kind = props.kind ?? 'folder';

  const browse = async () => {
    let picked: string | null = null;
    if (kind === 'folder') {
      picked = await smp.dialogs.pickFolder(props.dialogTitle);
    } else if (kind === 'file') {
      picked = await smp.dialogs.pickFile({ title: props.dialogTitle, filters: props.filters });
    } else {
      picked = await smp.dialogs.pickSave({
        title: props.dialogTitle,
        filters: props.filters,
        defaultPath: props.defaultName,
      });
    }
    if (picked) props.onChange(picked);
  };

  return (
    <div className="field">
      <label>{props.label}</label>
      <div className="pathfield">
        <input
          type="text"
          className="mono"
          value={props.value}
          placeholder={props.placeholder ?? 'Not set'}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => props.onChange(event.target.value)}
        />
        <button type="button" className="btn" onClick={() => void browse()}>
          Browse…
        </button>
      </div>
      {props.hint && <div className="field-hint">{props.hint}</div>}
    </div>
  );
}
