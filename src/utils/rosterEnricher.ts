import type { RaidRoster, Signup, RaidRole } from '../database/raidRepository';
import type { EnrichedRoster, EnrichedSignup, AnnotatedCharacter } from './raidEmbed';
import { getAllCharactersForUser } from '../blizzard/characterService';
import { specToRole, getSpecForRole } from '../blizzard/constants';
import type { RaidRoleSimple } from '../blizzard/constants';
import type { CachedCharacter } from '../database/battleNetRepository';

/**
 * Look up ALL characters for every signed-up user and return an enriched
 * roster with main/alt/offspec annotations.
 *
 * Late/Decline get no character lookup — showing characters there doesn't
 * make sense and would waste API quota.
 *
 * All lookups run in parallel. Individual failures fall through to
 * `characters: null` so one linked-but-broken user can't break the embed.
 */
export async function enrichRoster(roster: RaidRoster): Promise<EnrichedRoster> {
    const [tank, healer, dps] = await Promise.all([
        Promise.all(roster.tank.map((s) => enrichOne(s, 'tank'))),
        Promise.all(roster.healer.map((s) => enrichOne(s, 'healer'))),
        Promise.all(roster.dps.map((s) => enrichOne(s, 'dps'))),
    ]);

    return {
        tank,
        healer,
        dps,
        late: roster.late.map((s) => ({ signup: s, characters: null })),
        decline: roster.decline.map((s) => ({ signup: s, characters: null })),
    };
}

/**
 * Annotate characters for a single signup:
 *
 * 1. Filter to only characters whose CLASS can fill the signup role
 *    (e.g. a Mage is excluded from a Tank signup).
 * 2. For each kept character, determine the display spec:
 *    - If the character's current spec already matches the role → use it.
 *    - Otherwise → use the spec the class WOULD use for that role (offspec).
 * 3. Sort: on-spec first, then by lastPlayedTs + ilvl.
 * 4. First character = main, rest = alts.
 */
async function enrichOne(signup: Signup, signupRole: RaidRole): Promise<EnrichedSignup> {
    try {
        const allChars = await getAllCharactersForUser(signup.userId);
        if (allChars === null) return { signup, characters: null };

        const annotated = annotateCharacters(allChars, signupRole as RaidRoleSimple);
        return { signup, characters: annotated };
    } catch (err) {
        console.error(
            `[Enricher] Failed to resolve characters for ${signup.userName} (${signup.userId}):`,
            err
        );
        return { signup, characters: null };
    }
}

function annotateCharacters(
    characters: CachedCharacter[],
    signupRole: RaidRoleSimple
): AnnotatedCharacter[] {
    const candidates: Array<{
        character: CachedCharacter;
        isOffspec: boolean;
        displaySpec: string;
    }> = [];

    for (const c of characters) {
        const currentRole = specToRole(c.activeSpec);

        if (currentRole === signupRole) {
            // Current spec matches the signup role — on-spec, show as-is.
            candidates.push({
                character: c,
                isOffspec: false,
                displaySpec: c.activeSpec ?? '??',
            });
        } else {
            // Check if this class CAN fill the role via a different spec.
            const targetSpec = getSpecForRole(c.className, signupRole);
            if (targetSpec) {
                candidates.push({
                    character: c,
                    isOffspec: true,
                    displaySpec: targetSpec,
                });
            }
            // If targetSpec is null, this class can't fill the role — skip it.
        }
    }

    // Sort: on-spec first, then by recency + ilvl (already pre-sorted from DB,
    // but the on-spec/offspec split may reorder).
    candidates.sort((a, b) => {
        if (a.isOffspec !== b.isOffspec) return a.isOffspec ? 1 : -1;
        const tsA = a.character.lastPlayedTs ?? 0;
        const tsB = b.character.lastPlayedTs ?? 0;
        if (tsB !== tsA) return tsB - tsA;
        return (b.character.itemLevel ?? 0) - (a.character.itemLevel ?? 0);
    });

    return candidates.map((entry, i) => ({
        character: entry.character,
        isMain: i === 0,
        isOffspec: entry.isOffspec,
        displaySpec: entry.displaySpec,
    }));
}
