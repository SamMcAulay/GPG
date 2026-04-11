# Grey Parse Gary

> *"I might have stood in the fire, but at least I RSVP'd on time."*

A World of Warcraft guild raid-attendance Discord bot. Gary parses grey, but he never misses a raid and he'll make sure your guildies don't either.

## Features

- `/makeraid` — post a raid signup embed with name, date, time, description, and an optional role filter.
- `/link` — let guildies link their Battle.net account so the bot can display their WoW characters in signups.
- Buttons for **Tank / Healer / DPS / Late / Decline**.
- Live roster updates in the embed; clicking a new role moves you automatically.
- When a user is linked, their level-90 characters whose current spec matches the role they clicked appear under their name with spec + ilvl.
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
| `BLIZZARD_CLIENT_ID` | for `/link` | Client ID from https://develop.battle.net/access/clients. |
| `BLIZZARD_CLIENT_SECRET` | for `/link` | Client secret from the same place. |
| `PUBLIC_BASE_URL` | for `/link` | Public HTTPS URL for the bot (e.g. `https://grey-parse-gary.up.railway.app`). The redirect URI registered with Blizzard must be `${PUBLIC_BASE_URL}/auth/callback`. |
| `BLIZZARD_REGION` | optional | `us` (default), `eu`, `kr`, or `tw`. |
| `BLIZZARD_PROFILE_NAMESPACE` | optional | Defaults to `profile-<region>` (Retail). Use `profile-classic-<region>` for Wrath/Cata/MoP Classic. |
| `RAID_LEVEL` | optional | Defaults to `80` (Retail — Midnight cap). Flip if Blizzard bumps the cap. |
| `PORT` | auto | Port the OAuth callback server listens on. Railway assigns this automatically. |

## Battle.net linking setup

1. Go to https://develop.battle.net/access/clients and click **Create Client**. Copy the Client ID and Secret.
2. In Railway, open your service → **Settings → Networking** → **Generate Domain**. Copy the resulting URL.
3. Back on the Blizzard client page, add a redirect URL: `<your-railway-domain>/auth/callback`. Save.
4. In Railway, set `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, and `PUBLIC_BASE_URL` (your Railway domain). Deploy.
5. In Discord, users run `/link`, click the personal link they receive, approve on battle.net, and they're set. The next time they click a raid button, their level-80 characters for that role will appear in the embed.

## Project layout

```
src/
├── blizzard/         Battle.net OAuth + WoW profile API client
├── commands/         slash command definitions (/makeraid, /link)
├── database/         SQLite connection + raid + battleNet repositories
├── events/           ready, interactionCreate, guildCreate
├── http/             Express server for the OAuth callback
├── utils/            embed builder, roster enricher, helpers
└── index.ts          main entry point
```
