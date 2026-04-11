import { Events, Guild, REST, Routes } from 'discord.js';
import { commands } from '../commands';

export const name = Events.GuildCreate;
export const once = false;

/**
 * Fires whenever the bot joins a new guild (or on startup for each guild
 * it's already in, depending on discord.js version). We re-register guild
 * commands to that specific guild so /makeraid appears instantly instead
 * of waiting on global propagation.
 *
 * Registering identical command payloads is idempotent on Discord's side,
 * so this is safe to run on every guild join.
 */
export async function execute(guild: Guild): Promise<void> {
    try {
        const token = process.env.DISCORD_TOKEN!;
        const clientId = guild.client.application.id;

        const body = Object.values(commands).map((c) => c.data.toJSON());
        const rest = new REST({ version: '10' }).setToken(token);

        await rest.put(Routes.applicationGuildCommands(clientId, guild.id), {
            body,
        });

        console.log(
            `[guildCreate] Joined ${guild.name} (${guild.id}) — registered ${body.length} guild command(s).`
        );
    } catch (err) {
        console.error(
            `[guildCreate] Failed to register commands for ${guild.name} (${guild.id}):`,
            err
        );
    }
}
