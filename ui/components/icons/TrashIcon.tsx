/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const TrashIcon = ({ size, color }: { size?: string | number; color?: string; }) => (
    <svg width={typeof size === "number" ? size : 20} height={typeof size === "number" ? size : 20} viewBox="0 0 24 24" fill={color || "currentColor"}>
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
);
