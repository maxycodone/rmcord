/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState } from "@webpack/common";

import { FilterConfig, MESSAGE_TYPES, MessageType } from "../utils";

interface FiltersPanelProps {
    filters: FilterConfig;
    onChange: (filters: FilterConfig) => void;
}

const TYPE_ICONS: Record<MessageType, { label: string; path: string; }> = {
    text: { label: "Text", path: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" },
    image: { label: "Image", path: "M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-5.5z" },
    video: { label: "Video", path: "M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z" },
    link: { label: "Link", path: "M3.9 12a3.1 3.1 0 013.1-3.1h4V7H7a5 5 0 000 10h4v-1.9H7A3.1 3.1 0 013.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 010 6.2h-4V17h4a5 5 0 000-10z" },
    embed: { label: "Embed", path: "M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" },
    sound: { label: "Sound", path: "M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" },
    file: { label: "File", path: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" },
    sticker: { label: "Sticker", path: "M21.796 9.982a1.005 1.005 0 00-.778-.399 7.676 7.676 0 01-1.093-.125c-2.145-.436-3.552-1.91-3.927-2.321V3a1 1 0 00-1-1H3a1 1 0 00-1 1v14a1 1 0 001 1h4.145c.19.445.477.86.856 1.2l.245.216A6 6 0 0012.196 21h.053c3.26-.043 5.752-2.796 5.752-6.354a1.52 1.52 0 01.106-.399 4.381 4.381 0 001.553-.628 6.145 6.145 0 001.783-1.724 1.005 1.005 0 00.353-.913z" },
};

export function FiltersPanel({ filters, onChange }: FiltersPanelProps) {
    const [open, setOpen] = useState(false);

    const setDateFrom = (v: string) => onChange({ ...filters, dateFrom: v || null });
    const setDateTo = (v: string) => onChange({ ...filters, dateTo: v || null });
    const setRegex = (v: string) => onChange({ ...filters, regex: v || null });
    const setRegexMode = (mode: "include" | "exclude") => onChange({ ...filters, regexMode: mode });

    const toggleType = (t: MessageType) => {
        const next = new Set(filters.types);
        if (next.has(t)) next.delete(t);
        else next.add(t);
        onChange({ ...filters, types: next });
    };

    let regexError = "";
    if (filters.regex) {
        try {
            new RegExp(filters.regex);
        } catch {
            regexError = "Invalid regex";
        }
    }

    const hasActiveFilters = filters.dateFrom || filters.dateTo || filters.regex || filters.types.size < MESSAGE_TYPES.length;

    return (
        <div className="rmcord-filters">
            <button className="rmcord-filters-toggle" onClick={() => setOpen(!open)}>
                <svg
                    className={`rmcord-filters-chevron ${open ? "rmcord-filters-chevron-open" : ""}`}
                    width="12" height="12" viewBox="0 0 24 24" fill="currentColor"
                >
                    <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                </svg>
                <span>Filters</span>
                {hasActiveFilters && <span className="rmcord-filters-badge" />}
            </button>
            {open && (
                <div className="rmcord-filters-body">
                    <div className="rmcord-filters-section">
                        <div className="rmcord-filters-label">Date Range</div>
                        <div className="rmcord-filters-date-row">
                            <label className="rmcord-filters-date-label">
                                From
                                <input
                                    type="datetime-local"
                                    className="rmcord-filters-date"
                                    value={filters.dateFrom || ""}
                                    onChange={e => setDateFrom(e.target.value)}
                                />
                            </label>
                            <label className="rmcord-filters-date-label">
                                To
                                <input
                                    type="datetime-local"
                                    className="rmcord-filters-date"
                                    value={filters.dateTo || ""}
                                    onChange={e => setDateTo(e.target.value)}
                                />
                            </label>
                        </div>
                    </div>
                    <div className="rmcord-filters-section">
                        <div className="rmcord-filters-label">Message Types</div>
                        <div className="rmcord-filters-types">
                            {MESSAGE_TYPES.map(t => (
                                <button
                                    key={t}
                                    className={`rmcord-filters-type-btn ${filters.types.has(t) ? "rmcord-filters-type-active" : ""}`}
                                    onClick={() => toggleType(t)}
                                    title={TYPE_ICONS[t].label}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d={TYPE_ICONS[t].path} />
                                    </svg>
                                    <span>{TYPE_ICONS[t].label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="rmcord-filters-section">
                        <div className="rmcord-filters-label">Regex</div>
                        <div className="rmcord-filters-regex-row">
                            <input
                                className="rmcord-search"
                                placeholder="Pattern..."
                                value={filters.regex || ""}
                                onChange={e => setRegex(e.target.value)}
                            />
                            <button
                                className={`rmcord-filters-mode-btn ${filters.regexMode === "include" ? "rmcord-filters-mode-active" : ""}`}
                                onClick={() => setRegexMode("include")}
                            >
                                Include
                            </button>
                            <button
                                className={`rmcord-filters-mode-btn ${filters.regexMode === "exclude" ? "rmcord-filters-mode-active" : ""}`}
                                onClick={() => setRegexMode("exclude")}
                            >
                                Exclude
                            </button>
                        </div>
                        {regexError && <div className="rmcord-filters-regex-error">{regexError}</div>}
                    </div>
                </div>
            )}
        </div>
    );
}
