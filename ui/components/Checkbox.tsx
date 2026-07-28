/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

interface CheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}

export function Checkbox({ checked, indeterminate, onChange }: CheckboxProps) {
  const active = checked || indeterminate;
  return (
    <div
      className={`rmcord-checkbox ${active ? "rmcord-checkbox-checked" : ""}`}
      onClick={e => { e.stopPropagation(); onChange(); }}
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
    >
      {checked && (
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#fff" d="M8.99991 16.17L4.82991 12L3.40991 13.41L8.99991 19L20.9999 7.00003L19.5899 5.59003L8.99991 16.17Z" />
        </svg>
      )}
      {!checked && indeterminate && (
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#fff" d="M5 11h14v2H5z" />
        </svg>
      )}
    </div>
  );
}
