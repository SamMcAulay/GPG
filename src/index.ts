import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { initSchema } from './database/db';
import * as readyEvent from './events/ready';
import * as interactionCreateEvent from './events/interactionCreate';

const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('[Boot] Missing DISCORD_TOKEN in environment. Exiting.');
    process.exit(1);
}

// Ensure the SQLite schema exists before the bot starts taking interactions.
initSchema();

const client = new Client({
    // Gary only needs to post embeds, read slash commands, and react to buttons.
    // Guilds is the only intent strictly required for slash commands + buttons.
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Message, Partials.Channel],
});

// Wire up events. Keeping this explicit (vs. a dynamic dir walk) makes the
// call graph obvious and avoids filesystem surprises on Railway.
client.once(readyEvent.name, (...args) => readyEvent.execute(...(args as [never])));
client.on(interactionCreateEvent.name, (...args) =>
    interactionCreateEvent.execute(...(args as [never]))
);

// Unhandled-rejection logging — surfaces discord.js errors that fall through.
process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
});

client.login(token).catch((err) => {
    console.error('[Boot] Failed to log in:', err);
    process.exit(1);
});
