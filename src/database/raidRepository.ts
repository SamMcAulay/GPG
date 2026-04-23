import { db } from './db';

export type RaidRole = 'tank' | 'healer' | 'dps' | 'late' | 'decline';

export interface Raid {
    id: number;
    messageId: string;
    channelId: string;
    guildId: string;
    name: string;
    date: string;
    time: string;
    description: string | null;
    createdBy: string;
    raiderRoleId: string | null;
    minIlvl: number | null;
    createdAt: number;
}

export interface Signup {
    id: number;
    raidId: number;
    userId: string;
    userName: string;
    role: RaidRole;
    updatedAt: number;
}

export interface RaidRoster {
    tank: Signup[];
    healer: Signup[];
    dps: Signup[];
    late: Signup[];
    decline: Signup[];
}

/**
 * Create a raid row. messageId is filled in after the message is posted,
 * so we insert a placeholder first and update it once we know the ID.
 *
 * In practice we insert atomically after sending, which keeps the DB clean.
 */
export function createRaid(params: {
    messageId: string;
    channelId: string;
    guildId: string;
    name: string;
    date: string;
    time: string;
    description: string | null;
    createdBy: string;
    raiderRoleId: string | null;
    minIlvl: number | null;
}): Raid {
    const stmt = db.prepare(`
        INSERT INTO Raids (messageId, channelId, guildId, name, date, time, description, createdBy, raiderRoleId, minIlvl)
        VALUES (@messageId, @channelId, @guildId, @name, @date, @time, @description, @createdBy, @raiderRoleId, @minIlvl)
    `);
    const info = stmt.run(params);
    const raid = db
        .prepare('SELECT * FROM Raids WHERE id = ?')
        .get(info.lastInsertRowid) as Raid;
    return raid;
}

export function getRaidByMessageId(messageId: string): Raid | undefined {
    return db
        .prepare('SELECT * FROM Raids WHERE messageId = ?')
        .get(messageId) as Raid | undefined;
}

export function getRaidById(id: number): Raid | undefined {
    return db.prepare('SELECT * FROM Raids WHERE id = ?').get(id) as Raid | undefined;
}

/**
 * Return all raids created at or after the given unix-seconds timestamp,
 * oldest first. Used by the background refresher to re-enrich recent
 * raid posts so ilvl/spec stay current without a button click.
 */
export function getRaidsCreatedSince(sinceUnixSeconds: number): Raid[] {
    return db
        .prepare('SELECT * FROM Raids WHERE createdAt >= ? ORDER BY createdAt ASC')
        .all(sinceUnixSeconds) as Raid[];
}

/**
 * Insert or update a user's signup for a raid. Uses UPSERT on the
 * (raidId, userId) unique index so role changes just overwrite in place.
 */
export function upsertSignup(params: {
    raidId: number;
    userId: string;
    userName: string;
    role: RaidRole;
}): void {
    db.prepare(
        `
        INSERT INTO Signups (raidId, userId, userName, role, updatedAt)
        VALUES (@raidId, @userId, @userName, @role, strftime('%s','now'))
        ON CONFLICT(raidId, userId) DO UPDATE SET
            role = @role,
            userName = @userName,
            updatedAt = strftime('%s','now')
    `
    ).run(params);
}

export function removeSignup(raidId: number, userId: string): void {
    db.prepare('DELETE FROM Signups WHERE raidId = ? AND userId = ?').run(raidId, userId);
}

export function getRoster(raidId: number): RaidRoster {
    const rows = db
        .prepare('SELECT * FROM Signups WHERE raidId = ? ORDER BY updatedAt ASC')
        .all(raidId) as Signup[];

    const roster: RaidRoster = {
        tank: [],
        healer: [],
        dps: [],
        late: [],
        decline: [],
    };

    for (const row of rows) {
        if (row.role in roster) {
            roster[row.role as RaidRole].push(row);
        }
    }

    return roster;
}

export function deleteRaid(raidId: number): void {
    db.prepare('DELETE FROM Raids WHERE id = ?').run(raidId);
}
