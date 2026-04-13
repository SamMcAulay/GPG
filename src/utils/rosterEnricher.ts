import type { RaidRoster, Signup, RaidRole } from '../database/raidRepository';
import type { EnrichedRoster, EnrichedSignup, AnnotatedCharacter } from './raidEmbed';
import { getAllCharactersForUser } from '../blizzard/characterService';
import { specToRole, getSpecsForRole } from '../blizzard/constants';
import type { RaidRoleSimple } from '../blizzard/constants';
import type { CachedCharacter } from '../database/battleNetRepository';

/** Characters played within this window count as "recently active". */
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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
 * 1. Filter to only characters whose CLASS can fill the signup role.
 * 2. For each kept character, determine the display spec:
 *    - On-spec: current spec matches the role → show current spec.
 *    - Offspec: current spec doesn't match → show all viable specs for
 *      the role joined with "/" (e.g. "balance/feral Druid").
 * 3. Sort by ilvl (primary), with recent playtime (last 30 days) as
 *    tiebreaker. On-spec characters sort above offspec.
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
    const now = Date.now();
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
            const viableSpecs = getSpecsForRole(c.className, signupRole);
            if (viableSpecs.length === 0) continue; // class can't fill this role

            candidates.push({
                character: c,
                isOffspec: true,
                displaySpec: viableSpecs.join('/'),
            });
        }
    }

    // Sort: on-spec above offspec, then ilvl DESC (primary), then recent
    // playtime as tiebreaker (characters active in last 30 days sort above
    // those that haven't been touched).
    candidates.sort((a, b) => {
        // On-spec always beats offspec
        if (a.isOffspec !== b.isOffspec) return a.isOffspec ? 1 : -1;

        // Primary: ilvl
        const ilvlDiff = (b.character.itemLevel ?? 0) - (a.character.itemLevel ?? 0);
        if (ilvlDiff !== 0) return ilvlDiff;

        // Tiebreaker: recently played (last 30 days) beats not
        const aRecent = (a.character.lastPlayedTs ?? 0) > now - RECENT_WINDOW_MS;
        const bRecent = (b.character.lastPlayedTs ?? 0) > now - RECENT_WINDOW_MS;
        if (aRecent !== bRecent) return aRecent ? -1 : 1;

        // Final tiebreaker: more recent play first
        return (b.character.lastPlayedTs ?? 0) - (a.character.lastPlayedTs ?? 0);
    });

    return candidates.map((entry, i) => ({
        character: entry.character,
        isMain: i === 0,
        isOffspec: entry.isOffspec,
        displaySpec: entry.displaySpec,
    }));
}
