import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} from 'discord.js';
import type { Raid, RaidRoster, Signup } from '../database/raidRepository';

// Soft caps per role — used only for the tally display, not enforced.
const ROLE_TARGETS = {
    tank: 2,
    healer: 5,
    dps: 13,
} as const;

const GARY_GREY = 0x9e9e9e;

/**
 * Render a list of signups as a newline-separated string of display names.
 * Shows "—" when empty so the field doesn't collapse in the embed.
 */
function formatRoster(signups: Signup[]): string {
    if (signups.length === 0) return '—';
    return signups.map((s) => `• ${s.userName}`).join('\n');
}

export function buildRaidEmbed(raid: Raid, roster: RaidRoster): EmbedBuilder {
    const tankCount = roster.tank.length;
    const healerCount = roster.healer.length;
    const dpsCount = roster.dps.length;
    const lateCount = roster.late.length;
    const declineCount = roster.decline.length;

    const embed = new EmbedBuilder()
        .setColor(GARY_GREY)
        .setTitle(`⚔️ ${raid.name}`)
        .setDescription(
            (raid.description ?? '') +
                "\n\n*I might have stood in the fire, but at least I RSVP'd on time. Sign up below.*"
        )
        .addFields(
            {
                name: '📅 Date',
                value: raid.date,
                inline: true,
            },
            {
                name: '🕒 Time',
                value: raid.time,
                inline: true,
            },
            {
                name: '\u200b',
                value: '\u200b',
                inline: true,
            },
            {
                name: `🛡️ Tanks (${tankCount}/${ROLE_TARGETS.tank})`,
                value: formatRoster(roster.tank),
                inline: true,
            },
            {
                name: `💉 Healers (${healerCount}/${ROLE_TARGETS.healer})`,
                value: formatRoster(roster.healer),
                inline: true,
            },
            {
                name: `⚔️ DPS (${dpsCount}/${ROLE_TARGETS.dps})`,
                value: formatRoster(roster.dps),
                inline: true,
            },
            {
                name: `🕒 Late (${lateCount})`,
                value: formatRoster(roster.late),
                inline: true,
            },
            {
                name: `❌ Bench/Decline (${declineCount})`,
                value: formatRoster(roster.decline),
                inline: true,
            },
            {
                name: '\u200b',
                value: '\u200b',
                inline: true,
            }
        )
        .setFooter({
            text: `Grey Parse Gary • Posted by ${raid.createdBy} • Don't forget your flask`,
        })
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
