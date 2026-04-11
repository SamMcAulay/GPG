import {
    Events,
    Interaction,
    ButtonInteraction,
    MessageFlags,
} from 'discord.js';
import { commands } from '../commands';
import {
    getRaidByMessageId,
    getRoster,
    upsertSignup,
    type RaidRole,
} from '../database/raidRepository';
import { buildRaidEmbed, buildRaidButtons } from '../utils/raidEmbed';
import { getGaryQuip } from '../utils/garyQuips';

const VALID_ROLES: ReadonlySet<RaidRole> = new Set<RaidRole>([
    'tank',
    'healer',
    'dps',
    'late',
    'decline',
]);

async function handleSignupButton(interaction: ButtonInteraction): Promise<void> {
    // CustomId is shaped `signup_<role>`.
    const role = interaction.customId.slice('signup_'.length) as RaidRole;

    if (!VALID_ROLES.has(role)) {
        await interaction.reply({
            content: "That button doesn't look right to me. Gary is confused.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const raid = getRaidByMessageId(interaction.message.id);
    if (!raid) {
        await interaction.reply({
            content:
                "This raid post isn't in my memory anymore — maybe it was cleared out. Ask leadership to run `/makeraid` again.",
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

    const roster = getRoster(raid.id);
    const embed = buildRaidEmbed(raid, roster);

    // interaction.update() edits the original message in place, which both
    // acknowledges the interaction AND refreshes the embed atomically.
    await interaction.update({
        embeds: [embed],
        components: [buildRaidButtons()],
    });

    // Fire a secondary ephemeral quip so the user gets direct feedback
    // without cluttering the channel.
    await interaction.followUp({
        content: getGaryQuip(role),
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
                    content: "I don't know that command. Gary shrugs.",
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
    } catch (err) {
        console.error('[interactionCreate] handler error:', err);
        if (interaction.isRepliable()) {
            const msg =
                "Something went sideways. I probably stood in the fire again. Try once more?";
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
            } else {
                await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    }
}
