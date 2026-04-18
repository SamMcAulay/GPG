import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    MessageFlags,
} from 'discord.js';
import { createLeaderboard } from '../database/leaderboardRepository';
import { fetchGuildMythicPlus } from '../raiderio/guild';
import { buildLeaderboardEmbed } from '../utils/leaderboardEmbed';
import { startLeaderboardLoop } from '../services/leaderboardUpdater';

export const data = new SlashCommandBuilder()
    .setName('makelb')
    .setDescription('Create a Mythic+ leaderboard for a WoW guild')
    .addStringOption((opt) =>
        opt
            .setName('guild')
            .setDescription('WoW guild name (e.g. "Grey Parse Gaming")')
            .setRequired(true)
            .setMaxLength(100)
    )
    .addStringOption((opt) =>
        opt
            .setName('server')
            .setDescription('Realm/server name (e.g. "area-52", "illidan")')
            .setRequired(true)
            .setMaxLength(100)
    )
    .addStringOption((opt) =>
        opt
            .setName('region')
            .setDescription('Region: us, eu, kr, tw')
            .setRequired(true)
            .addChoices(
                { name: 'US', value: 'us' },
                { name: 'EU', value: 'eu' },
                { name: 'KR', value: 'kr' },
                { name: 'TW', value: 'tw' }
            )
    );

export async function execute(
    interaction: ChatInputCommandInteraction
): Promise<void> {
    if (!interaction.inGuild()) {
        await interaction.reply({
            content: 'This command can only be used inside a server.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const guildName = interaction.options.getString('guild', true);
    const server = interaction.options.getString('server', true);
    const region = interaction.options.getString('region', true);

    await interaction.deferReply();

    const createdBy =
        interaction.member && 'displayName' in interaction.member
            ? (interaction.member.displayName as string)
            : interaction.user.username;

    // Validate by fetching from Raider.IO immediately.
    let characters;
    try {
        characters = await fetchGuildMythicPlus(guildName, server, region);
    } catch (err) {
        const msg =
            err instanceof Error ? err.message : 'Unknown error';
        await interaction.editReply({
            content:
                `Failed to fetch guild data from Raider.IO. ` +
                `Make sure the guild name and server are correct.\n\`${msg}\``,
        });
        return;
    }

    // Create a placeholder leaderboard object to render the initial embed.
    const placeholder = {
        id: 0,
        messageId: '',
        channelId: interaction.channelId,
        guildId: interaction.guildId!,
        wowGuildName: guildName,
        realmSlug: server,
        region,
        createdBy,
        createdAt: Math.floor(Date.now() / 1000),
    };

    const embed = buildLeaderboardEmbed(placeholder, characters);
    const sent = await interaction.editReply({ embeds: [embed] });

    // Persist so the leaderboard survives restarts.
    const lb = createLeaderboard({
        messageId: sent.id,
        channelId: sent.channelId,
        guildId: interaction.guildId!,
        wowGuildName: guildName,
        realmSlug: server,
        region,
        createdBy,
    });

    // Start the recurring update loop.
    startLeaderboardLoop(interaction.client, lb);
}
