import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    MessageFlags,
} from 'discord.js';
import { createRaid, getRoster } from '../database/raidRepository';
import { buildRaidButtons, buildRaidEmbed, toEmptyEnriched } from '../utils/raidEmbed';
import { computeNotResponded } from '../utils/raidHelpers';

export const data = new SlashCommandBuilder()
    .setName('makeraid')
    .setDescription('Create a new raid signup post')
    .addStringOption((opt) =>
        opt
            .setName('name')
            .setDescription('Raid name')
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
            .setDescription(
                'Optional extra details. Supports full Discord markdown (# headings, -# subtext, etc.)'
            )
            .setRequired(false)
            .setMaxLength(1000)
    )
    .addRoleOption((opt) =>
        opt
            .setName('role')
            .setDescription(
                'Optional: restrict the "Not Responded" list to members with this role'
            )
            .setRequired(false)
    )
    .addIntegerOption((opt) =>
        opt
            .setName('min_ilvl')
            .setDescription(
                'Optional: minimum item level. Characters below this will be flagged red on signup.'
            )
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(9999)
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild()) {
        await interaction.reply({
            content: 'This command can only be used inside a server.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const name = interaction.options.getString('name', true);
    const date = interaction.options.getString('date', true);
    const time = interaction.options.getString('time', true);
    const description = interaction.options.getString('description', false);
    const raiderRole = interaction.options.getRole('role', false);
    const raiderRoleId = raiderRole?.id ?? null;
    const minIlvl = interaction.options.getInteger('min_ilvl', false);

    await interaction.deferReply();

    const createdBy =
        interaction.member && 'displayName' in interaction.member
            ? (interaction.member.displayName as string)
            : interaction.user.username;

    // Post an initial embed with an empty roster so we can capture the
    // message ID, then persist the raid row, then re-render with the
    // real ID so the footer timestamp matches the DB record.
    const placeholderRaid = {
        id: 0,
        messageId: '',
        channelId: interaction.channelId,
        guildId: interaction.guildId!,
        name,
        date,
        time,
        description,
        createdBy,
        raiderRoleId,
        minIlvl,
        createdAt: Math.floor(Date.now() / 1000),
    };

    const emptyRoster = {
        tank: [],
        healer: [],
        dps: [],
        late: [],
        decline: [],
    };

    // Compute the initial "not responded" list right away so the post
    // is useful the moment it lands.
    const guild = interaction.guild!;
    const initialNotResponded = await computeNotResponded(
        guild,
        placeholderRaid,
        emptyRoster
    );

    const embed = buildRaidEmbed(
        placeholderRaid,
        toEmptyEnriched(emptyRoster),
        initialNotResponded
    );
    const components = [buildRaidButtons()];

    // The description lives in the message content (not inside the embed)
    // so Discord's newer markdown — headings (#), subtext (-#), ordered
    // lists — renders correctly. Embed descriptions don't support all of it.
    const content = description && description.trim().length > 0 ? description : '';

    const sent = await interaction.editReply({
        content,
        embeds: [embed],
        components,
    });

    const raid = createRaid({
        messageId: sent.id,
        channelId: sent.channelId,
        guildId: interaction.guildId!,
        name,
        date,
        time,
        description,
        createdBy,
        raiderRoleId,
        minIlvl,
    });

    const freshRoster = getRoster(raid.id);
    const freshNotResponded = await computeNotResponded(guild, raid, freshRoster);
    const freshEmbed = buildRaidEmbed(
        raid,
        toEmptyEnriched(freshRoster),
        freshNotResponded
    );
    await interaction.editReply({
        content,
        embeds: [freshEmbed],
        components,
    });
}
