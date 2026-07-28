/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ChannelToolbarButton } from "@api/HeaderBar";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { useCallback, useEffect, useRef, useState } from "@webpack/common";

import { CloseIcon, TrashIcon } from "./ui/components/icons";
import { DirectMessagesTab } from "./ui/DirectMessagesTab";
import { FiltersPanel } from "./ui/FiltersPanel";
import { GuildsTab } from "./ui/GuildsTab";
import { ImportTab } from "./ui/ImportTab";
import { ProgressState, ProgressView } from "./ui/ProgressView";
import { defaultFilters, DeletionController, FilterConfig, runDeletion } from "./utils";

const logger = new Logger("rmcord", "#5865f2");

type Tab = "guilds" | "direct-messages" | "import";

const emptyProgress: ProgressState = { deleted: 0, failed: 0, total: 0, logs: [], paused: false, stopped: false, channelEta: null, currentChannel: null };


let deletionActive = false;
let deletionProgress: ProgressState = { ...emptyProgress };
let deletionPaused = false;
let deletionStopped = false;
let progressListener: ((p: ProgressState) => void) | null = null;

let scheduledTimer: ReturnType<typeof setTimeout> | null = null;
let scheduledFor: Date | null = null;
let scheduledChannels: string[] = [];
let scheduledFilters: FilterConfig = defaultFilters();
let streamerModeActive = false;

function updateDeletionProgress(updater: (prev: ProgressState) => ProgressState) {
    deletionProgress = updater(deletionProgress);
    globalProgress = !deletionProgress.stopped ? deletionProgress : null;
    rerenderToolbar?.();
    progressListener?.(deletionProgress);
}

function startDeletionEngine(channelIds: string[], filters: FilterConfig) {
    deletionPaused = false;
    deletionStopped = false;
    deletionProgress = { ...emptyProgress };
    deletionActive = true;

    const ctrl: DeletionController = {
        isPaused: () => deletionPaused,
        isStopped: () => deletionStopped,
        updateProgress: updateDeletionProgress,
    };

    runDeletion(channelIds, filters, ctrl).catch(err => {
        logger.error("Deletion crashed:", err);
        updateDeletionProgress(p => ({ ...p, logs: [...p.logs, { timestamp: new Date().toLocaleTimeString(), status: "info" as const, content: `Crashed: ${err?.message || err}` }], stopped: true, paused: false, channelEta: null, currentChannel: null }));
    }).finally(() => {
        deletionActive = false;
        globalProgress = null;
        rerenderToolbar?.();
    });
}

let panelOpen = false;
let panelPos: { x: number; y: number } | null = null;
let setPanelOpenGlobal: ((v: boolean) => void) | null = null;
let globalProgress: ProgressState | null = null;
let rerenderToolbar: (() => void) | null = null;

