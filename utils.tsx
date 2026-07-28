/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { ChannelStore, Constants, GuildStore, RestAPI, UserStore } from "@webpack/common";

import { LogEntry, ProgressState } from "./ui/ProgressView";

const logger = new Logger("rmcord", "#5865f2");

const SEARCH_DELAY = 10000;
const DELETE_DELAY = 600;
const MAX_RETRY = 3;
const DISCORD_EPOCH = 1420070400000n;
const COOLDOWN_ITERATIONS = 5;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export const MESSAGE_TYPES = ["text", "image", "video", "link", "embed", "sound", "file", "sticker"] as const;
export type MessageType = typeof MESSAGE_TYPES[number];

export interface FilterConfig {
    dateFrom: string | null;
    dateTo: string | null;
    types: Set<MessageType>;
    regex: string | null;
    regexMode: "include" | "exclude";
}

export function defaultFilters(): FilterConfig {
    return {
        dateFrom: null,
        dateTo: null,
        types: new Set(MESSAGE_TYPES),
        regex: null,
        regexMode: "include",
    };
}

export interface DeletionController {
    isPaused: () => boolean;
    isStopped: () => boolean;
    updateProgress: (updater: (prev: ProgressState) => ProgressState) => void;
}

function dateToSnowflake(dateStr: string): string {
    const snowflake = (BigInt(new Date(dateStr).getTime()) - DISCORD_EPOCH) << 22n;
    return snowflake.toString();
}

function messageMatchesTypes(msg: any, types: Set<MessageType>): boolean {
    if (types.size === MESSAGE_TYPES.length) return true;

    const content: string = msg.content || "";
    const attachments: any[] = msg.attachments || [];
    const embeds: any[] = msg.embeds || [];
    const stickers: any[] = msg.sticker_items || [];

    if (types.has("text") && content.trim().length > 0) return true;
    if (types.has("image") && attachments.some(a => a.content_type?.startsWith("image/"))) return true;
    if (types.has("video") && attachments.some(a => a.content_type?.startsWith("video/"))) return true;
    if (types.has("sound") && attachments.some(a => a.content_type?.startsWith("audio/"))) return true;
    if (types.has("file") && attachments.some(a =>
        a.content_type &&
        !a.content_type.startsWith("image/") &&
        !a.content_type.startsWith("video/") &&
        !a.content_type.startsWith("audio/")
    )) return true;
    if (types.has("link") && /https?:\/\/\S+/.test(content)) return true;
    if (types.has("embed") && embeds.length > 0) return true;
    if (types.has("sticker") && stickers.length > 0) return true;

    return false;
}

function messageMatchesRegex(msg: any, regex: string | null, mode: "include" | "exclude"): boolean {
    if (!regex) return true;
    try {
        const re = new RegExp(regex);
        const matches = re.test(msg.content || "");
        return mode === "include" ? matches : !matches;
    } catch {
        return true;
    }
}

function messageMatchesFilters(msg: any, filters: FilterConfig): boolean {
    if (!messageMatchesTypes(msg, filters.types)) return false;
    if (!messageMatchesRegex(msg, filters.regex, filters.regexMode)) return false;
    return true;
}

function now() {
    return new Date().toLocaleTimeString();
}

function formatEta(ms: number): string {
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return `${minutes}m ${secs}s`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
}

function infoLog(ctrl: DeletionController, msg: string) {
    const entry: LogEntry = { timestamp: now(), status: "info", content: msg };
    ctrl.updateProgress(p => ({ ...p, logs: [...p.logs, entry] }));
}

function messageLog(
    ctrl: DeletionController,
    status: "deleted" | "failed",
    msg: any,
    channelId: string,
    guildId: string | null,
) {
    const channel = ChannelStore.getChannel(channelId);
    const guild = guildId ? GuildStore.getGuild(guildId) : null;
    const isDM = !guildId;

    let username: string | undefined;
    let userId: string | undefined;
    if (isDM && channel?.recipients?.[0]) {
        const recipientId = channel.recipients[0];
        const user = UserStore.getUser(recipientId);
        username = user?.globalName || user?.username || recipientId;
        userId = recipientId;
    }

    const msgDate = msg.timestamp ? new Date(msg.timestamp) : null;

    const entry: LogEntry = {
        timestamp: now(),
        status,
        content: msg.content || (msg.attachments?.length ? "[attachment]" : ""),
        messageTimestamp: msgDate ? msgDate.toLocaleString() : "",
        guildName: guild?.name,
        guildId: guild?.id,
        channelName: channel?.name,
        channelId,
        username,
        userId,
    };

    ctrl.updateProgress(p => ({
        ...p,
        deleted: status === "deleted" ? p.deleted + 1 : p.deleted,
        failed: status === "failed" ? p.failed + 1 : p.failed,
        logs: [...p.logs, entry],
    }));
}

