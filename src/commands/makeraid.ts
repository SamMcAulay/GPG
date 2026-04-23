import {
    ActionRowBuilder,
    ChatInputCommandInteraction,
    ModalBuilder,
    ModalSubmitInteraction,
    SlashCommandBuilder,
    MessageFlags,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { createRaid, getRoster } from '../database/raidRepository';
import { buildRaidButtons, buildRaidEmbed, toEmptyEnriched } from '../utils/raidEmbed';
import { computeNotResponded } from '../utils/raidHelpers';

export const data = new SlashCommandBuilder()
    .setName('makeraid')
    .setDescription('Create a new raid signup post')
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

/**
 * Pending raid data captured from the slash command while we wait for
 * the user to submit the description modal. Keyed by a per-invocation
 * nonce that rides in the modal's customId.
 *
 * An entry auto-expires after 15 minutes so an abandoned modal can't
 * leak memory indefinitely.
 */
interface PendingRaid {
    userId: string;
    channelId: string;
    guildId: string;
    date: string;
    time: string;
    raiderRoleId: string | null;
    minIlvl: number | null;
    createdBy: string;
}

const pendingRaids = new Map<string, PendingRaid>();
const PENDING_TTL_MS = 15 * 60 * 1000;

const MODAL_CUSTOM_ID_PREFIX = 'makeraid_';

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild()) {
        await interaction.reply({
            content: 'This command can only be used inside a server.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const date = interaction.options.getString('date', true);
    const time = interaction.options.getString('time', true);
    const raiderRole = interaction.options.getRole('role', false);
    const raiderRoleId = raiderRole?.id ?? null;
    const minIlvl = interaction.options.getInteger('min_ilvl', false);

    const createdBy =
        interaction.member && 'displayName' in interaction.member
            ? (interaction.member.displayName as string)
            : interaction.user.username;

    const nonce = randomUUID();
    pendingRaids.set(nonce, {
        userId: interaction.user.id,
        channelId: interaction.channelId,
        guildId: interaction.guildId!,
        date,
        time,
        raiderRoleId,
        minIlvl,
        createdBy,
    });
    setTimeout(() => pendingRaids.delete(nonce), PENDING_TTL_MS).unref();

    // A modal with a paragraph text input gives the user a real multi-line
    // textarea for the description — something slash command string options
    // can't do. The other fields (date/time/role/min_ilvl) stay on the
    // slash command since integers and roles aren't valid modal input types.
    const modal = new ModalBuilder()
        .setCustomId(`${MODAL_CUSTOM_ID_PREFIX}${nonce}`)
        .setTitle('New Raid')
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('description')
                    .setLabel('Description (optional)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder(
                        'Extra details. Newlines and basic markdown (**bold**, *italic*, `code`) are supported.'
                    )
                    .setRequired(false)
                    .setMaxLength(1000)
            )
        );

    await interaction.showModal(modal);
}

/** Check whether a given modal customId belongs to this command. */
export function ownsModal(customId: string): boolean {
    return customId.startsWith(MODAL_CUSTOM_ID_PREFIX);
}

/**
 * Handle the user submitting the description modal. Uses the stashed
 * slash-command state keyed by the modal's nonce to finish building the
 * raid post.
 */
export async function handleModalSubmit(
    interaction: ModalSubmitInteraction
): Promise<void> {
    if (!interaction.inGuild()) {
        await interaction.reply({
            content: 'This modal can only be submitted inside a server.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const nonce = interaction.customId.slice(MODAL_CUSTOM_ID_PREFIX.length);
    const pending = pendingRaids.get(nonce);
    pendingRaids.delete(nonce);

    if (!pending) {
        await interaction.reply({
            content:
                'This raid request expired or was already submitted. Run `/makeraid` again.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const rawDescription = interaction.fields
        .getTextInputValue('description')
        ?.trim();
    const description = rawDescription && rawDescription.length > 0 ? rawDescription : null;

    await interaction.deferReply();

    // raid.name is no longer displayed — we dropped the embed title so
    // the user can put whatever title/headline they want in the description.
    // The DB column is NOT NULL though, so we store the date as a
    // self-describing fallback for any future admin queries.
    const storedName = pending.date;

    // Post an initial embed with an empty roster so we can capture the
    // message ID, then persist the raid row, then re-render with the
    // real ID so the footer timestamp matches the DB record.
    const placeholderRaid = {
        id: 0,
        messageId: '',
        channelId: pending.channelId,
        guildId: pending.guildId,
        name: storedName,
        date: pending.date,
        time: pending.time,
        description,
        createdBy: pending.createdBy,
        raiderRoleId: pending.raiderRoleId,
        minIlvl: pending.minIlvl,
        createdAt: Math.floor(Date.now() / 1000),
    };

    const emptyRoster = {
        tank: [],
        healer: [],
        dps: [],
        late: [],
        decline: [],
    };

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

    const sent = await interaction.editReply({
        embeds: [embed],
        components,
    });

    const raid = createRaid({
        messageId: sent.id,
        channelId: sent.channelId,
        guildId: pending.guildId,
        name: storedName,
        date: pending.date,
        time: pending.time,
        description,
        createdBy: pending.createdBy,
        raiderRoleId: pending.raiderRoleId,
        minIlvl: pending.minIlvl,
    });

    const freshRoster = getRoster(raid.id);
    const freshNotResponded = await computeNotResponded(guild, raid, freshRoster);
    const freshEmbed = buildRaidEmbed(
        raid,
        toEmptyEnriched(freshRoster),
        freshNotResponded
    );
    await interaction.editReply({
        embeds: [freshEmbed],
        components,
    });
}
