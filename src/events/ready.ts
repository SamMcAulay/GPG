import { Client, Events } from 'discord.js';

export const name = Events.ClientReady;
export const once = true;

export function execute(client: Client<true>): void {
    console.log(
        `[Ready] Grey Parse Gary is online as ${client.user.tag}. ` +
            `Parsing grey in ${client.guilds.cache.size} guild(s).`
    );
}
