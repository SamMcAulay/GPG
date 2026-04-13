import {
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from 'discord.js';
import { getClientCredentialToken } from '../blizzard/oauth';
import { fetchCharacterDetails } from '../blizzard/profile';
import { RAID_LEVEL, specToRole } from '../blizzard/constants';
import { replaceCharacterCache, getAllCachedCharacters } from '../database/battleNetRepository';

export const data = new SlashCommandBuilder()
    .setName('assign')
    .setDescription('Manually assign WoW characters to a Discord user (officer only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((opt) =>
        opt
            .setName('user')
            .setDescription('The Discord user to assign characters to')
            .setRequired(true)
    )
    .addStringOption((opt) =>
        opt
            .setName('characters')
            .setDescription('Comma-separated list of "character realm" pairs, e.g. "Thrall Draenor, Jaina Silvermoon"')
            .setRequired(true)
            .setMaxLength(1000)
    );

interface ParsedChar {
    name: string;
    realm: string;
}

function parseCharacterList(input: string): ParsedChar[] {
    return input
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => {
            // Split on whitespace — last token is realm, everything before is the character name.
            // This handles multi-word realm names if the user quotes them, but the common
            // case is "Charname Realm" or "Charname Realm-Name".
            const parts = entry.split(/\s+/);
            if (parts.length < 2) {
                throw new Error(
                    `Could not parse "${entry}" — expected "character-name realm-name" (e.g. "Thrall Draenor").`
                );
            }
            // Character name is the first token, realm is everything after.
            const name = parts[0];
            const realm = parts.slice(1).join('-').toLowerCase();
            return { name, realm };
        });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild()) {
        await interaction.reply({
            content: 'This command can only be used inside a server.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const rawCharacters = interaction.options.getString('characters', true);

    let parsed: ParsedChar[];
    try {
        parsed = parseCharacterList(rawCharacters);
    } catch (err) {
        await interaction.reply({
            content: (err as Error).message,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (parsed.length === 0) {
        await interaction.reply({
            content: 'No characters provided. Use comma-separated "name realm" pairs.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let accessToken: string;
    try {
        accessToken = await getClientCredentialToken();
    } catch (err) {
        console.error('[/assign] Failed to get client credential token:', err);
        await interaction.editReply(
            'Failed to authenticate with Blizzard API. Check BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET.'
        );
        return;
    }

    const results: string[] = [];
    const successfulRows: Array<{
        realmSlug: string;
        characterName: string;
        level: number;
        className: string;
        activeSpec: string | null;
        itemLevel: number | null;
        role: string | null;
        lastPlayedTs: number | null;
    }> = [];

    for (const { name, realm } of parsed) {
        const detail = await fetchCharacterDetails(accessToken, realm, name);
        if (!detail) {
            results.push(`**${name}** (${realm}) — not found or not accessible`);
            continue;
        }

        if (detail.level < RAID_LEVEL) {
            results.push(
                `**${detail.name}** (${realm}) — level ${detail.level}, below raid level ${RAID_LEVEL}`
            );
            continue;
        }

        successfulRows.push({
            realmSlug: detail.realmSlug,
            characterName: detail.name,
            level: detail.level,
            className: detail.className,
            activeSpec: detail.activeSpecName,
            itemLevel: detail.itemLevel,
            role: specToRole(detail.activeSpecName),
            lastPlayedTs: detail.lastPlayedTimestamp ?? null,
        });

        const ilvlStr = detail.itemLevel ? ` · ilvl ${detail.itemLevel}` : '';
        const specStr = detail.activeSpecName ? `${detail.activeSpecName} ` : '';
        results.push(`**${detail.name}** (${realm}) — ${specStr}${detail.className}${ilvlStr}`);
    }

    // Merge with existing cached characters so /assign doesn't wipe previously assigned chars.
    const existing = getAllCachedCharacters(targetUser.id, RAID_LEVEL);
    const merged = [...existing.map((c) => ({
        realmSlug: c.realmSlug,
        characterName: c.characterName,
        level: c.level,
        className: c.className,
        activeSpec: c.activeSpec,
        itemLevel: c.itemLevel,
        role: c.role,
        lastPlayedTs: c.lastPlayedTs,
    }))];

    // Replace any existing entries for the same character, then add new ones.
    for (const row of successfulRows) {
        const idx = merged.findIndex(
            (m) =>
                m.realmSlug === row.realmSlug &&
                m.characterName.toLowerCase() === row.characterName.toLowerCase()
        );
        if (idx >= 0) {
            merged[idx] = row;
        } else {
            merged.push(row);
        }
    }

    if (merged.length > 0) {
        replaceCharacterCache(targetUser.id, merged);
    }

    const header = successfulRows.length > 0
        ? `Assigned ${successfulRows.length} character(s) to ${targetUser}:`
        : `No characters were assigned to ${targetUser}:`;

    await interaction.editReply(`${header}\n${results.join('\n')}`);
}
