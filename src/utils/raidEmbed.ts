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
 * A single character annotated with its relationship to the signup.
 */
export interface AnnotatedCharacter {
    character: CachedCharacter;
    isMain: boolean;    // top character by recent play + ilvl
    isOffspec: boolean; // spec role doesn't match the signup role
    displaySpec: string; // the spec to show (actual spec when on-spec, target spec when offspec)
}

/**
 * Per-user enrichment: the signup row plus any matching characters
 * pulled from the Battle.net cache. `characters === null` means the user
 * has not linked an account (render just their display name).
 */
export interface EnrichedSignup {
    signup: Signup;
    characters: AnnotatedCharacter[] | null;
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
 * When `minIlvl` is set:
 *   - Alts below the threshold are hidden entirely.
 *   - The main is always shown; if under, it's flagged red.
 *   - Characters >5 above the threshold are flagged green.
 *   - Characters at/just above the threshold (within 5) are flagged blue.
 *
 * Discord embed text can't be colored inline, so we use colored-square
 * emoji prefixes (🟢🔵🔴) as the visual tier indicator while preserving
 * the clickable user mention on the header line.
 *
 * Example (minIlvl = 260):
 *   • sam
 *       🟢 Vyphir | unholy Death Knight | 275 ilvl
 *       🔵 Faeyren | feral druid | 262 ilvl
 *       🔴 Oldmain | fury warrior | 240 ilvl · under 260
 */
function formatEnrichedSignup(entry: EnrichedSignup, minIlvl: number | null): string {
    const head = `• <@${entry.signup.userId}>`;
    if (!entry.characters || entry.characters.length === 0) return head;

    // Hide alts that fall below the threshold. Mains are always shown
    // (red-flagged if under) so the raid lead knows the person signed up
    // but can't meet ilvl on their preferred character.
    const visible =
        minIlvl != null
            ? entry.characters.filter((a) => {
                  if (a.isMain) return true;
                  const ilvl = a.character.itemLevel ?? 0;
                  return ilvl >= minIlvl;
              })
            : entry.characters;

    if (visible.length === 0) return head;

    const lines = visible.map((a) => {
        const c = a.character;
        const spec = a.displaySpec;
        const cls = c.className ?? '??';
        const ilvl = c.itemLevel != null ? `${c.itemLevel} ilvl` : 'no ilvl';

        const tags: string[] = [];
        if (!a.isMain) tags.push('alt');
        if (a.isOffspec) tags.push('offspec');

        let prefix = '   ↳';
        if (minIlvl != null && c.itemLevel != null) {
            if (c.itemLevel < minIlvl) {
                prefix = '   🔴';
                tags.push(`under ${minIlvl}`);
            } else if (c.itemLevel > minIlvl + 5) {
                prefix = '   🟢';
            } else {
                prefix = '   🔵';
            }
        }

        const suffix = tags.length > 0 ? ` · *${tags.join(' · ')}*` : '';
        return `${prefix} ${c.characterName} | ${spec.toLowerCase()} ${cls} | ${ilvl}${suffix}`;
    });
    return [head, ...lines].join('\n');
}

/**
 * Format a role column. Hard cap the total length at ~1000 chars so we
 * stay under Discord's 1024-char embed field limit even when many users
 * have many raid-ready alts.
 */
function formatRosterField(
    entries: EnrichedSignup[],
    minIlvl: number | null
): string {
    if (entries.length === 0) return '—';

    const blocks = entries.map((e) => formatEnrichedSignup(e, minIlvl));
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
    // Date / Time / Min ILVL sit side-by-side when min-ilvl is set; when
    // it isn't, we keep the original (Date, Time, spacer) layout.
    const headerFields =
        raid.minIlvl != null
            ? [
                  { name: 'Date', value: raid.date, inline: true },
                  { name: 'Time', value: raid.time, inline: true },
                  { name: 'Min ILVL', value: `${raid.minIlvl}`, inline: true },
              ]
            : [
                  { name: 'Date', value: raid.date, inline: true },
                  { name: 'Time', value: raid.time, inline: true },
                  { name: '\u200b', value: '\u200b', inline: true },
              ];

    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(raid.name)
        .addFields(...headerFields);

    // Description is rendered as message content (outside the embed) by
    // the caller so Discord's full markdown set — including # headings and
    // -# subtext — works. Intentionally NOT calling setDescription here.

    // Tank / Healer / DPS are rendered full-width because the nested
    // character rows don't fit comfortably in a 3-column layout.
    embed.addFields(
        {
            name: `🛡️ Tanks (${roster.tank.length})`,
            value: formatRosterField(roster.tank, raid.minIlvl),
            inline: false,
        },
        {
            name: `💉 Healers (${roster.healer.length})`,
            value: formatRosterField(roster.healer, raid.minIlvl),
            inline: false,
        },
        {
            name: `⚔️ DPS (${roster.dps.length})`,
            value: formatRosterField(roster.dps, raid.minIlvl),
            inline: false,
        },
        {
            name: `🕒 Late (${roster.late.length})`,
            value: formatRosterField(roster.late, raid.minIlvl),
            inline: true,
        },
        {
            name: `❌ Decline (${roster.decline.length})`,
            value: formatRosterField(roster.decline, raid.minIlvl),
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
