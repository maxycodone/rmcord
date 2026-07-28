/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useCallback, useState } from "@webpack/common";

import { Checkbox } from "./components/Checkbox";

export interface ImportedChannel {
    id: string;
    name: string;
}

interface ImportTabProps {
    selectedChannels: Set<string>;
    onToggleChannel: (id: string) => void;
    onToggleAllChannels: (channelIds: string[], selected: boolean) => void;
}

export function ImportTab({ selectedChannels, onToggleChannel, onToggleAllChannels }: ImportTabProps) {
    const [channels, setChannels] = useState<ImportedChannel[]>([]);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");

    const parseFile = useCallback(async (file: File) => {
        setError("");
        try {
            const text = await file.text();
            const json = JSON.parse(text);

            if (typeof json === "object" && !Array.isArray(json)) {
                const parsed: ImportedChannel[] = Object.entries(json).map(
                    ([id, name]) => ({ id, name: String(name) }),
                );
                if (parsed.length === 0) {
                    setError("No channels found in file.");
                    return;
                }
                setChannels(parsed);
            } else {
                setError("Invalid format. Expected messages/index.json from your Discord data package.");
            }
        } catch {
            setError("Failed to parse file. Make sure it's a valid JSON file.");
        }
    }, []);

    const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) parseFile(file);
    }, [parseFile]);

    const filtered = search
        ? channels.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.id.includes(search))
        : channels;

    const importedSelected = filtered.filter(c => selectedChannels.has(c.id));
    const allSelected = filtered.length > 0 && importedSelected.length === filtered.length;

    const toggleAll = () => {
        onToggleAllChannels(filtered.map(c => c.id), !allSelected);
    };

    if (channels.length === 0) {
        return (
            <div className="rmcord-import-tab">
                <div className="rmcord-import-zone">
                    <div className="rmcord-import-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm4 18H6V4h7v5h5v11zm-3-7v4h-2v-4H9l4-4 4 4h-4z" />
                        </svg>
                    </div>
                    <div className="rmcord-import-text">
                        Import your Discord data package
                    </div>
                    <div className="rmcord-import-subtext">
                        Select messages/index.json from your data package
                    </div>
                    <div className="rmcord-import-subtext">
                        (Settings &gt; Privacy &gt; Request Data)
                    </div>
                    <label className="rmcord-browse-btn">
                        Select File
                        <input type="file" accept=".json" onChange={onFileInput} style={{ display: "none" }} />
                    </label>
                </div>
                {error && <div className="rmcord-import-error">{error}</div>}
            </div>
        );
    }

    return (
        <div className="rmcord-import-tab">
            <div className="rmcord-search-row">
                <input
                    className="rmcord-search"
                    placeholder="Search channels..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <button className="rmcord-toggle-all" onClick={toggleAll}>
                    {allSelected ? "Deselect All" : "Select All"}
                </button>
            </div>
            <div className="rmcord-list">
                {filtered.map(channel => (
                    <div key={channel.id} className="rmcord-list-item" onClick={() => onToggleChannel(channel.id)}>
                        <Checkbox
                            checked={selectedChannels.has(channel.id)}
                            onChange={() => onToggleChannel(channel.id)}
                        />
                        <span className="rmcord-item-name">{channel.name || channel.id}</span>
                        <span className="rmcord-username"> ({channel.id})</span>
                    </div>
                ))}
            </div>
            <div className="rmcord-status-bar">
                {channels.length} channels imported, {importedSelected.length} selected
            </div>
        </div>
    );
}
