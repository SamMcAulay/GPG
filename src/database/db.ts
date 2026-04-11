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

type SqliteRunner = { exec(sql: string): void };

/**
 * Check whether a column already exists on a table. SQLite doesn't support
 * "ALTER TABLE ADD COLUMN IF NOT EXISTS", so we introspect the schema first.
 */
function columnExists(table: string, column: string): boolean {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
        name: string;
    }>;
    return rows.some((r) => r.name === column);
}

/**
 * Create tables if they don't already exist, and apply lightweight
 * migrations for schema changes on existing databases. Called once at boot.
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
            raiderRoleId TEXT,
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

        CREATE TABLE IF NOT EXISTS BattleNetLinks (
            discordUserId TEXT PRIMARY KEY,
            battleTag TEXT,
            accessToken TEXT NOT NULL,
            refreshToken TEXT,
            expiresAt INTEGER NOT NULL,
            region TEXT NOT NULL,
            linkedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );

        CREATE TABLE IF NOT EXISTS CharacterCache (
            discordUserId TEXT NOT NULL,
            realmSlug TEXT NOT NULL,
            characterName TEXT NOT NULL,
            level INTEGER NOT NULL,
            className TEXT NOT NULL,
            activeSpec TEXT,
            itemLevel INTEGER,
            role TEXT,
            fetchedAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            PRIMARY KEY (discordUserId, realmSlug, characterName)
        );

        CREATE INDEX IF NOT EXISTS idx_charcache_user ON CharacterCache(discordUserId);
    `;
    (db as unknown as SqliteRunner).exec(schemaSql);

    // Migration: add raiderRoleId column to existing Raids tables that
    // pre-date this feature. No-op on fresh databases where the CREATE
    // TABLE above already included the column.
    if (!columnExists('Raids', 'raiderRoleId')) {
        (db as unknown as SqliteRunner).exec(
            'ALTER TABLE Raids ADD COLUMN raiderRoleId TEXT'
        );
        console.log('[DB] Migration: added Raids.raiderRoleId column.');
    }

    console.log('[DB] Schema ready.');
}