async function waitWhilePaused(ctrl: DeletionController) {
    while (ctrl.isPaused() && !ctrl.isStopped()) {
        await sleep(500);
    }
}

async function searchMessages(
    channelId: string,
    guildId: string | null,
    userId: string,
    offset: number,
    filters: FilterConfig,
) {
    const isDM = !guildId;
    const url = isDM
        ? `/channels/${channelId}/messages/search`
        : `/guilds/${guildId}/messages/search`;

    const query: Record<string, string> = {
        author_id: userId,
        sort_by: "timestamp",
        sort_order: "desc",
        offset: String(offset),
    };
    if (!isDM) query.channel_id = channelId;

    if (filters.dateFrom) query.min_id = dateToSnowflake(filters.dateFrom);
    if (filters.dateTo) query.max_id = dateToSnowflake(filters.dateTo);

    return RestAPI.get({ url, query });
}

type DeleteResult = "ok" | "failed" | "archived";

interface AdaptiveDelays {
    searchDelay: number;
    deleteDelay: number;
    sinceLastThrottle: number;
}

async function tryDeleteMessage(
    channelId: string,
    messageId: string,
    delays: AdaptiveDelays,
    ctrl: DeletionController,
): Promise<DeleteResult> {
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
        try {
            await RestAPI.del({
                url: Constants.Endpoints.MESSAGE(channelId, messageId),
            });
            return "ok";
        } catch (err: any) {
            const status = err?.status ?? err?.response?.status;
            const retryAfter = err?.body?.retry_after ?? err?.response?.body?.retry_after;
            const errorCode = err?.body?.code ?? err?.response?.body?.code;

            if (status === 400 && errorCode === 50083) {
                infoLog(ctrl, "Thread is archived, skipping message.");
                return "archived";
            }

            if (status === 429) {
                const wait = (retryAfter || 2) * 1000;
                delays.deleteDelay = Math.max(delays.deleteDelay, wait);
                delays.sinceLastThrottle = 0;
                infoLog(ctrl, `Rate limited, waiting ${(wait / 1000).toFixed(1)}s. Delete delay raised to ${delays.deleteDelay}ms.`);
                await sleep(wait * 2);
                continue;
            }

            if (attempt < MAX_RETRY - 1) {
                infoLog(ctrl, `Delete failed (${status ?? "unknown"}), retrying... (${attempt + 1}/${MAX_RETRY})`);
                await sleep(delays.deleteDelay);
            }
        }
    }
    return "failed";
}

function maybeRecoverDelays(delays: AdaptiveDelays) {
    delays.sinceLastThrottle++;
    if (delays.sinceLastThrottle >= COOLDOWN_ITERATIONS) {
        if (delays.searchDelay > SEARCH_DELAY) {
            delays.searchDelay = Math.max(SEARCH_DELAY, Math.floor(delays.searchDelay * 0.7));
        }
        if (delays.deleteDelay > DELETE_DELAY) {
            delays.deleteDelay = Math.max(DELETE_DELAY, Math.floor(delays.deleteDelay * 0.7));
        }
        delays.sinceLastThrottle = 0;
    }
}

