import type { RaidRoster, Signup, RaidRole } from '../database/raidRepository';
import type { EnrichedRoster, EnrichedSignup, AnnotatedCharacter } from './raidEmbed';
import { getAllCharactersForUser } from '../blizzard/characterService';
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
 * Annotate characters for a single signup. The first character in the
 * list (sorted by lastPlayedTs DESC, ilvl DESC) is the "main"; the rest
 * are "alts". Any character whose cached role doesn't match the signup
 * role is flagged as "offspec".
 */
async function enrichOne(signup: Signup, signupRole: RaidRole): Promise<EnrichedSignup> {
    try {
        const allChars = await getAllCharactersForUser(signup.userId);
        if (allChars === null) return { signup, characters: null };

        const annotated = annotateCharacters(allChars, signupRole);
        return { signup, characters: annotated };
    } catch (err) {
        console.error(
            `[Enricher] Failed to resolve characters for ${signup.userName} (${signup.userId}):`,
            err
        );
        return { signup, characters: null };
    }
}

/**
 * Given a user's full character list (already sorted by recency + ilvl
 * from the DB query) and the role they signed up for, produce annotated
 * entries with main/alt/offspec flags.
 */
function annotateCharacters(
    characters: CachedCharacter[],
    signupRole: RaidRole
): AnnotatedCharacter[] {
    return characters.map((c, i) => ({
        character: c,
        isMain: i === 0,
        isOffspec: c.role !== signupRole,
    }));
}
