// SPDX-License-Identifier: GPL-3.0-or-later
import type { ReactNode } from 'react';

export interface SidebarItem {
  id: string;
  label: string;
  icon: ReactNode;
}

export function Sidebar(props: { items: SidebarItem[]; active: string; onSelect: (id: string) => void; footer?: ReactNode }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">SM+</span>
        <span className="brand-name">Toolbox</span>
      </div>
      <nav className="sidebar-nav">
        {props.items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item${props.active === item.id ? ' active' : ''}`}
            aria-current={props.active === item.id}
            onClick={() => props.onSelect(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {props.footer && <div className="sidebar-foot">{props.footer}</div>}
    </aside>
  );
}
