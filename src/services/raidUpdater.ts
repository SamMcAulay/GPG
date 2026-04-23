/**
 * Periodically re-renders recent raid signup posts so ilvl/spec/class
 * info stays current without anyone having to click a signup button.
 *
 * Raid embeds pull enriched character data (ilvl, spec, class) from the
 * Battle.net cache. That cache has its own 10-min TTL, but the embed
 * itself only re-renders on button clicks — so a raid post from last
 * Tuesday with no new signups would display whatever ilvls were current
 * at the last button press, not today's.
 *
 * Strategy: every 10 minutes, walk every raid created within the last
 * 10.5 days, re-fetch + re-enrich the roster, and edit the message in
 * place. Re-enriching naturally busts the per-user character cache.
 */

import { DiscordAPIError, type Client } from 'discord.js';
import { getRaidsCreatedSince, getRoster, type Raid } from '../database/raidRepository';
import { buildRaidEmbed, buildRaidButtons } from '../utils/raidEmbed';
import { computeNotResponded } from '../utils/raidHelpers';
import { enrichRoster } from '../utils/rosterEnricher';

/**
 * Summarise a Discord API error so the operator can tell at a glance
 * whether the raid post is truly gone (fix: nothing, it's gone) vs a
 * permission issue (fix: grant the bot access to the channel).
 */
function describeDiscordError(err: unknown): string {
    if (!(err instanceof DiscordAPIError)) return String(err);
    switch (err.code) {
        case 10003:
            return 'Unknown Channel (channel deleted)';
        case 10008:
            return 'Unknown Message (message deleted)';
        case 50001:
            return 'Missing Access (bot role lacks View Channel)';
        case 50013:
            return 'Missing Permissions (bot role lacks Send/Embed)';
        default:
            return `DiscordAPIError ${err.code} ${err.message}`;
    }
}

const UPDATE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const RAID_REFRESH_WINDOW_SECONDS = Math.floor((10.5 * 24 * 60 * 60)); // 1.5 weeks

let loopInterval: ReturnType<typeof setInterval> | null = null;

async function refreshOneRaid(client: Client, raid: Raid): Promise<void> {
    try {
        const channel = await client.channels.fetch(raid.channelId);
        if (!channel || !channel.isTextBased()) {
            console.warn(
                `[RaidUpdater] Channel ${raid.channelId} for raid ${raid.id} is not text-based; skipping.`
            );
            return;
        }

        const message = await channel.messages.fetch(raid.messageId);

        const guild =
            client.guilds.cache.get(raid.guildId) ??
            (await client.guilds.fetch(raid.guildId).catch(() => null));
        if (!guild) {
            console.warn(
                `[RaidUpdater] Guild ${raid.guildId} for raid ${raid.id} not accessible; skipping.`
            );
            return;
        }

        const roster = getRoster(raid.id);
        const [enriched, notResponded] = await Promise.all([
            enrichRoster(roster),
            computeNotResponded(guild, raid, roster),
        ]);

        const embed = buildRaidEmbed(raid, enriched, notResponded);
        await message.edit({ embeds: [embed], components: [buildRaidButtons()] });
    } catch (err) {
        console.error(
            `[RaidUpdater] Failed to refresh raid ${raid.id}: ${describeDiscordError(err)}`
        );
    }
}

async function tick(client: Client): Promise<void> {
    const cutoff = Math.floor(Date.now() / 1000) - RAID_REFRESH_WINDOW_SECONDS;
    const raids = getRaidsCreatedSince(cutoff);
    if (raids.length === 0) return;

    console.log(
        `[RaidUpdater] Refreshing ${raids.length} raid post(s) from the last 10.5 days...`
    );

    // Serial iteration. Each raid's enrichRoster already parallelises
    // per-signup Battle.net lookups; running multiple raids concurrently
    // would mostly just race on shared per-user caches.
    for (const raid of raids) {
        await refreshOneRaid(client, raid);
    }
}

/**
 * Kick off the background refresher. Runs an immediate pass so stale
 * posts get caught up at boot, then repeats every 10 minutes.
 */
export function startRaidUpdates(client: Client): void {
    if (loopInterval) return;

    tick(client).catch((err) => console.error('[RaidUpdater] initial tick failed:', err));

    loopInterval = setInterval(() => {
        tick(client).catch((err) => console.error('[RaidUpdater] tick failed:', err));
    }, UPDATE_INTERVAL_MS);

    console.log('[RaidUpdater] Started recurring raid post refresh (every 10 min, last 10.5 days).');
}
