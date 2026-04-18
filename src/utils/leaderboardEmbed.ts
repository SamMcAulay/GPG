import { EmbedBuilder } from 'discord.js';
import type { RaiderIoCharacter, SpecScore } from '../raiderio/guild';
import type { Leaderboard } from '../database/leaderboardRepository';

const EMBED_COLOR = 0x8b5cf6;

/** Medal emojis for top 3 positions. */
const RANK_MEDAL = ['🥇', '🥈', '🥉'];

/** Role → emoji. */
const ROLE_EMOJI: Record<SpecScore['role'], string> = {
    tank: '🛡️',
    healer: '💉',
    dps: '⚔️',
};

const MAX_ENTRIES = 15;

/**
 * Format a character entry: one primary line (rank, name, top-spec
 * score + role) plus an optional secondary line listing any additional
 * specs that have a non-zero score, score-sorted, separated by `|`.
 */
function formatEntry(c: RaiderIoCharacter, i: number): string {
    const rank = RANK_MEDAL[i] ?? `**${i + 1}.**`;

    const className = c.class.toLowerCase();

    // If the class isn't in our spec map (shouldn't happen for known classes),
    // fall back to the active spec name with the overall score.
    if (c.specScores.length === 0) {
        return `${rank} **[${c.name}](${c.profileUrl})** \`${c.scoreAll.toFixed(1)}\` — ${c.activeSpec.toLowerCase()} ${className}`;
    }

    const [primary, ...rest] = c.specScores;
    const primaryLine = `${rank} **[${c.name}](${c.profileUrl})** \`${primary.score.toFixed(1)}\` — ${primary.spec.toLowerCase()} ${className} ${ROLE_EMOJI[primary.role]}`;

    if (rest.length === 0) return primaryLine;

    const secondary = rest
        .map((s) => `\`${s.score.toFixed(0)}\` ${s.spec.toLowerCase()} ${ROLE_EMOJI[s.role]}`)
        .join(' | ');

    return `${primaryLine}\n-# ${secondary}`;
}

/**
 * Build the leaderboard embed from Raider.IO data.
 */
export function buildLeaderboardEmbed(
    leaderboard: Leaderboard,
    characters: RaiderIoCharacter[]
): EmbedBuilder {
    const top = characters.slice(0, MAX_ENTRIES);

    const lines = top.map(formatEntry);

    const body =
        lines.length > 0
            ? lines.join('\n\n')
            : '*No characters with M+ scores found for this guild.*';

    const total = characters.length;
    const remaining = total - top.length;
    const footer =
        remaining > 0
            ? `Showing top ${top.length} of ${total} · Updates every 10 min`
            : `${total} characters · Updates every 10 min`;

    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`🏆 M+ Leaderboard — ${leaderboard.wowGuildName}`)
        .setDescription(body)
        .addFields({
            name: '\u200b',
            value: `*${leaderboard.realmSlug} · ${leaderboard.region.toUpperCase()}*`,
        })
        .setFooter({ text: footer })
        .setTimestamp(new Date());

    return embed;
}
