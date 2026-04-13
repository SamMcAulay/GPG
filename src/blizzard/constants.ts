/**
 * Blizzard API configuration and spec→role mapping.
 *
 * The API base host and namespace differ between region and product
 * (Retail vs Classic). We assume **Retail — Midnight** by default (level
 * cap 80, retail profile namespace). Override via env vars if you move
 * to a different game flavor or the level cap changes in a later patch.
 */

export type BlizzardRegion = 'us' | 'eu' | 'kr' | 'tw';

export const REGION: BlizzardRegion =
    (process.env.BLIZZARD_REGION as BlizzardRegion) || 'us';

export const OAUTH_AUTHORIZE_URL = 'https://oauth.battle.net/authorize';
export const OAUTH_TOKEN_URL = 'https://oauth.battle.net/token';
export const OAUTH_USERINFO_URL = 'https://oauth.battle.net/userinfo';

export const API_HOST = `https://${REGION}.api.blizzard.com`;

/**
 * Namespace for the WoW Profile API. Defaults to Retail. Override with
 *   BLIZZARD_PROFILE_NAMESPACE=profile-classic-us    # Wrath/Cata/MoP Classic
 *   BLIZZARD_PROFILE_NAMESPACE=profile-classic1x-us  # Classic Era (vanilla)
 */
export const PROFILE_NAMESPACE =
    process.env.BLIZZARD_PROFILE_NAMESPACE || `profile-${REGION}`;

export const LOCALE = process.env.BLIZZARD_LOCALE || 'en_US';

/**
 * Minimum level for a character to be considered "raid-ready". Retail
 * Midnight caps at 80; if Blizzard bumps the cap mid-expansion, flip this
 * via the RAID_LEVEL env var without a redeploy of the code.
 */
export const RAID_LEVEL = Number(process.env.RAID_LEVEL || 80);

export const OAUTH_SCOPE = 'wow.profile';

export type RaidRoleSimple = 'tank' | 'healer' | 'dps';

/**
 * Spec-name → role map for Retail WoW (Midnight-era). Blizzard returns
 * `active_spec.name` as a localized string, so we match against English
 * names and fall back to `null` (unknown role) if the client requested a
 * non-English locale. Keys are lowercased for case-insensitive lookup.
 *
 * Spec-name collisions across classes resolve the same way (e.g. both
 * Paladin and Warrior "Protection" are tanks; both Druid and Shaman
 * "Restoration" are healers), so a flat map is fine.
 */
const SPEC_ROLE_MAP: Record<string, RaidRoleSimple> = {
    // Death Knight
    blood: 'tank',
    frost: 'dps', // DK Frost shares name with Mage Frost — both dps
    unholy: 'dps',
    // Demon Hunter
    havoc: 'dps',
    vengeance: 'tank',
    // Druid
    balance: 'dps',
    feral: 'dps',
    guardian: 'tank',
    restoration: 'healer', // also Shaman Restoration
    // Evoker
    devastation: 'dps',
    preservation: 'healer',
    augmentation: 'dps',
    // Hunter
    'beast mastery': 'dps',
    marksmanship: 'dps',
    survival: 'dps',
    // Mage
    arcane: 'dps',
    fire: 'dps',
    // Monk
    brewmaster: 'tank',
    mistweaver: 'healer',
    windwalker: 'dps',
    // Paladin
    holy: 'healer', // also Priest Holy
    protection: 'tank', // also Warrior Protection
    retribution: 'dps',
    // Priest
    discipline: 'healer',
    shadow: 'dps',
    // Rogue
    assassination: 'dps',
    outlaw: 'dps',
    subtlety: 'dps',
    // Shaman
    elemental: 'dps',
    enhancement: 'dps',
    // Warlock
    affliction: 'dps',
    demonology: 'dps',
    destruction: 'dps',
    // Warrior
    arms: 'dps',
    fury: 'dps',
};

/**
 * Resolve a spec name to a role. Returns null when the spec can't be
 * mapped (e.g. unlocalized names, unknown expansions). The caller then
 * excludes the character from role-filtered lists.
 */
export function specToRole(specName: string | null | undefined): RaidRoleSimple | null {
    if (!specName) return null;
    return SPEC_ROLE_MAP[specName.toLowerCase()] ?? null;
}

/**
 * Class → role → spec mapping. For each WoW class, maps which spec
 * would be used to fill a given raid role. Used to display the correct
 * offspec label (e.g. "Blood Death Knight" when a DK signs up as tank
 * but is currently specced Unholy).
 *
 * When a class has multiple specs for one role (e.g. DK has Frost and
 * Unholy for DPS), one is chosen as the default. The actual current spec
 * takes priority when it already matches the role.
 *
 * Keys are lowercased for case-insensitive lookup.
 */
const CLASS_ROLE_SPEC: Record<string, Partial<Record<RaidRoleSimple, string>>> = {
    'death knight': { tank: 'Blood', dps: 'Unholy' },
    'demon hunter': { tank: 'Vengeance', dps: 'Havoc' },
    'druid': { tank: 'Guardian', healer: 'Restoration', dps: 'Balance' },
    'evoker': { healer: 'Preservation', dps: 'Devastation' },
    'hunter': { dps: 'Marksmanship' },
    'mage': { dps: 'Frost' },
    'monk': { tank: 'Brewmaster', healer: 'Mistweaver', dps: 'Windwalker' },
    'paladin': { tank: 'Protection', healer: 'Holy', dps: 'Retribution' },
    'priest': { healer: 'Discipline', dps: 'Shadow' },
    'rogue': { dps: 'Assassination' },
    'shaman': { healer: 'Restoration', dps: 'Elemental' },
    'warlock': { dps: 'Affliction' },
    'warrior': { tank: 'Protection', dps: 'Arms' },
};

/**
 * Given a class name and a desired role, return the spec that class would
 * use to fill that role. Returns null if the class cannot fill the role
 * (e.g. Mage cannot tank).
 */
export function getSpecForRole(
    className: string | null | undefined,
    role: RaidRoleSimple
): string | null {
    if (!className) return null;
    return CLASS_ROLE_SPEC[className.toLowerCase()]?.[role] ?? null;
}
