import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} from 'discord.js';
import type { Raid, RaidRoster, Signup } from '../database/raidRepository';
import type { CachedCharacter } from '../database/battleNetRepository';

const EMBED_COLOR = 0x2b6cb0;

// Discord caps embed field values at 1024 chars. We truncate the
// "not responded" list well below that to keep the embed readable.
const MAX_NOT_RESPONDED_NAMES = 25;

/**
 * Per-user enrichment: the signup row plus any matching characters
 * pulled from the Battle.net cache. `characters === null` means the user
 * has not linked an account (render just their display name).
 */
export interface EnrichedSignup {
    signup: Signup;
    characters: CachedCharacter[] | null;
}

export interface EnrichedRoster {
    tank: EnrichedSignup[];
    healer: EnrichedSignup[];
    dps: EnrichedSignup[];
    late: EnrichedSignup[];
    decline: EnrichedSignup[];
}

/**
 * Upgrade a bare roster (the shape the DB returns) into an enriched
 * roster with no character data attached. Used on initial creation
 * before anyone has clicked a button.
 */
export function toEmptyEnriched(roster: RaidRoster): EnrichedRoster {
    const bare = (rows: Signup[]): EnrichedSignup[] =>
        rows.map((s) => ({ signup: s, characters: null }));
    return {
        tank: bare(roster.tank),
        healer: bare(roster.healer),
        dps: bare(roster.dps),
        late: bare(roster.late),
        decline: bare(roster.decline),
    };
}

/**
 * Render a single signup as a Markdown block. When the user has matching
 * characters, they appear indented beneath the name, one per line.
 *
 * Example:
 *   • sam
 *       ↳ Vyphir | unholy Death Knight | 275 ilvl
 *       ↳ faeyren | feral druid | 225 ilvl
 */
function formatEnrichedSignup(entry: EnrichedSignup): string {
    const head = `• ${entry.signup.userName}`;
    if (!entry.characters || entry.characters.length === 0) return head;

    const lines = entry.characters.map((c) => {
        const spec = c.activeSpec ?? '??';
        const cls = c.className ?? '??';
        const ilvl = c.itemLevel != null ? `${c.itemLevel} ilvl` : 'no ilvl';
        return `   ↳ ${c.characterName} | ${spec.toLowerCase()} ${cls} | ${ilvl}`;
    });
    return [head, ...lines].join('\n');
}

/**
 * Format a role column. Hard cap the total length at ~1000 chars so we
 * stay under Discord's 1024-char embed field limit even when many users
 * have many raid-ready alts.
 */
function formatRosterField(entries: EnrichedSignup[]): string {
    if (entries.length === 0) return '—';

    const blocks = entries.map(formatEnrichedSignup);
    let output = '';
    for (const block of blocks) {
        const candidate = output.length === 0 ? block : `${output}\n${block}`;
        if (candidate.length > 1000) {
            output += '\n…';
            break;
        }
        output = candidate;
    }
    return output;
}

function formatNotResponded(names: string[]): string {
    if (names.length === 0) return '—';
    const shown = names.slice(0, MAX_NOT_RESPONDED_NAMES);
    const remainder = names.length - shown.length;
    const lines = shown.map((n) => `• ${n}`);
    if (remainder > 0) {
        lines.push(`…and ${remainder} more`);
    }
    return lines.join('\n');
}

export function buildRaidEmbed(
    raid: Raid,
    roster: EnrichedRoster,
    notRespondedNames: string[]
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(raid.name)
        .addFields(
            { name: 'Date', value: raid.date, inline: true },
            { name: 'Time', value: raid.time, inline: true },
            { name: '\u200b', value: '\u200b', inline: true }
        );

    if (raid.description && raid.description.trim().length > 0) {
        embed.setDescription(raid.description);
    }

    // Tank / Healer / DPS are rendered full-width because the nested
    // character rows don't fit comfortably in a 3-column layout.
    embed.addFields(
        {
            name: `🛡️ Tanks (${roster.tank.length})`,
            value: formatRosterField(roster.tank),
            inline: false,
        },
        {
            name: `💉 Healers (${roster.healer.length})`,
            value: formatRosterField(roster.healer),
            inline: false,
        },
        {
            name: `⚔️ DPS (${roster.dps.length})`,
            value: formatRosterField(roster.dps),
            inline: false,
        },
        {
            name: `🕒 Late (${roster.late.length})`,
            value: formatRosterField(roster.late),
            inline: true,
        },
        {
            name: `❌ Decline (${roster.decline.length})`,
            value: formatRosterField(roster.decline),
            inline: true,
        },
        { name: '\u200b', value: '\u200b', inline: true },
        {
            name: `⏳ Not Responded (${notRespondedNames.length})`,
            value: formatNotResponded(notRespondedNames),
            inline: false,
        }
    );

    embed
        .setFooter({ text: `Posted by ${raid.createdBy}` })
        .setTimestamp(new Date(raid.createdAt * 1000));

    return embed;
}

/**
 * Build the row of 5 signup buttons. CustomIds are prefixed with `signup_`
 * so the interactionCreate handler can route them without a registry.
 */
export function buildRaidButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('signup_tank')
            .setLabel('Tank')
            .setEmoji('🛡️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('signup_healer')
            .setLabel('Healer')
            .setEmoji('💉')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('signup_dps')
            .setLabel('DPS')
            .setEmoji('⚔️')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('signup_late')
            .setLabel('Late')
            .setEmoji('🕒')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('signup_decline')
            .setLabel('Decline')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Secondary)
    );
}
