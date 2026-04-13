import type {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
    SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

export interface Command {
    data:
        | SlashCommandBuilder
        | SlashCommandOptionsOnlyBuilder
        | SlashCommandSubcommandsOnlyBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

import * as makeraid from './makeraid';
import * as link from './link';
import * as assign from './assign';

export const commands: Record<string, Command> = {
    [makeraid.data.name]: makeraid as Command,
    [link.data.name]: link as Command,
    [assign.data.name]: assign as Command,
};
