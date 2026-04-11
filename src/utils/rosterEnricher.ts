import type { RaidRoster, Signup } from '../database/raidRepository';
import type { EnrichedRoster, EnrichedSignup } from './raidEmbed';
import { getCharactersForRole } from '../blizzard/characterService';
import type { ButtonRole } from '../blizzard/characterService';

/**
 * Look up the characters for every user currently signed up as tank/healer/
 * dps and return an enriched roster ready for buildRaidEmbed.
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

async function enrichOne(signup: Signup, role: ButtonRole): Promise<EnrichedSignup> {
    try {
        const chars = await getCharactersForRole(signup.userId, role);
        return { signup, characters: chars };
    } catch (err) {
        console.error(
            `[Enricher] Failed to resolve characters for ${signup.userName} (${signup.userId}):`,
            err
        );
        return { signup, characters: null };
    }
}
