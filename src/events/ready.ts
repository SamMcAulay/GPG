import { Client, Events, REST, Routes } from 'discord.js';
import { commands } from '../commands';

export const name = Events.ClientReady;
export const once = true;

/**
 * Auto-register slash commands on every startup.
 *
 * Strategy (robust against invite/GUILD_ID mishaps):
 *  1. Always register globally — covers any future guild the bot joins.
 *  2. Additionally register guild-scoped commands to every guild the bot
 *     is currently a member of — those propagate instantly, so users see
 *     /makeraid immediately without waiting on global propagation.
 *  3. If the optional GUILD_ID env var is set, register to that guild too
 *     (overlaps harmlessly with step 2 if the bot is already in it).
 *
 * Failures in any one step are logged but don't crash the others.
 */
async function registerSlashCommands(client: Client<true>): Promise<void> {
    const token = process.env.DISCORD_TOKEN!;
    const clientId = client.application.id;
    const extraGuildId = process.env.GUILD_ID;

    const body = Object.values(commands).map((c) => c.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(token);

    const guildList = client.guilds.cache.map((g) => `${g.name} (${g.id})`);
    console.log(
        `[Ready] Currently in ${client.guilds.cache.size} guild(s): ${
            guildList.length > 0 ? guildList.join(', ') : '<none>'
        }`
    );

    if (client.guilds.cache.size === 0) {
        console.warn(
            '[Ready] Bot is not a member of any guild. Double-check that the invite link was ' +
                "clicked AND 'Authorize' was pressed. Global registration will still run so " +
                'commands appear as soon as the bot joins any server.'
        );
    }

    // Step 1: global registration. Slow propagation first time, instant thereafter.
    try {
        console.log(`[Ready] Registering ${body.length} global command(s)...`);
        await rest.put(Routes.applicationCommands(clientId), { body });
        console.log('[Ready] Global commands registered.');
    } catch (err) {
        console.error('[Ready] Global registration failed:', err);
    }

    // Step 2: register to every guild we're already in (instant availability).
    for (const [guildId, guild] of client.guilds.cache) {
        try {
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
                body,
            });
            console.log(`[Ready] Guild commands registered to ${guild.name} (${guildId}).`);
        } catch (err) {
            console.error(
                `[Ready] Failed to register guild commands for ${guild.name} (${guildId}):`,
                err
            );
        }
    }

    // Step 3: honor explicit GUILD_ID override if it's set and not already covered.
    if (extraGuildId && !client.guilds.cache.has(extraGuildId)) {
        try {
            console.log(`[Ready] Also registering to GUILD_ID override ${extraGuildId}...`);
            await rest.put(Routes.applicationGuildCommands(clientId, extraGuildId), {
                body,
            });
            console.log(`[Ready] GUILD_ID override commands registered.`);
        } catch (err) {
            console.error(
                `[Ready] GUILD_ID override registration failed (${extraGuildId}). ` +
                    'The bot is probably not a member of that guild — check the value.',
                err
            );
        }
    }
}

export async function execute(client: Client<true>): Promise<void> {
    console.log(
        `[Ready] Logged in as ${client.user.tag}. ` +
            `Connected to ${client.guilds.cache.size} guild(s).`
    );
    await registerSlashCommands(client);
}
