import { EmbedBuilder } from 'discord.js';
import type { RaiderIoCharacter } from '../raiderio/guild';
import type { Leaderboard } from '../database/leaderboardRepository';

const EMBED_COLOR = 0x8b5cf6; // Purple to distinguish from raid embeds

/** Class → emoji mapping for visual flair. */
const CLASS_EMOJI: Record<string, string> = {
    'Death Knight': '💀',
    'Demon Hunter': '😈',
    Druid: '🌿',
    Evoker: '🐉',
    Hunter: '🏹',
    Mage: '🔮',
    Monk: '🥋',
    Paladin: '⚜️',
    Priest: '✨',
    Rogue: '🗡️',
    Shaman: '⚡',
    Warlock: '🔥',
    Warrior: '⚔️',
};

/** Medal emojis for top 3 positions. */
const RANK_MEDAL = ['🥇', '🥈', '🥉'];

/** Max entries shown per role section. */
const MAX_PER_ROLE = 10;

type Role = 'tank' | 'healer' | 'dps';

function formatScore(score: number): string {
    return score.toFixed(1);
}

function getRoleScore(c: RaiderIoCharacter, role: Role): number {
    if (role === 'tank') return c.scoreTank;
    if (role === 'healer') return c.scoreHealer;
    return c.scoreDps;
}

/**
 * Build a single role section from the characters that have a non-zero
 * score in that role, sorted by that role's score descending.
 */
function formatRoleSection(
    characters: RaiderIoCharacter[],
    role: Role
): string {
    const withScore = characters
        .filter((c) => getRoleScore(c, role) > 0)
        .sort((a, b) => getRoleScore(b, role) - getRoleScore(a, role))
        .slice(0, MAX_PER_ROLE);

    if (withScore.length === 0) return '*No entries yet.*';

    const lines = withScore.map((c, i) => {
        const rank = RANK_MEDAL[i] ?? `**${i + 1}.**`;
        const classEmoji = CLASS_EMOJI[c.class] ?? '❓';
        const score = formatScore(getRoleScore(c, role));
        return `${rank} **[${c.name}](${c.profileUrl})** \`${score}\`  ${classEmoji} ${c.activeSpec}`;
    });

    return lines.join('\n');
}

/**
 * Build the leaderboard embed from Raider.IO data.
 */
export function buildLeaderboardEmbed(
    leaderboard: Leaderboard,
    characters: RaiderIoCharacter[]
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`🏆 M+ Leaderboard — ${leaderboard.wowGuildName}`)
        .setDescription(
            `*${leaderboard.realmSlug} · ${leaderboard.region.toUpperCase()}*`
        );

    if (characters.length === 0) {
        embed.addFields({
            name: '\u200b',
            value: '*No characters with M+ scores found for this guild.*',
        });
    } else {
        embed.addFields(
            {
                name: '🛡️ Tanks',
                value: formatRoleSection(characters, 'tank'),
                inline: false,
            },
            {
                name: '💉 Healers',
                value: formatRoleSection(characters, 'healer'),
                inline: false,
            },
            {
                name: '⚔️ DPS',
                value: formatRoleSection(characters, 'dps'),
                inline: false,
            }
        );
    }

    embed
        .setFooter({
            text: `${characters.length} characters · Updates every 10 min`,
        })
        .setTimestamp(new Date());

    return embed;
}
