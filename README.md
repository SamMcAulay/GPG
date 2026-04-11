# Grey Parse Gary

> *"I might have stood in the fire, but at least I RSVP'd on time."*

A World of Warcraft guild raid-attendance Discord bot. Gary parses grey, but he never misses a raid and he'll make sure your guildies don't either.

## Features

- `/makeraid` — post a raid signup embed with name, date, time, description, and an optional role filter.
- Buttons for **Tank / Healer / DPS / Late / Decline**.
- Live roster updates in the embed; clicking a new role moves you automatically.
- "Not Responded" field lists members who haven't clicked a button yet.
- SQLite persistence, safe for Railway deploys via Volume mounts.
- **Zero-config deploy:** slash commands auto-register on startup, schema auto-creates, DB auto-locates the Railway volume.

## Required: enable the Server Members privileged intent

The "Not Responded" list requires the bot to enumerate guild members, which needs Discord's privileged **Server Members Intent**. Enable it once:

1. Go to https://discord.com/developers/applications → your app → **Bot**.
2. Scroll to **Privileged Gateway Intents**.
3. Toggle **Server Members Intent** on and hit **Save Changes**.

If this isn't enabled the bot will fail to start with a `DisallowedIntents` error.

## Tech

- Node.js 20+ / TypeScript
- [discord.js](https://discord.js.org) v14
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)

## Railway deployment (the intended path)

1. **Fork / connect** this repo to a new Railway project.
2. **Add a Volume** and mount it at a path like `/data`. Railway automatically exposes the mount path as `RAILWAY_VOLUME_MOUNT_PATH`, which the bot reads so the SQLite file survives redeploys.
3. **Set one environment variable:** `DISCORD_TOKEN` — the bot token from the Discord Developer Portal. That's it.
4. **Deploy.** Railway reads `railway.json`, runs `npm ci --include=dev && npm run build`, then `npm start`. On first boot, Gary logs in, registers `/makeraid` globally with Discord, and starts listening for interactions.

No terminal access required. No manual command-registration step.

> Global slash commands can take up to an hour to appear the very first time Discord sees them. If you want instant visibility in a single test server, set the optional `GUILD_ID` env var — the bot will register commands guild-scoped instead.

## Local development (optional)

```bash
cp .env.example .env   # fill in DISCORD_TOKEN (and optional GUILD_ID)
npm install
npm run build
npm start
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Bot token from the Discord Developer Portal. |
| `GUILD_ID` | optional | If set, slash commands register only to that guild (appear instantly). Otherwise they register globally. |
| `RAILWAY_VOLUME_MOUNT_PATH` | auto | Set by Railway when a Volume is attached; the bot falls back to `./data` locally. |

## Project layout

```
src/
├── commands/         slash command definitions (/makeraid)
├── database/         SQLite connection + raid repository
├── events/           ready (auto-registers commands), interactionCreate
├── utils/            embed builder, Gary quips
└── index.ts          main entry point
```
