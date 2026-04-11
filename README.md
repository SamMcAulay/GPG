# Grey Parse Gary

> *"I might have stood in the fire, but at least I RSVP'd on time."*

A World of Warcraft guild raid-attendance Discord bot. Gary parses grey, but he never misses a raid and he'll make sure your guildies don't either.

## Features

- `/makeraid` — post a raid signup embed with name, date, time, description.
- Buttons for **Tank / Healer / DPS / Late / Decline**.
- Live roster updates in the embed; clicking a new role moves you automatically.
- SQLite persistence, safe for Railway deploys via Volume mounts.

## Tech

- Node.js 20+ / TypeScript
- [discord.js](https://discord.js.org) v14
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)

## Local development

```bash
cp .env.example .env   # fill in DISCORD_TOKEN and CLIENT_ID
npm install
npm run deploy-commands
npm run build
npm start
```

During development, set `GUILD_ID` in `.env` so slash commands register instantly to your test guild instead of waiting on global rollout.

## Railway deployment

1. Create a new Railway project from this GitHub repo.
2. Add a **Volume** mounted at e.g. `/data`. Railway will expose `RAILWAY_VOLUME_MOUNT_PATH` automatically — the bot reads from it so the SQLite file survives deploys.
3. Set environment variables: `DISCORD_TOKEN`, `CLIENT_ID`.
4. Railway runs `npm start` (which runs `node dist/index.js`). The `build` step runs automatically as part of the Nixpacks default Node pipeline.
5. Run `npm run deploy-commands` once locally (or as a Railway one-off) to register slash commands with Discord.

## Project layout

```
src/
├── commands/         slash command definitions (/makeraid)
├── database/         SQLite connection + raid repository
├── events/           ready, interactionCreate handlers
├── utils/            embed builder, Gary quips
├── deploy-commands.ts  one-off command registration script
└── index.ts          main entry point
```
