/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, GuildChannelStore, GuildStore, useCallback, useMemo, useState } from "@webpack/common";

import { Checkbox } from "./components/Checkbox";

interface GuildsTabProps {
    selectedChannels: Set<string>;
    onToggleChannel: (id: string) => void;
    onToggleAllChannels: (channelIds: string[], selected: boolean) => void;
}

function getGuildTextChannels(guildId: string) {
    return GuildChannelStore.getSelectableChannels(guildId)
        .map(c => ChannelStore.getChannel(c.channel.id))
        .filter(Boolean)
        .filter(c => c.type === 0 || c.type === 5);
}

export function GuildsTab({ selectedChannels, onToggleChannel, onToggleAllChannels }: GuildsTabProps) {
    const [activeGuildId, setActiveGuildId] = useState<string | null>(null);
    const [guildSearch, setGuildSearch] = useState("");
    const [channelSearch, setChannelSearch] = useState("");

    const guilds = useMemo(() => {
        return GuildStore.getGuildsArray().sort((a, b) => a.name.localeCompare(b.name));
    }, []);

    const filteredGuilds = useMemo(() => {
        if (!guildSearch) return guilds;
        const q = guildSearch.toLowerCase();
        return guilds.filter(g => g.name.toLowerCase().includes(q));
    }, [guilds, guildSearch]);

    const activeChannels = useMemo(() => {
        if (!activeGuildId) return [];
        return getGuildTextChannels(activeGuildId);
    }, [activeGuildId]);

    const filteredChannels = useMemo(() => {
        if (!channelSearch) return activeChannels;
        const q = channelSearch.toLowerCase();
        return activeChannels.filter(c => c.name.toLowerCase().includes(q));
    }, [activeChannels, channelSearch]);

    const selectedGuildCount = useMemo(() => {
        const guildIds = new Set<string>();
        for (const chId of selectedChannels) {
            const ch = ChannelStore.getChannel(chId);
            if (ch?.guild_id) guildIds.add(ch.guild_id);
        }
        return guildIds.size;
    }, [selectedChannels]);

    const isGuildSelected = useCallback((guildId: string) => {
        const channels = getGuildTextChannels(guildId);
        return channels.length > 0 && channels.every(c => selectedChannels.has(c.id));
    }, [selectedChannels]);

    const isGuildIndeterminate = useCallback((guildId: string) => {
        const channels = getGuildTextChannels(guildId);
        if (channels.length === 0) return false;
        const some = channels.some(c => selectedChannels.has(c.id));
        const all = channels.every(c => selectedChannels.has(c.id));
        return some && !all;
    }, [selectedChannels]);

    const toggleGuild = useCallback((guildId: string) => {
        const channels = getGuildTextChannels(guildId);
        const allSelected = channels.every(c => selectedChannels.has(c.id));
        onToggleAllChannels(channels.map(c => c.id), !allSelected);
    }, [selectedChannels, onToggleAllChannels]);

    const guildIcon = (guild: any) => {
        if (!guild.icon) return null;
        return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=32`;
    };

    const allChannelsSelected = filteredChannels.length > 0 && filteredChannels.every(c => selectedChannels.has(c.id));

    const toggleAllChannels = () => {
        onToggleAllChannels(filteredChannels.map(c => c.id), !allChannelsSelected);
    };

    const allGuildsSelected = filteredGuilds.length > 0 && filteredGuilds.every(g => isGuildSelected(g.id));

    const toggleAllGuilds = () => {
        const allChannelIds = filteredGuilds.flatMap(g => getGuildTextChannels(g.id).map(c => c.id));
        onToggleAllChannels(allChannelIds, !allGuildsSelected);
    };

    return (
        <div className="rmcord-guilds-tab">
            <div className="rmcord-guilds-left">
                <div className="rmcord-search-row">
                    <input
                        className="rmcord-search"
                        placeholder="Search guilds..."
                        value={guildSearch}
                        onChange={e => setGuildSearch(e.target.value)}
                    />
                    <button className="rmcord-toggle-all" onClick={toggleAllGuilds}>
                        {allGuildsSelected ? "Deselect All" : "Select All"}
                    </button>
                </div>
                <div className="rmcord-list">
                    {filteredGuilds.map(guild => (
                        <div
                            key={guild.id}
                            className={`rmcord-list-item rmcord-guild-item ${activeGuildId === guild.id ? "rmcord-active" : ""}`}
                            onClick={() => setActiveGuildId(guild.id)}
                        >
                            <Checkbox
                                checked={isGuildSelected(guild.id)}
                                indeterminate={isGuildIndeterminate(guild.id)}
                                onChange={() => toggleGuild(guild.id)}
                            />
                            {guildIcon(guild)
                                ? <img className="rmcord-guild-icon" src={guildIcon(guild)!} alt="" />
                                : <div className="rmcord-guild-icon rmcord-guild-icon-fallback">{guild.name[0]}</div>
                            }
                            <span className="rmcord-item-name">{guild.name}</span>
                        </div>
                    ))}
                </div>
                <div className="rmcord-status-bar">{selectedGuildCount} guild(s) selected</div>
            </div>
            <div className="rmcord-guilds-right">
                <div className="rmcord-search-row">
                    <input
                        className="rmcord-search"
                        placeholder="Search channels..."
                        value={channelSearch}
                        onChange={e => setChannelSearch(e.target.value)}
                    />
                    <button className="rmcord-toggle-all" onClick={toggleAllChannels}>
                        {allChannelsSelected ? "Deselect All" : "Select All"}
                    </button>
                </div>
                <div className="rmcord-list">
                    {activeGuildId ? (
                        filteredChannels.length > 0 ? filteredChannels.map(channel => (
                            <div key={channel.id} className="rmcord-list-item rmcord-channel-item" onClick={() => onToggleChannel(channel.id)}>
                                <Checkbox
                                    checked={selectedChannels.has(channel.id)}
                                    onChange={() => onToggleChannel(channel.id)}
                                />
                                <span className="rmcord-item-name">#{channel.name}</span>
                            </div>
                        )) : <div className="rmcord-empty">No channels found</div>
                    ) : <div className="rmcord-empty">Select a guild</div>}
                </div>
                <div className="rmcord-status-bar">{selectedChannels.size} channel(s) selected</div>
            </div>
        </div>
    );
}