async function deleteChannelMessages(
    channelId: string,
    guildId: string | null,
    channelLabel: string,
    userId: string,
    filters: FilterConfig,
    delays: AdaptiveDelays,
    ctrl: DeletionController,
) {
    let offset = 0;
    let totalCounted = false;
    let channelTotal = 0;
    let channelDeleted = 0;
    const channelStart = Date.now();

    ctrl.updateProgress(p => ({ ...p, currentChannel: channelLabel, channelEta: null }));
    infoLog(ctrl, `Searching ${channelLabel}...`);

    while (!ctrl.isStopped()) {
        await waitWhilePaused(ctrl);

        let data: any;
        try {
            const res = await searchMessages(channelId, guildId, userId, offset, filters);
            data = res.body;
        } catch (err: any) {
            const status = err?.status ?? err?.response?.status;
            const retryAfter = err?.body?.retry_after ?? err?.response?.body?.retry_after;

            if (status === 429) {
                const wait = (retryAfter || 2) * 1000;
                delays.searchDelay += wait;
                delays.sinceLastThrottle = 0;
                infoLog(ctrl, `Search rate limited, waiting ${(wait / 1000).toFixed(1)}s. Search delay raised to ${delays.searchDelay}ms.`);
                await sleep(wait * 2);
                continue;
            }
            if (status === 202) {
                infoLog(ctrl, "Channel not indexed yet, waiting...");
                await sleep(5000);
                continue;
            }
            logger.error("Search error", { status, err });
            infoLog(ctrl, `Search error (${status ?? "unknown"}), skipping ${channelLabel}.`);
            break;
        }

        const total = data.total_results ?? 0;
        if (!data.messages?.length) {
            if (total > 0) {
                infoLog(ctrl, `Search index updating (${total} results pending), waiting...`);
                await sleep(delays.searchDelay);
                continue;
            }
            infoLog(ctrl, `No more messages in ${channelLabel}.`);
            break;
        }

        if (!totalCounted) {
            channelTotal = total;
            ctrl.updateProgress(p => ({ ...p, total: p.total + total }));
            totalCounted = true;
        }

        const hits = data.messages
            .map((group: any[]) => group.find((m: any) => m.hit))
            .filter(Boolean);

        const deletable = hits.filter(
            (m: any) => m.type === 0 || (m.type >= 6 && m.type <= 21),
        );

        const filtered = deletable.filter((m: any) => messageMatchesFilters(m, filters));

        const skipped = hits.length - filtered.length;
        if (skipped > 0) {
            offset += skipped;
            channelTotal -= skipped;
            ctrl.updateProgress(p => ({ ...p, total: Math.max(0, p.total - skipped) }));
        }

        if (filtered.length === 0) {
            if (skipped > 0) {
                infoLog(ctrl, `Skipped ${skipped} filtered/non-deletable messages, next page...`);
                await sleep(delays.searchDelay);
                continue;
            }
            break;
        }

        for (const msg of filtered) {
            if (ctrl.isStopped()) break;
            await waitWhilePaused(ctrl);

            const msgChannelId = msg.channel_id || channelId;
            const result = await tryDeleteMessage(msgChannelId, msg.id, delays, ctrl);

            if (result === "archived") {
                offset++;
                channelTotal--;
                ctrl.updateProgress(p => ({ ...p, total: Math.max(0, p.total - 1) }));
            } else {
                if (result === "ok") channelDeleted++;
                messageLog(ctrl, result === "ok" ? "deleted" : "failed", msg, msgChannelId, guildId);

                if (channelDeleted > 0) {
                    const elapsed = Date.now() - channelStart;
                    const remaining = Math.max(0, channelTotal - channelDeleted);
                    const etaMs = (elapsed / channelDeleted) * remaining;
                    ctrl.updateProgress(p => ({ ...p, channelEta: formatEta(etaMs) }));
                }
            }

            await sleep(delays.deleteDelay);
        }

        maybeRecoverDelays(delays);
        await sleep(delays.searchDelay);
    }

    ctrl.updateProgress(p => ({ ...p, currentChannel: null, channelEta: null }));
}

export async function runDeletion(channelIds: string[], filters: FilterConfig, ctrl: DeletionController) {
    const userId = UserStore.getCurrentUser().id;
    const delays: AdaptiveDelays = {
        searchDelay: SEARCH_DELAY,
        deleteDelay: DELETE_DELAY,
        sinceLastThrottle: 0,
    };

    for (const channelId of channelIds) {
        if (ctrl.isStopped()) break;
        await waitWhilePaused(ctrl);

        const channel = ChannelStore.getChannel(channelId);
        if (!channel) {
            infoLog(ctrl, `Channel ${channelId} not found, skipping.`);
            continue;
        }

        const isDM = !channel.guild_id;
        let channelLabel: string;
        if (isDM) {
            const recipientId = channel.recipients?.[0];
            const user = recipientId ? UserStore.getUser(recipientId) : null;
            channelLabel = `DM > ${user?.globalName || user?.username || "Unknown"}`;
        } else {
            const guild = GuildStore.getGuild(channel.guild_id);
            channelLabel = `${guild?.name || "???"} > #${channel.name}`;
        }

        await deleteChannelMessages(
            channelId,
            channel.guild_id || null,
            channelLabel,
            userId,
            filters,
            delays,
            ctrl,
        );
    }

    if (ctrl.isStopped()) {
        infoLog(ctrl, "Stopped by user.");
    } else {
        infoLog(ctrl, "All done!");
        ctrl.updateProgress(p => ({ ...p, stopped: true }));
    }
}
