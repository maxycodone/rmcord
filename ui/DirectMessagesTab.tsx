/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, useMemo, UserStore, useState } from "@webpack/common";

import { Checkbox } from "./components/Checkbox";

interface DirectMessagesTabProps {
    selectedChannels: Set<string>;
    onToggleChannel: (id: string) => void;
    onToggleAllChannels: (channelIds: string[], selected: boolean) => void;
}

export function DirectMessagesTab({ selectedChannels, onToggleChannel, onToggleAllChannels }: DirectMessagesTabProps) {
    const [search, setSearch] = useState("");

    const dmChannels = useMemo(() => {
        return ChannelStore.getSortedPrivateChannels().filter(c => c.type === 1);
    }, []);

    const filteredDMs = useMemo(() => {
        if (!search) return dmChannels;
        const q = search.toLowerCase();
        return dmChannels.filter(c => {
            const userId = c.recipients?.[0];
            if (!userId) return false;
            const user = UserStore.getUser(userId);
            if (!user) return false;
            const name = (user.globalName || user.username || "").toLowerCase();
            return name.includes(q) || user.username.toLowerCase().includes(q);
        });
    }, [dmChannels, search]);

    const allSelected = filteredDMs.length > 0 && filteredDMs.every(c => selectedChannels.has(c.id));

    const toggleAll = () => {
        onToggleAllChannels(filteredDMs.map(c => c.id), !allSelected);
    };

    const avatarUrl = (user: any) => {
        if (!user?.avatar) return null;
        return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=32`;
    };

    return (
        <div className="rmcord-dms-tab">
            <div className="rmcord-search-row">
                <input
                    className="rmcord-search"
                    placeholder="Search DMs..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <button className="rmcord-toggle-all" onClick={toggleAll}>
                    {allSelected ? "Deselect All" : "Select All"}
                </button>
            </div>
            <div className="rmcord-list">
                {filteredDMs.length > 0 ? filteredDMs.map(channel => {
                    const userId = channel.recipients?.[0];
                    if (!userId) return null;
                    const user = UserStore.getUser(userId);
                    if (!user) return null;
                    const displayName = user.globalName || user.username;
                    return (
                        <div key={channel.id} className="rmcord-list-item rmcord-dm-item" onClick={() => onToggleChannel(channel.id)}>
                            <Checkbox
                                checked={selectedChannels.has(channel.id)}
                                onChange={() => onToggleChannel(channel.id)}
                            />
                            {avatarUrl(user)
                                ? <img className="rmcord-dm-avatar" src={avatarUrl(user)!} alt="" />
                                : <div className="rmcord-dm-avatar rmcord-avatar-fallback">{displayName[0]}</div>
                            }
                            <span className="rmcord-item-name">
                                {displayName}
                                {user.globalName && <span className="rmcord-username"> ({user.username})</span>}
                            </span>
                        </div>
                    );
                }) : <div className="rmcord-empty">No conversations found</div>}
            </div>
            <div className="rmcord-status-bar">{selectedChannels.size} conversation(s) selected</div>
        </div>
    );
}
