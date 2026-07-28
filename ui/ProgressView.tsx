/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useRef } from "@webpack/common";

export interface LogEntry {
    timestamp: string;
    status: "deleted" | "failed" | "info";
    content?: string;
    messageTimestamp?: string;
    guildName?: string;
    guildId?: string;
    channelName?: string;
    channelId?: string;
    username?: string;
    userId?: string;
}

export interface ProgressState {
    deleted: number;
    failed: number;
    total: number;
    logs: LogEntry[];
    paused: boolean;
    stopped: boolean;
    channelEta: string | null;
    currentChannel: string | null;
}

interface ProgressViewProps {
    progress: ProgressState;
    streamerMode: boolean;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    onBack: () => void;
    onToggleStreamerMode: () => void;
}

function truncate(str: string, len: number) {
    return str.length > len ? str.slice(0, len) + "..." : str;
}

function formatLocation(entry: LogEntry, streamer: boolean) {
    if (entry.username) {
        const name = streamer ? "****" : truncate(entry.username, 5);
        return `DM > ${name}`;
    }
    const guild = streamer ? "****" : truncate(entry.guildName || "???", 5);
    const channel = streamer ? "****" : truncate(entry.channelName || "???", 5);
    return `${guild} > #${channel}`;
}

function formatContent(content: string | undefined, streamer: boolean) {
    if (!content) return "";
    if (streamer) return "********";
    return content.length > 60 ? content.slice(0, 60) + "..." : content;
}

function formatLogLine(entry: LogEntry, streamer: boolean) {
    if (entry.status === "info") return `[${entry.timestamp}] ${entry.content || ""}`;

    const loc = formatLocation(entry, streamer);
    const content = formatContent(entry.content, streamer);
    const msgTime = entry.messageTimestamp || "";
    const prefix = entry.status === "deleted" ? "DEL" : "FAIL";

    return `[${entry.timestamp}] ${prefix} ${loc} | ${msgTime} | ${content}`;
}

function buildExportText(logs: LogEntry[]) {
    const lines: string[] = [];
    const seen = new Map<string, boolean>();

    lines.push("=== rmcord Deletion Log ===");
    lines.push(`Exported: ${new Date().toLocaleString()}`);
    lines.push("");

    lines.push("--- Locations ---");
    for (const entry of logs) {
        if (entry.status === "info") continue;

        if (entry.guildName && entry.guildId && !seen.has(`g:${entry.guildId}`)) {
            seen.set(`g:${entry.guildId}`, true);
            lines.push(`Guild: ${truncate(entry.guildName, 5)} - ${entry.guildName} - ${entry.guildId}`);
        }
        if (entry.channelName && entry.channelId && !seen.has(`c:${entry.channelId}`)) {
            seen.set(`c:${entry.channelId}`, true);
            lines.push(`Channel: ${truncate(entry.channelName, 5)} - ${entry.channelName} - ${entry.channelId}`);
        }
        if (entry.username && entry.userId && !seen.has(`u:${entry.userId}`)) {
            seen.set(`u:${entry.userId}`, true);
            lines.push(`User: ${truncate(entry.username, 5)} - ${entry.username} - ${entry.userId}`);
        }
    }

    lines.push("");
    lines.push("--- Messages ---");
    for (const entry of logs) {
        lines.push(formatLogLine(entry, false));
    }

    return lines.join("\n");
}

function downloadTextFile(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function ProgressView({ progress, streamerMode, onPause, onResume, onStop, onBack, onToggleStreamerMode }: ProgressViewProps) {
    const logBoxRef = useRef<HTMLDivElement>(null);
    const pct = progress.total > 0 ? Math.round((progress.deleted / progress.total) * 100) : 0;

    useEffect(() => {
        if (logBoxRef.current) {
            logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
        }
    }, [progress.logs.length]);

    const handleExport = () => {
        const text = buildExportText(progress.logs);
        const date = new Date().toISOString().slice(0, 10);
        downloadTextFile(text, `rmcord-${date}.txt`);
    };

    return (
        <div className="rmcord-progress-view">
            <div className="rmcord-progress-pct">{pct}%</div>
            <div className="rmcord-progress-bar-track">
                <div className="rmcord-progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="rmcord-progress-stats">
                <div>{progress.deleted} deleted / {progress.failed} failed / {progress.total} total</div>
                {progress.currentChannel && progress.channelEta && (
                    <div>{streamerMode ? "Current channel" : progress.currentChannel}: ~{progress.channelEta} remaining</div>
                )}
            </div>
            <div className="rmcord-progress-controls">
                {!progress.stopped && (
                    <button
                        className="rmcord-control-btn rmcord-pause-btn"
                        onClick={progress.paused ? onResume : onPause}
                    >
                        {progress.paused ? "Resume" : "Pause"}
                    </button>
                )}
                {!progress.stopped ? (
                    <button className="rmcord-control-btn rmcord-stop-btn" onClick={onStop}>
                        Stop
                    </button>
                ) : (
                    <button className="rmcord-control-btn rmcord-back-btn" onClick={onBack}>
                        Go Back
                    </button>
                )}
                <button
                    className={`rmcord-control-btn ${streamerMode ? "rmcord-streamer-btn-active" : "rmcord-streamer-btn"}`}
                    onClick={onToggleStreamerMode}
                    title="Toggle streamer mode"
                >
                    {streamerMode ? "Streamer: On" : "Streamer: Off"}
                </button>
                <button className="rmcord-control-btn rmcord-export-btn" onClick={handleExport}>
                    Export
                </button>
            </div>
            <div className="rmcord-log-box" ref={logBoxRef}>
                {progress.logs.map((entry, i) => (
                    <div key={i} className={`rmcord-log-line ${entry.status === "failed" ? "rmcord-log-fail" : ""}`}>
                        {formatLogLine(entry, streamerMode)}
                    </div>
                ))}
            </div>
        </div>
    );
}
