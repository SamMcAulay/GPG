/**
 * Manages auto-updating M+ leaderboard embeds.
 *
 * On boot, restores update loops for all persisted leaderboards.
 * Each leaderboard refreshes every 10 minutes by fetching fresh data
 * from Raider.IO and editing the Discord message in place.
 *
 * If a message is deleted or the channel is inaccessible, the
 * leaderboard row is removed from the database and the loop stops.
 */

import type { Client } from 'discord.js';
import {
    getAllLeaderboards,
    deleteLeaderboard,
    type Leaderboard,
} from '../database/leaderboardRepository';
import { fetchGuildMythicPlus } from '../raiderio/guild';
import { buildLeaderboardEmbed } from '../utils/leaderboardEmbed';

const UPDATE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/** Active intervals keyed by leaderboard ID. */
const activeIntervals = new Map<number, ReturnType<typeof setInterval>>();

/**
 * Fetch fresh data and edit the leaderboard message. Returns false if
 * the message or channel is gone (caller should clean up).
 */
async function refreshLeaderboard(
    client: Client,
    lb: Leaderboard
): Promise<boolean> {
    try {
        const channel = await client.channels.fetch(lb.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            console.warn(
                `[Leaderboard] Channel ${lb.channelId} not found or not text-based, removing leaderboard ${lb.id}`
            );
            return false;
        }

        // Fetch the message — if deleted, clean up.
        const message = await channel.messages.fetch(lb.messageId).catch(() => null);
        if (!message) {
            console.warn(
                `[Leaderboard] Message ${lb.messageId} not found, removing leaderboard ${lb.id}`
            );
            return false;
        }

        const characters = await fetchGuildMythicPlus(
            lb.wowGuildName,
            lb.realmSlug,
            lb.region
        );

        const embed = buildLeaderboardEmbed(lb, characters);
        await message.edit({ embeds: [embed] });

        console.log(
            `[Leaderboard] Updated leaderboard ${lb.id} (${lb.wowGuildName}-${lb.realmSlug}) — ${characters.length} characters`
        );
        return true;
    } catch (err) {
        console.error(`[Leaderboard] Failed to refresh leaderboard ${lb.id}:`, err);
        // Don't remove on transient errors (API rate limits, network blips).
        // Only remove if we confirmed the message/channel is gone (returned false above).
        return true;
    }
}

/**
 * Start a recurring update loop for a single leaderboard.
 * Does an immediate refresh, then schedules every 10 minutes.
 */
export function startLeaderboardLoop(client: Client, lb: Leaderboard): void {
    // Prevent duplicate loops.
    if (activeIntervals.has(lb.id)) return;

    // Immediate first refresh.
    refreshLeaderboard(client, lb).then((ok) => {
        if (!ok) {
            deleteLeaderboard(lb.id);
            return;
        }

        const interval = setInterval(async () => {
            const ok = await refreshLeaderboard(client, lb);
            if (!ok) {
                stopLeaderboardLoop(lb.id);
                deleteLeaderboard(lb.id);
            }
        }, UPDATE_INTERVAL_MS);

        activeIntervals.set(lb.id, interval);
        console.log(`[Leaderboard] Started update loop for leaderboard ${lb.id}`);
    });
}

/**
 * Stop the update loop for a leaderboard.
 */
export function stopLeaderboardLoop(id: number): void {
    const interval = activeIntervals.get(id);
    if (interval) {
        clearInterval(interval);
        activeIntervals.delete(id);
        console.log(`[Leaderboard] Stopped update loop for leaderboard ${id}`);
    }
}

/**
 * Restore all leaderboard update loops from the database.
 * Called once on bot ready.
 */
export function restoreAllLeaderboards(client: Client): void {
    const leaderboards = getAllLeaderboards();
    console.log(
        `[Leaderboard] Restoring ${leaderboards.length} leaderboard(s) from database...`
    );

    for (const lb of leaderboards) {
        startLeaderboardLoop(client, lb);
    }
}
