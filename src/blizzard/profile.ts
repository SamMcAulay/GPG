import { API_HOST, LOCALE, PROFILE_NAMESPACE } from './constants';

/**
 * Minimal shape of the fields we care about from the Blizzard WoW API.
 * We don't model the whole response — just the bits that feed the embed.
 */
export interface AccountCharacterSummary {
    name: string;
    realm: { slug: string; name: string };
    level: number;
    playable_class: { name: string };
    playable_race: { name: string };
    character: { href: string };
}

interface AccountProfileResponse {
    wow_accounts?: Array<{
        characters?: AccountCharacterSummary[];
    }>;
}

export interface CharacterDetails {
    name: string;
    realmSlug: string;
    level: number;
    className: string;
    activeSpecName: string | null;
    itemLevel: number | null;
}

/**
 * Fetch the account profile summary: every WoW character on the account
 * (across all wow_accounts). Blizzard returns characters that have been
 * seen by the profile service recently; truly-stale alts may be omitted
 * until their owner logs them in once.
 */
export async function fetchAccountCharacters(
    accessToken: string
): Promise<AccountCharacterSummary[]> {
    const url = new URL(`${API_HOST}/profile/user/wow`);
    url.searchParams.set('namespace', PROFILE_NAMESPACE);
    url.searchParams.set('locale', LOCALE);

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        throw new Error(
            `Blizzard profile summary failed: ${res.status} ${await res.text()}`
        );
    }

    const json = (await res.json()) as AccountProfileResponse;
    const out: AccountCharacterSummary[] = [];
    for (const acc of json.wow_accounts ?? []) {
        for (const c of acc.characters ?? []) {
            out.push(c);
        }
    }
    return out;
}

/**
 * Fetch detailed info for one character: active spec and equipped ilvl.
 * Uses the protected profile endpoint so the user's own access token can
 * see even non-public characters on their account.
 */
export async function fetchCharacterDetails(
    accessToken: string,
    realmSlug: string,
    characterName: string
): Promise<CharacterDetails | null> {
    // Character names are URL-encoded. Blizzard requires lowercase.
    const encodedName = encodeURIComponent(characterName.toLowerCase());
    const encodedRealm = encodeURIComponent(realmSlug.toLowerCase());

    const url = new URL(
        `${API_HOST}/profile/wow/character/${encodedRealm}/${encodedName}`
    );
    url.searchParams.set('namespace', PROFILE_NAMESPACE);
    url.searchParams.set('locale', LOCALE);

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
        console.warn(
            `[Blizzard] Character detail fetch failed (${res.status}) for ${characterName}-${realmSlug}`
        );
        return null;
    }

    const json = (await res.json()) as {
        name: string;
        level: number;
        character_class: { name: string };
        active_spec?: { name?: string } | null;
        equipped_item_level?: number | null;
        average_item_level?: number | null;
    };

    return {
        name: json.name,
        realmSlug,
        level: json.level,
        className: json.character_class.name,
        activeSpecName: json.active_spec?.name ?? null,
        itemLevel:
            json.equipped_item_level ??
            json.average_item_level ??
            null,
    };
}
