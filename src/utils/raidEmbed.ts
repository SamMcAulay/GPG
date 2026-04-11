import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} from 'discord.js';
import type { Raid, RaidRoster, Signup } from '../database/raidRepository';

const EMBED_COLOR = 0x2b6cb0;

// Discord caps embed field values at 1024 chars. We truncate the
// "not responded" list well below that to keep the embed readable.
const MAX_NOT_RESPONDED_NAMES = 25;

function formatRoster(signups: Signup[]): string {
    if (signups.length === 0) return '—';
    return signups.map((s) => `• ${s.userName}`).join('\n');
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
    roster: RaidRoster,
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

    embed.addFields(
        {
            name: `🛡️ Tanks (${roster.tank.length})`,
            value: formatRoster(roster.tank),
            inline: true,
        },
        {
            name: `💉 Healers (${roster.healer.length})`,
            value: formatRoster(roster.healer),
            inline: true,
        },
        {
            name: `⚔️ DPS (${roster.dps.length})`,
            value: formatRoster(roster.dps),
            inline: true,
        },
        {
            name: `🕒 Late (${roster.late.length})`,
            value: formatRoster(roster.late),
            inline: true,
        },
        {
            name: `❌ Decline (${roster.decline.length})`,
            value: formatRoster(roster.decline),
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
