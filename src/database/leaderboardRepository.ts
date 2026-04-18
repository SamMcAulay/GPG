import { db } from './db';

export interface Leaderboard {
    id: number;
    messageId: string;
    channelId: string;
    guildId: string;
    wowGuildName: string;
    realmSlug: string;
    region: string;
    createdBy: string;
    createdAt: number;
}

export function createLeaderboard(params: {
    messageId: string;
    channelId: string;
    guildId: string;
    wowGuildName: string;
    realmSlug: string;
    region: string;
    createdBy: string;
}): Leaderboard {
    const stmt = db.prepare(`
        INSERT INTO Leaderboards (messageId, channelId, guildId, wowGuildName, realmSlug, region, createdBy)
        VALUES (@messageId, @channelId, @guildId, @wowGuildName, @realmSlug, @region, @createdBy)
    `);
    const result = stmt.run(params);
    return getLeaderboardById(result.lastInsertRowid as number)!;
}

export function getLeaderboardById(id: number): Leaderboard | undefined {
    return db.prepare('SELECT * FROM Leaderboards WHERE id = ?').get(id) as
        | Leaderboard
        | undefined;
}

export function getAllLeaderboards(): Leaderboard[] {
    return db.prepare('SELECT * FROM Leaderboards').all() as Leaderboard[];
}

export function deleteLeaderboard(id: number): void {
    db.prepare('DELETE FROM Leaderboards WHERE id = ?').run(id);
}

export function deleteLeaderboardByMessageId(messageId: string): void {
    db.prepare('DELETE FROM Leaderboards WHERE messageId = ?').run(messageId);
}
