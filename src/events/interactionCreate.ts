import {
    Events,
    Interaction,
    ButtonInteraction,
    MessageFlags,
} from 'discord.js';
import { commands } from '../commands';
import * as makeraid from '../commands/makeraid';
import {
    getRaidByMessageId,
    getRoster,
    upsertSignup,
    type RaidRole,
} from '../database/raidRepository';
import { buildRaidEmbed, buildRaidButtons } from '../utils/raidEmbed';
import { computeNotResponded } from '../utils/raidHelpers';
import { enrichRoster } from '../utils/rosterEnricher';

const VALID_ROLES: ReadonlySet<RaidRole> = new Set<RaidRole>([
    'tank',
    'healer',
    'dps',
    'late',
    'decline',
]);

const ROLE_LABELS: Record<RaidRole, string> = {
    tank: 'Tank',
    healer: 'Healer',
    dps: 'DPS',
    late: 'Late',
    decline: 'Decline',
};

async function handleSignupButton(interaction: ButtonInteraction): Promise<void> {
    const role = interaction.customId.slice('signup_'.length) as RaidRole;

    if (!VALID_ROLES.has(role)) {
        await interaction.reply({
            content: 'Unknown button.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const raid = getRaidByMessageId(interaction.message.id);
    if (!raid) {
        await interaction.reply({
            content:
                'This raid post is no longer tracked. Ask leadership to create a new one with `/makeraid`.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    // Prefer the guild display name (nickname) so rosters match how the
    // user actually shows up in chat. Fall back to global username.
    const displayName =
        (interaction.member && 'displayName' in interaction.member
            ? (interaction.member.displayName as string)
            : null) ?? interaction.user.username;

    upsertSignup({
        raidId: raid.id,
        userId: interaction.user.id,
        userName: displayName,
        role,
    });

    // Battle.net character fetches can exceed Discord's 3-second interaction
    // ack window, so defer the update before doing any async work.
    await interaction.deferUpdate();

    const roster = getRoster(raid.id);
    const guild = interaction.guild;
    const [enriched, notResponded] = await Promise.all([
        enrichRoster(roster),
        guild ? computeNotResponded(guild, raid, roster) : Promise.resolve([]),
    ]);

    const embed = buildRaidEmbed(raid, enriched, notResponded);

    await interaction.editReply({
        embeds: [embed],
        components: [buildRaidButtons()],
    });

    await interaction.followUp({
        content: `Signed up as **${ROLE_LABELS[role]}**.`,
        flags: MessageFlags.Ephemeral,
    });
}

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction: Interaction): Promise<void> {
    try {
        if (interaction.isChatInputCommand()) {
            const command = commands[interaction.commandName];
            if (!command) {
                await interaction.reply({
                    content: 'Unknown command.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            await command.execute(interaction);
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith('signup_')) {
            await handleSignupButton(interaction);
            return;
        }

        if (interaction.isModalSubmit() && makeraid.ownsModal(interaction.customId)) {
            await makeraid.handleModalSubmit(interaction);
            return;
        }
    } catch (err) {
        console.error('[interactionCreate] handler error:', err);
        if (interaction.isRepliable()) {
            const msg = 'Something went wrong handling that interaction. Please try again.';
            if (interaction.replied || interaction.deferred) {
                await interaction
                    .followUp({ content: msg, flags: MessageFlags.Ephemeral })
                    .catch(() => {});
            } else {
                await interaction
                    .reply({ content: msg, flags: MessageFlags.Ephemeral })
                    .catch(() => {});
            }
        }
    }
}
