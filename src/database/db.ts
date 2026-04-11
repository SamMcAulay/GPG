import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Resolve where the SQLite database should live.
 *
 * On Railway, a persistent Volume is mounted and its path is exposed via the
 * RAILWAY_VOLUME_MOUNT_PATH environment variable. Locally we fall back to
 * ./data so that developers get a working DB with zero configuration.
 *
 * Railway's container filesystem is ephemeral — without a Volume, the DB file
 * is wiped on every deploy, so this check is load-bearing, not optional.
 */
function resolveDbPath(): string {
    const baseDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || './data';

    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
    }

    return path.join(baseDir, 'database.sqlite');
}

const dbPath = resolveDbPath();
console.log(`[DB] Using database at: ${dbPath}`);

export const db = new Database(dbPath);

// Better write performance and safer concurrent reads.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Create tables if they don't already exist. Called once at boot.
 */
export function initSchema(): void {
    const schemaSql = `
        CREATE TABLE IF NOT EXISTS Raids (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            messageId TEXT UNIQUE NOT NULL,
            channelId TEXT NOT NULL,
            guildId TEXT NOT NULL,
            name TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            description TEXT,
            createdBy TEXT NOT NULL,
            createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );

        CREATE TABLE IF NOT EXISTS Signups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            raidId INTEGER NOT NULL,
            userId TEXT NOT NULL,
            userName TEXT NOT NULL,
            role TEXT NOT NULL,
            updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            UNIQUE(raidId, userId),
            FOREIGN KEY (raidId) REFERENCES Raids(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_signups_raid ON Signups(raidId);
        CREATE INDEX IF NOT EXISTS idx_raids_message ON Raids(messageId);
    `;
    db.prepare('SELECT 1').get(); // sanity touch
    // better-sqlite3 runs multi-statement SQL via the .exec method on the Database instance
    (db as unknown as { exec(sql: string): void }).exec(schemaSql);
    console.log('[DB] Schema ready.');
}
