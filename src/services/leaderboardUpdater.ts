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

import { DiscordAPIError, type Client } from 'discord.js';
import {
    getAllLeaderboards,
    deleteLeaderboard,
    type Leaderboard,
} from '../database/leaderboardRepository';
import { fetchGuildMythicPlus } from '../raiderio/guild';
import { buildLeaderboardEmbed } from '../utils/leaderboardEmbed';

/**
 * Discord returns distinct error codes for "this truly no longer exists"
 * vs "you lack permission to see it". Only the former means we should
 * remove our DB row; the latter is recoverable (fix perms in Discord)
 * and deleting would silently destroy user data.
 *
 *   10003 Unknown Channel, 10008 Unknown Message  → gone
 *   50001 Missing Access, 50013 Missing Permissions → recoverable
 */
function isTrulyGoneError(err: unknown): boolean {
    if (!(err instanceof DiscordAPIError)) return false;
    return err.code === 10003 || err.code === 10008;
}

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
        const channel = await client.channels.fetch(lb.channelId);
        if (!channel || !channel.isTextBased()) {
            console.warn(
                `[Leaderboard] Channel ${lb.channelId} is not text-based for leaderboard ${lb.id}; keeping row.`
            );
            return true;
        }

        const message = await channel.messages.fetch(lb.messageId);

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
        if (isTrulyGoneError(err)) {
            console.warn(
                `[Leaderboard] Leaderboard ${lb.id} channel/message returned 10003/10008 (gone) — removing row.`
            );
            return false;
        }
        // Permission errors (50001/50013), rate limits, network blips all
        // land here. Keep the row so a fix in Discord (grant perms, etc.)
        // automatically restores updates on the next tick.
        console.error(`[Leaderboard] Failed to refresh leaderboard ${lb.id}:`, err);
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
