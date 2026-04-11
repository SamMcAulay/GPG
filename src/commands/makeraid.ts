import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    MessageFlags,
} from 'discord.js';
import { createRaid, getRoster } from '../database/raidRepository';
import { buildRaidButtons, buildRaidEmbed } from '../utils/raidEmbed';

export const data = new SlashCommandBuilder()
    .setName('makeraid')
    .setDescription('Create a new raid signup post (Gary approves)')
    .addStringOption((opt) =>
        opt
            .setName('name')
            .setDescription('Raid name, e.g. "Molten Core Farm"')
            .setRequired(true)
            .setMaxLength(100)
    )
    .addStringOption((opt) =>
        opt
            .setName('date')
            .setDescription('Date of the raid, e.g. "Saturday 2026-04-18"')
            .setRequired(true)
            .setMaxLength(50)
    )
    .addStringOption((opt) =>
        opt
            .setName('time')
            .setDescription('Start time, e.g. "8:00 PM ST"')
            .setRequired(true)
            .setMaxLength(50)
    )
    .addStringOption((opt) =>
        opt
            .setName('description')
            .setDescription('Anything else the raid team should know')
            .setRequired(false)
            .setMaxLength(1000)
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild()) {
        await interaction.reply({
            content: "I can only schedule raids inside a guild channel. Gary's orders.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const name = interaction.options.getString('name', true);
    const date = interaction.options.getString('date', true);
    const time = interaction.options.getString('time', true);
    const description = interaction.options.getString('description', false);

    // Defer so we have time to post the message and insert the row.
    await interaction.deferReply();

    // We need a messageId before we can save — so post first with a draft
    // embed, then fetch the message ID, then insert the Raid row, then
    // edit the posted message with the real (identical) embed. This keeps
    // the flow simple and avoids placeholder rows in the DB.
    const placeholderRaid = {
        id: 0,
        messageId: '',
        channelId: interaction.channelId,
        guildId: interaction.guildId!,
        name,
        date,
        time,
        description,
        createdBy:
            interaction.member && 'displayName' in interaction.member
                ? (interaction.member.displayName as string)
                : interaction.user.username,
        createdAt: Math.floor(Date.now() / 1000),
    };

    const emptyRoster = {
        tank: [],
        healer: [],
        dps: [],
        late: [],
        decline: [],
    };

    const embed = buildRaidEmbed(placeholderRaid, emptyRoster);
    const components = [buildRaidButtons()];

    const sent = await interaction.editReply({
        embeds: [embed],
        components,
    });

    // Persist so future button clicks can resolve this raid.
    const raid = createRaid({
        messageId: sent.id,
        channelId: sent.channelId,
        guildId: interaction.guildId!,
        name,
        date,
        time,
        description,
        createdBy: placeholderRaid.createdBy,
    });

    // Re-render with the real raid row (so the footer timestamp matches DB).
    const freshEmbed = buildRaidEmbed(raid, getRoster(raid.id));
    await interaction.editReply({
        embeds: [freshEmbed],
        components,
    });
}
