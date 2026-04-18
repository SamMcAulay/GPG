/**
 * WoW class → spec mapping. Raider.IO returns per-spec M+ scores as
 * `spec_0`, `spec_1`, `spec_2`, `spec_3`, indexed in the same order as
 * the in-game spec list for each class. We map the index back to the
 * spec name and its role here.
 */

export type SpecRole = 'tank' | 'healer' | 'dps';

export interface SpecInfo {
    name: string;
    role: SpecRole;
}

/**
 * Spec order per class, as Raider.IO indexes them. Verified against
 * `mythic_plus_scores_by_season` responses where the active spec's
 * score matches its expected position.
 */
export const CLASS_SPECS: Record<string, SpecInfo[]> = {
    'Death Knight': [
        { name: 'Blood', role: 'tank' },
        { name: 'Frost', role: 'dps' },
        { name: 'Unholy', role: 'dps' },
    ],
    'Demon Hunter': [
        { name: 'Havoc', role: 'dps' },
        { name: 'Vengeance', role: 'tank' },
    ],
    Druid: [
        { name: 'Balance', role: 'dps' },
        { name: 'Feral', role: 'dps' },
        { name: 'Guardian', role: 'tank' },
        { name: 'Restoration', role: 'healer' },
    ],
    Evoker: [
        { name: 'Devastation', role: 'dps' },
        { name: 'Preservation', role: 'healer' },
        { name: 'Augmentation', role: 'dps' },
    ],
    Hunter: [
        { name: 'Beast Mastery', role: 'dps' },
        { name: 'Marksmanship', role: 'dps' },
        { name: 'Survival', role: 'dps' },
    ],
    Mage: [
        { name: 'Arcane', role: 'dps' },
        { name: 'Fire', role: 'dps' },
        { name: 'Frost', role: 'dps' },
    ],
    Monk: [
        { name: 'Brewmaster', role: 'tank' },
        { name: 'Mistweaver', role: 'healer' },
        { name: 'Windwalker', role: 'dps' },
    ],
    Paladin: [
        { name: 'Holy', role: 'healer' },
        { name: 'Protection', role: 'tank' },
        { name: 'Retribution', role: 'dps' },
    ],
    Priest: [
        { name: 'Discipline', role: 'healer' },
        { name: 'Holy', role: 'healer' },
        { name: 'Shadow', role: 'dps' },
    ],
    Rogue: [
        { name: 'Assassination', role: 'dps' },
        { name: 'Outlaw', role: 'dps' },
        { name: 'Subtlety', role: 'dps' },
    ],
    Shaman: [
        { name: 'Elemental', role: 'dps' },
        { name: 'Enhancement', role: 'dps' },
        { name: 'Restoration', role: 'healer' },
    ],
    Warlock: [
        { name: 'Affliction', role: 'dps' },
        { name: 'Demonology', role: 'dps' },
        { name: 'Destruction', role: 'dps' },
    ],
    Warrior: [
        { name: 'Arms', role: 'dps' },
        { name: 'Fury', role: 'dps' },
        { name: 'Protection', role: 'tank' },
    ],
};
