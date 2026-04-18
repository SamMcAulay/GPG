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

/**
 * Max characters to show on the leaderboard. Discord embed field values
 * cap at 1024 chars and we use description which caps at 4096, so we
 * have room for more than the raid embed, but we keep it reasonable.
 */
const MAX_ENTRIES = 20;

function formatScore(score: number): string {
    return score.toFixed(1);
}

/**
 * Build the leaderboard embed from Raider.IO data.
 */
export function buildLeaderboardEmbed(
    leaderboard: Leaderboard,
    characters: RaiderIoCharacter[]
): EmbedBuilder {
    const top = characters.slice(0, MAX_ENTRIES);

    const lines = top.map((c, i) => {
        const rank = RANK_MEDAL[i] ?? `**${i + 1}.**`;
        const classEmoji = CLASS_EMOJI[c.class] ?? '❓';
        const score = formatScore(c.mythicPlusScore);
        const runs =
            c.mythicPlusRunCount > 0 ? ` · ${c.mythicPlusRunCount} timed` : '';

        return `${rank} **[${c.name}](${c.profileUrl})** — ${score}\n` +
            `${' '.repeat(4)}${classEmoji} ${c.activeSpec} ${c.class}${runs}`;
    });

    const description =
        lines.length > 0
            ? lines.join('\n')
            : '*No characters with M+ scores found for this guild.*';

    const totalChars = characters.length;
    const remaining = totalChars - top.length;
    const footer =
        remaining > 0
            ? `Showing top ${top.length} of ${totalChars} · Updates every 10 min`
            : `${totalChars} characters · Updates every 10 min`;

    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(
            `🏆 M+ Leaderboard — ${leaderboard.wowGuildName}`
        )
        .setDescription(description)
        .setFooter({ text: footer })
        .setTimestamp(new Date());

    // Add guild/realm info as a subtle field
    embed.addFields({
        name: '\u200b',
        value: `*${leaderboard.realmSlug} · ${leaderboard.region.toUpperCase()}*`,
        inline: false,
    });

    return embed;
}
