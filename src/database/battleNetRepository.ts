import { db } from './db';

/**
 * One row per Discord user who has linked a Battle.net account.
 * The refresh token is Blizzard's long-lived credential; access tokens
 * expire (~24h) and are refreshed lazily.
 */
export interface BattleNetLink {
    discordUserId: string;
    battleTag: string | null;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: number; // unix seconds
    region: string;
    linkedAt: number;
}

/**
 * Cached character row. `role` is denormalized from the spec so the
 * button handler can do a cheap lookup without re-applying the spec map.
 */
export interface CachedCharacter {
    discordUserId: string;
    realmSlug: string;
    characterName: string;
    level: number;
    className: string;
    activeSpec: string | null;
    itemLevel: number | null;
    role: string | null; // 'tank' | 'healer' | 'dps' | null
    lastPlayedTs: number | null; // unix ms from Blizzard API
    fetchedAt: number;
}

export function upsertBattleNetLink(link: Omit<BattleNetLink, 'linkedAt'>): void {
    db.prepare(
        `
        INSERT INTO BattleNetLinks (discordUserId, battleTag, accessToken, refreshToken, expiresAt, region, linkedAt)
        VALUES (@discordUserId, @battleTag, @accessToken, @refreshToken, @expiresAt, @region, strftime('%s','now'))
        ON CONFLICT(discordUserId) DO UPDATE SET
            battleTag = @battleTag,
            accessToken = @accessToken,
            refreshToken = @refreshToken,
            expiresAt = @expiresAt,
            region = @region,
            linkedAt = strftime('%s','now')
    `
    ).run(link);
}

export function getBattleNetLink(discordUserId: string): BattleNetLink | undefined {
    return db
        .prepare('SELECT * FROM BattleNetLinks WHERE discordUserId = ?')
        .get(discordUserId) as BattleNetLink | undefined;
}

export function updateAccessToken(
    discordUserId: string,
    accessToken: string,
    expiresAt: number,
    refreshToken?: string
): void {
    if (refreshToken) {
        db.prepare(
            `UPDATE BattleNetLinks
             SET accessToken = ?, expiresAt = ?, refreshToken = ?
             WHERE discordUserId = ?`
        ).run(accessToken, expiresAt, refreshToken, discordUserId);
    } else {
        db.prepare(
            `UPDATE BattleNetLinks
             SET accessToken = ?, expiresAt = ?
             WHERE discordUserId = ?`
        ).run(accessToken, expiresAt, discordUserId);
    }
}

export function deleteBattleNetLink(discordUserId: string): void {
    db.prepare('DELETE FROM BattleNetLinks WHERE discordUserId = ?').run(discordUserId);
    db.prepare('DELETE FROM CharacterCache WHERE discordUserId = ?').run(discordUserId);
}

export function replaceCharacterCache(
    discordUserId: string,
    characters: Array<Omit<CachedCharacter, 'discordUserId' | 'fetchedAt'>>
): void {
    const del = db.prepare('DELETE FROM CharacterCache WHERE discordUserId = ?');
    const ins = db.prepare(
        `
        INSERT INTO CharacterCache (discordUserId, realmSlug, characterName, level, className, activeSpec, itemLevel, role, lastPlayedTs, fetchedAt)
        VALUES (@discordUserId, @realmSlug, @characterName, @level, @className, @activeSpec, @itemLevel, @role, @lastPlayedTs, strftime('%s','now'))
    `
    );
    const tx = db.transaction(
        (userId: string, rows: Array<Omit<CachedCharacter, 'discordUserId' | 'fetchedAt'>>) => {
            del.run(userId);
            for (const row of rows) {
                ins.run({ ...row, discordUserId: userId });
            }
        }
    );
    tx(discordUserId, characters);
}

export function getCachedCharactersForRole(
    discordUserId: string,
    role: string,
    maxLevel: number
): CachedCharacter[] {
    return db
        .prepare(
            `SELECT * FROM CharacterCache
             WHERE discordUserId = ? AND role = ? AND level = ?
             ORDER BY itemLevel DESC, characterName ASC`
        )
        .all(discordUserId, role, maxLevel) as CachedCharacter[];
}

/**
 * Return ALL cached characters for a user at the raid level, regardless
 * of role. Sorted by lastPlayedTs DESC, then itemLevel DESC so the
 * "main" character naturally lands first.
 */
export function getAllCachedCharacters(
    discordUserId: string,
    maxLevel: number
): CachedCharacter[] {
    return db
        .prepare(
            `SELECT * FROM CharacterCache
             WHERE discordUserId = ? AND level = ?
             ORDER BY itemLevel DESC, lastPlayedTs DESC, characterName ASC`
        )
        .all(discordUserId, maxLevel) as CachedCharacter[];
}

export function getCacheAgeSeconds(discordUserId: string): number | null {
    const row = db
        .prepare('SELECT MAX(fetchedAt) AS fetchedAt FROM CharacterCache WHERE discordUserId = ?')
        .get(discordUserId) as { fetchedAt: number | null } | undefined;
    if (!row || row.fetchedAt == null) return null;
    return Math.floor(Date.now() / 1000) - row.fetchedAt;
}
