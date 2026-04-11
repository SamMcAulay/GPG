import {
    ChatInputCommandInteraction,
    MessageFlags,
    SlashCommandBuilder,
} from 'discord.js';
import { beginLinkFlow } from '../blizzard/oauth';
import { getBattleNetLink } from '../database/battleNetRepository';

export const data = new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Battle.net account so the bot can show your characters in raid signups.');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    let authUrl: string;
    try {
        authUrl = beginLinkFlow(interaction.user.id);
    } catch (err) {
        console.error('[/link] Failed to build OAuth URL:', err);
        await interaction.reply({
            content:
                'The bot is missing Battle.net configuration. Ask whoever runs the bot to set ' +
                '`BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, and `PUBLIC_BASE_URL`.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const existing = getBattleNetLink(interaction.user.id);
    const preface = existing
        ? `You already have ${existing.battleTag ?? 'an account'} linked. Clicking below replaces it.\n\n`
        : '';

    await interaction.reply({
        content:
            preface +
            `Click this link to authorize the bot to read your WoW characters:\n${authUrl}\n\n` +
            'This link is personal to you — do not share it. It expires in 10 minutes.',
        flags: MessageFlags.Ephemeral,
    });
}