function Panel({ onClose }: { onClose: () => void; }) {
    const [pos, setPos] = useState(panelPos ?? { x: window.innerWidth - 620, y: window.innerHeight - 560 });
    const dragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const [tab, setTab] = useState<Tab>("guilds");
    const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
    const [filters, setFilters] = useState<FilterConfig>(defaultFilters);
    const [progress, setProgress] = useState<ProgressState>(deletionActive ? deletionProgress : { ...emptyProgress });
    const [isDeleting, setIsDeleting] = useState(deletionActive);

    const [showScheduler, setShowScheduler] = useState(false);
    const [scheduleTime, setScheduleTime] = useState("");
    const [localScheduledFor, setLocalScheduledFor] = useState<Date | null>(scheduledFor);
    const [streamerMode, setStreamerMode] = useState(streamerModeActive);

    const toggleStreamerMode = useCallback(() => {
        streamerModeActive = !streamerModeActive;
        setStreamerMode(streamerModeActive);
    }, []);

    useEffect(() => {
        progressListener = p => {
            setProgress(p);
            if (p.stopped) setIsDeleting(deletionActive);
        };
        return () => { progressListener = null; };
    }, []);

    const onMouseMove = useCallback((e: MouseEvent) => {
        if (!dragging.current) return;
        const next = { x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y };
        panelPos = next;
        setPos(next);
    }, []);

    const onMouseUp = useCallback(() => {
        dragging.current = false;
    }, []);

    useEffect(() => {
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        return () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };
    }, []);

    const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
        dragging.current = true;
        dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    }, [pos]);

    const toggleChannel = useCallback((id: string) => {
        setSelectedChannels(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleAllChannels = useCallback((ids: string[], selected: boolean) => {
        setSelectedChannels(prev => {
            const next = new Set(prev);
            for (const id of ids) {
                if (selected) next.add(id);
                else next.delete(id);
            }
            return next;
        });
    }, []);

    const startDeleting = useCallback(() => {
        if (selectedChannels.size === 0) return;
        setIsDeleting(true);
        setLocalScheduledFor(null);
        setShowScheduler(false);
        scheduledFor = null;
        startDeletionEngine([...selectedChannels], filters);
    }, [selectedChannels, filters]);

    const handleSchedule = () => {
        if (!scheduleTime || selectedChannels.size === 0) return;

        const target = new Date(scheduleTime);
        const delay = target.getTime() - Date.now();
        if (delay <= 0) return;

        scheduledFor = target;
        scheduledChannels = [...selectedChannels];
        scheduledFilters = { ...filters, types: new Set(filters.types) };
        setLocalScheduledFor(target);
        setShowScheduler(false);

        scheduledTimer = setTimeout(() => {
            scheduledTimer = null;
            scheduledFor = null;
            setLocalScheduledFor(null);
            setIsDeleting(true);
            startDeletionEngine(scheduledChannels, scheduledFilters);
        }, delay);
    };

    const cancelSchedule = () => {
        if (scheduledTimer) {
            clearTimeout(scheduledTimer);
            scheduledTimer = null;
        }
        scheduledFor = null;
        setLocalScheduledFor(null);
    };

    const handlePause = () => {
        deletionPaused = true;
        updateDeletionProgress(p => ({ ...p, paused: true, logs: [...p.logs, { timestamp: new Date().toLocaleTimeString(), status: "info" as const, content: "Paused." }] }));
    };

    const handleResume = () => {
        deletionPaused = false;
        updateDeletionProgress(p => ({ ...p, paused: false, logs: [...p.logs, { timestamp: new Date().toLocaleTimeString(), status: "info" as const, content: "Resumed." }] }));
    };

    const handleStop = () => {
        deletionStopped = true;
        deletionPaused = false;
        updateDeletionProgress(p => ({ ...p, stopped: true, paused: false, channelEta: null, currentChannel: null }));
    };

    const handleBack = () => {
        deletionActive = false;
        deletionProgress = { ...emptyProgress };
        globalProgress = null;
        rerenderToolbar?.();
        setIsDeleting(false);
        setSelectedChannels(new Set());
        setProgress({ ...emptyProgress });
    };

    const formatScheduledTime = (d: Date) => {
        return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    };

    return (
        <div className="rmcord-panel" style={{ left: pos.x, top: pos.y }}>
            <div className="rmcord-header" onMouseDown={onHeaderMouseDown}>
                <span className="rmcord-header-title">rmcord</span>
                <button className="rmcord-close-btn" onClick={onClose}>
                    <CloseIcon />
                </button>
            </div>
            <div className="rmcord-body">
                {isDeleting ? (
                    <ProgressView
                        progress={progress}
                        streamerMode={streamerMode}
                        onPause={handlePause}
                        onResume={handleResume}
                        onStop={handleStop}
                        onBack={handleBack}
                        onToggleStreamerMode={toggleStreamerMode}
                    />
                ) : (
                    <>
                        <div className="rmcord-tab-bar">
                            <button className={`rmcord-tab ${tab === "guilds" ? "rmcord-tab-active" : ""}`} onClick={() => setTab("guilds")}>Guilds</button>
                            <button className={`rmcord-tab ${tab === "direct-messages" ? "rmcord-tab-active" : ""}`} onClick={() => setTab("direct-messages")}>Direct Messages</button>
                            <button className={`rmcord-tab ${tab === "import" ? "rmcord-tab-active" : ""}`} onClick={() => setTab("import")}>Import Dump</button>
                        </div>
                        <div className="rmcord-tab-content">
                            {tab === "guilds" && (
                                <GuildsTab
                                    selectedChannels={selectedChannels}
                                    onToggleChannel={toggleChannel}
                                    onToggleAllChannels={toggleAllChannels}
                                />
                            )}
                            {tab === "direct-messages" && (
                                <DirectMessagesTab
                                    selectedChannels={selectedChannels}
                                    onToggleChannel={toggleChannel}
                                    onToggleAllChannels={toggleAllChannels}
                                />
                            )}
                            {tab === "import" && (
                                <ImportTab
                                    selectedChannels={selectedChannels}
                                    onToggleChannel={toggleChannel}
                                    onToggleAllChannels={toggleAllChannels}
                                />
                            )}
                        </div>
                        <FiltersPanel filters={filters} onChange={setFilters} />
                        {localScheduledFor ? (
                            <div className="rmcord-scheduled-bar">
                                <span>Scheduled for {formatScheduledTime(localScheduledFor)}</span>
                                <button className="rmcord-schedule-cancel-btn" onClick={cancelSchedule}>Cancel</button>
                            </div>
                        ) : showScheduler ? (
                            <div className="rmcord-schedule-picker">
                                <input
                                    type="datetime-local"
                                    className="rmcord-filters-date"
                                    value={scheduleTime}
                                    min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                                    onChange={e => setScheduleTime(e.target.value)}
                                />
                                <button
                                    className="rmcord-start-btn rmcord-schedule-confirm-btn"
                                    disabled={!scheduleTime || selectedChannels.size === 0 || new Date(scheduleTime).getTime() <= Date.now()}
                                    onClick={handleSchedule}
                                >
                                    Schedule
                                </button>
                                <button className="rmcord-schedule-back-btn" onClick={() => setShowScheduler(false)}>Back</button>
                            </div>
                        ) : (
                            <div className="rmcord-action-row">
                                <button
                                    className="rmcord-start-btn"
                                    disabled={selectedChannels.size === 0}
                                    onClick={startDeleting}
                                >
                                    Start Mass Deleting
                                </button>
                                <button
                                    className="rmcord-schedule-btn"
                                    disabled={selectedChannels.size === 0}
                                    onClick={() => setShowScheduler(true)}
                                >
                                    Or Schedule
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function ToolbarIcon({ size, color }: { size?: string | number; color?: string; }) {
    const pct = globalProgress && globalProgress.total > 0
        ? Math.round((globalProgress.deleted / globalProgress.total) * 100)
        : null;

    return (
        <div className="rmcord-toolbar-icon">
            <TrashIcon size={size} color={color} />
            {pct !== null && (
                <div className="rmcord-toolbar-progress">
                    <div className="rmcord-toolbar-progress-fill" style={{ width: `${pct}%` }} />
                </div>
            )}
        </div>
    );
}

function ToolbarButton() {
    const [open, setOpen] = useState(panelOpen);
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        setPanelOpenGlobal = setOpen;
        rerenderToolbar = () => forceUpdate(n => n + 1);
        return () => {
            setPanelOpenGlobal = null;
            rerenderToolbar = null;
        };
    }, []);

    useEffect(() => {
        panelOpen = open;
    }, [open]);

    const pct = globalProgress && globalProgress.total > 0
        ? Math.round((globalProgress.deleted / globalProgress.total) * 100)
        : null;

    const tooltip = pct !== null
        ? `Deleting... ${pct}% (${globalProgress!.deleted}/${globalProgress!.total})`
        : open ? "Close rmcord" : "Open rmcord";

    return (
        <>
            <ChannelToolbarButton
                icon={ToolbarIcon}
                tooltip={tooltip}
                onClick={() => setOpen(!open)}
                selected={open}
            />
            {open && <Panel onClose={() => setOpen(false)} />}
        </>
    );
}

export default definePlugin({
    name: "rmcord",
    description: "Bulk delete your Discord messages from a floating panel",
    authors: [{ name: "max", id: 0n }],
    dependencies: ["HeaderBarAPI"],

    headerBarButton: {
        icon: TrashIcon,
        render: () => <ToolbarButton />,
        location: "channeltoolbar" as const,
    },
});
