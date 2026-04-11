import { Client, Events, REST, Routes } from 'discord.js';
import { commands } from '../commands';

export const name = Events.ClientReady;
export const once = true;

/**
 * Auto-register slash commands on every startup.
 *
 * We do this in the ready handler instead of a separate deploy script so
 * Railway deploys work with zero manual steps — you set DISCORD_TOKEN,
 * push, and the bot comes up with its commands already registered.
 *
 * - If GUILD_ID is set, we register guild-scoped commands (appear instantly).
 * - Otherwise we register globally (propagation can take up to an hour the
 *   very first time, but is effectively instant on subsequent deploys).
 *
 * The payload is identical across restarts, so Discord treats it as a no-op
 * when nothing changed — safe to run on every boot.
 */
async function registerSlashCommands(client: Client<true>): Promise<void> {
    const token = process.env.DISCORD_TOKEN!;
    const clientId = client.application.id;
    const guildId = process.env.GUILD_ID;

    const body = Object.values(commands).map((c) => c.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(token);

    try {
        if (guildId) {
            console.log(
                `[Ready] Registering ${body.length} guild command(s) to ${guildId}...`
            );
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
                body,
            });
            console.log('[Ready] Guild commands registered.');
        } else {
            console.log(`[Ready] Registering ${body.length} global command(s)...`);
            await rest.put(Routes.applicationCommands(clientId), { body });
            console.log(
                '[Ready] Global commands registered. (First-time propagation can take up to 1 hour.)'
            );
        }
    } catch (err) {
        // Don't crash the bot if registration fails — the existing set of
        // commands on Discord's side will continue to work.
        console.error('[Ready] Failed to register slash commands:', err);
    }
}

export async function execute(client: Client<true>): Promise<void> {
    console.log(
        `[Ready] Grey Parse Gary is online as ${client.user.tag}. ` +
            `Parsing grey in ${client.guilds.cache.size} guild(s).`
    );
    await registerSlashCommands(client);
}
