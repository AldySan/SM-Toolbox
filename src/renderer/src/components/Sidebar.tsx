// SPDX-License-Identifier: GPL-3.0-or-later
import type { ReactNode } from 'react';

export interface SidebarItem {
  id: string;
  label: string;
  icon: ReactNode;
}

export function Sidebar(props: {
  items: SidebarItem[];
  active: string;
  onSelect: (id: string) => void;
  footer?: ReactNode;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { collapsed } = props;
  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`} data-collapsed={collapsed}>
      <div className="sidebar-brand">
        <span className="brand-mark" title="SM+ Toolbox">
          SM+
        </span>
        {!collapsed && <span className="brand-name">Toolbox</span>}
        <button
          type="button"
          className="sidebar-toggle"
          onClick={props.onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M10 3.5 5.5 8l4.5 4.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <nav className="sidebar-nav">
        {props.items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item${props.active === item.id ? ' active' : ''}`}
            aria-current={props.active === item.id}
            title={collapsed ? item.label : undefined}
            onClick={() => props.onSelect(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
      {props.footer && <div className="sidebar-foot">{props.footer}</div>}
    </aside>
  );
}
