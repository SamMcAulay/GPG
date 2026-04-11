import type { Guild } from 'discord.js';
import type { Raid, RaidRoster } from '../database/raidRepository';

/**
 * Compute the list of display names for guild members who are expected to
 * respond to a raid but haven't clicked any signup button yet.
 *
 * "Expected to respond" is defined by the raid's raiderRoleId:
 *   - If set, we only consider members who have that role.
 *   - If unset, we consider every non-bot member of the guild.
 *
 * This function makes sure the member cache is populated before filtering.
 * Requires the `GuildMembers` privileged intent on the client — without it,
 * guild.members.fetch() returns an empty collection and the "not responded"
 * list will always be empty.
 */
export async function computeNotResponded(
    guild: Guild,
    raid: Raid,
    roster: RaidRoster
): Promise<string[]> {
    // Populate the member cache if we don't already have everyone. Cheap
    // when already cached (discord.js short-circuits), one-time cost on
    // first call after a cold start.
    if (guild.members.cache.size < guild.memberCount) {
        try {
            await guild.members.fetch();
        } catch (err) {
            console.error(
                '[raidHelpers] Failed to fetch guild members — "Server Members" privileged intent likely not enabled in Developer Portal:',
                err
            );
            return [];
        }
    }

    const respondedIds = new Set<string>();
    for (const role of ['tank', 'healer', 'dps', 'late', 'decline'] as const) {
        for (const signup of roster[role]) {
            respondedIds.add(signup.userId);
        }
    }

    let members = guild.members.cache.filter((m) => !m.user.bot);
    if (raid.raiderRoleId) {
        const roleId = raid.raiderRoleId;
        members = members.filter((m) => m.roles.cache.has(roleId));
    }

    return members
        .filter((m) => !respondedIds.has(m.id))
        .map((m) => m.displayName)
        .sort((a, b) => a.localeCompare(b));
}
