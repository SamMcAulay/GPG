import { getValidAccessToken, getClientCredentialToken } from './oauth';
import {
    fetchAccountCharacters,
    fetchCharacterDetails,
    type CharacterDetails,
} from './profile';
import { RAID_LEVEL, specToRole, type RaidRoleSimple } from './constants';
import {
    getCacheAgeSeconds,
    getCachedCharactersForRole,
    getAllCachedCharacters,
    replaceCharacterCache,
    type CachedCharacter,
} from '../database/battleNetRepository';

/**
 * How long cached character data is considered fresh. Blizzard character
 * details change slowly (ilvl maybe every raid night, spec when the player
 * respecs), so a few minutes is plenty and spares the API hammer.
 */
const CACHE_TTL_SECONDS = 10 * 60;

/**
 * The "tank" button also covers characters whose active spec is Guardian,
 * Blood, Brewmaster, Protection, etc. We accept the simple roles.
 */
export type ButtonRole = RaidRoleSimple;

/**
 * Core API surface for the button handler: "give me this user's
 * raid-ready characters for this role, using cache when warm".
 *
 * Returns null when the user has no linked Battle.net account — the
 * caller should degrade gracefully (just show the name without character rows).
 */
export async function getCharactersForRole(
    discordUserId: string,
    role: ButtonRole
): Promise<CachedCharacter[] | null> {
    const link = await getValidAccessToken(discordUserId);

    // Even if the token refresh failed, we may still have cached data from
    // a previous successful fetch. Only return null when there's no link
    // AND no cache at all.
    if (link) {
        const age = getCacheAgeSeconds(discordUserId);
        if (age == null || age > CACHE_TTL_SECONDS) {
            try {
                await refreshCharacterCache(discordUserId, link.accessToken);
            } catch (err) {
                console.error(
                    `[Blizzard] Failed to refresh character cache for ${discordUserId}:`,
                    err
                );
                // Fall through — stale cache is better than nothing.
            }
        }
    }

    // Serve from cache regardless of token state. The cache persists in
    // SQLite and survives bot restarts, token expiries, and API outages.
    const cached = getCachedCharactersForRole(discordUserId, role, RAID_LEVEL);
    if (cached.length > 0) return cached;

    // No cache and no valid link → user hasn't linked at all.
    return link ? [] : null;
}

/**
 * Return ALL raid-level characters for a user, using cache when warm and
 * refreshing from the API when stale. Used by the enricher to show every
 * character with main/alt/offspec annotations.
 */
export async function getAllCharactersForUser(
    discordUserId: string
): Promise<CachedCharacter[] | null> {
    const link = await getValidAccessToken(discordUserId);

    if (link) {
        const age = getCacheAgeSeconds(discordUserId);
        if (age == null || age > CACHE_TTL_SECONDS) {
            try {
                await refreshCharacterCache(discordUserId, link.accessToken);
            } catch (err) {
                console.error(
                    `[Blizzard] Failed to refresh character cache for ${discordUserId}:`,
                    err
                );
            }
        }
    }

    const cached = getAllCachedCharacters(discordUserId, RAID_LEVEL);
    if (cached.length > 0) return cached;
    return link ? [] : null;
}

/**
 * Force an immediate Battle.net cache refresh for a user, bypassing the
 * TTL check. Called by the periodic raid-post refresher so embed data
 * reflects Blizzard's current state rather than a 10-minute-old snapshot.
 *
 * For OAuth-linked users: re-fetches the full account roster.
 * For /assign-only users (no OAuth link): re-fetches each cached character
 * individually via a client credential token so their ilvl stays current.
 */
export async function forceRefreshCharacterCache(
    discordUserId: string
): Promise<void> {
    const link = await getValidAccessToken(discordUserId);

    if (link) {
        try {
            await refreshCharacterCache(discordUserId, link.accessToken);
        } catch (err) {
            console.error(
                `[Blizzard] Forced cache refresh failed for ${discordUserId}:`,
                err
            );
        }
        return;
    }

    // No OAuth link — user was assigned via /assign. Re-fetch each cached
    // character individually using a client credential token.
    const cached = getAllCachedCharacters(discordUserId, RAID_LEVEL);
    if (cached.length === 0) return;

    let clientToken: string;
    try {
        clientToken = await getClientCredentialToken();
    } catch (err) {
        console.error(
            `[Blizzard] Failed to get client credential token for assigned-user refresh (${discordUserId}):`,
            err
        );
        return;
    }

    const rows: Array<Omit<CachedCharacter, 'discordUserId' | 'fetchedAt'>> = [];
    for (const c of cached) {
        const detail = await fetchCharacterDetails(clientToken, c.realmSlug, c.characterName);
        if (!detail) {
            // Keep the existing row so one missing character doesn't wipe the others.
            rows.push({
                realmSlug: c.realmSlug,
                characterName: c.characterName,
                level: c.level,
                className: c.className,
                activeSpec: c.activeSpec,
                itemLevel: c.itemLevel,
                role: c.role,
                lastPlayedTs: c.lastPlayedTs,
            });
            continue;
        }
        rows.push({
            realmSlug: detail.realmSlug,
            characterName: detail.name,
            level: detail.level,
            className: detail.className,
            activeSpec: detail.activeSpecName,
            itemLevel: detail.itemLevel,
            role: specToRole(detail.activeSpecName),
            lastPlayedTs: detail.lastPlayedTimestamp ?? null,
        });
    }

    replaceCharacterCache(discordUserId, rows);
    console.log(
        `[Blizzard] Re-cached ${rows.length} assigned character(s) for ${discordUserId}.`
    );
}

/**
 * Pull the full account summary, walk every character at the raid level,
 * fetch its detail, compute its role from the active spec, and persist
 * the resulting set as an atomic replace.
 */
async function refreshCharacterCache(
    discordUserId: string,
    accessToken: string
): Promise<void> {
    const summaries = await fetchAccountCharacters(accessToken);

    // Only bother fetching details for characters that could match the
    // raid level. Saves a ton of API calls for accounts with many alts.
    const raidReady = summaries.filter((c) => c.level >= RAID_LEVEL);

    const details: CharacterDetails[] = [];
    for (const char of raidReady) {
        const detail = await fetchCharacterDetails(
            accessToken,
            char.realm.slug,
            char.name
        );
        if (detail) details.push(detail);
    }

    const rows = details
        .filter((d) => d.level === RAID_LEVEL)
        .map((d) => ({
            realmSlug: d.realmSlug,
            characterName: d.name,
            level: d.level,
            className: d.className,
            activeSpec: d.activeSpecName,
            itemLevel: d.itemLevel,
            role: specToRole(d.activeSpecName),
            lastPlayedTs: d.lastPlayedTimestamp ?? null,
        }));

    // Guard: don't nuke existing cached data when the API returns nothing.
    // This protects against Blizzard outages or transient errors that
    // return a valid-but-empty response.
    if (rows.length === 0) {
        console.warn(
            `[Blizzard] API returned 0 raid-level characters for ${discordUserId} — keeping existing cache.`
        );
        return;
    }

    replaceCharacterCache(discordUserId, rows);
    console.log(
        `[Blizzard] Cached ${rows.length} level-${RAID_LEVEL} character(s) for ${discordUserId}.`
    );
}
