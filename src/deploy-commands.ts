import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commands } from './commands';

/**
 * Register all slash commands with Discord's API.
 *
 * - If GUILD_ID is set, commands are registered to a single guild (instant).
 * - Otherwise, commands are registered globally (can take up to an hour).
 *
 * Run with: npm run deploy-commands
 */
async function main(): Promise<void> {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    if (!token || !clientId) {
        console.error('[deploy] DISCORD_TOKEN and CLIENT_ID must be set.');
        process.exit(1);
    }

    const body = Object.values(commands).map((c) => c.data.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);

    try {
        if (guildId) {
            console.log(`[deploy] Registering ${body.length} guild command(s) to ${guildId}...`);
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
                body,
            });
            console.log('[deploy] Guild commands registered.');
        } else {
            console.log(`[deploy] Registering ${body.length} global command(s)...`);
            await rest.put(Routes.applicationCommands(clientId), { body });
            console.log('[deploy] Global commands registered (may take up to 1 hour to appear).');
        }
    } catch (err) {
        console.error('[deploy] Failed to register commands:', err);
        process.exit(1);
    }
}

main();
