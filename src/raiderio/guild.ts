/**
 * Raider.IO API integration for guild M+ leaderboard data.
 *
 * Strategy:
 *  1. Fetch guild roster from the /guilds/profile endpoint (basic info).
 *  2. Batch-fetch each member's M+ score from the /characters/profile endpoint.
 *  3. Sort by score and return.
 *
 * To stay friendly with Raider.IO rate limits we limit concurrency and
 * cap the total number of members we query.
 */

import { CLASS_SPECS, type SpecRole } from './specs';

const BASE_URL = 'https://raider.io/api/v1';
const MAX_MEMBERS_TO_QUERY = 200;
const CONCURRENCY = 10;

export interface SpecScore {
    spec: string;
    role: SpecRole;
    score: number;
}

export interface RaiderIoCharacter {
    name: string;
    realm: string;
    class: string;
    activeSpec: string;
    profileUrl: string;
    /** Overall M+ score (Raider.IO's "all" field). */
    scoreAll: number;
    /** Per-spec scores, sorted by score descending. Only includes specs with non-zero score. */
    specScores: SpecScore[];
}

interface RawMember {
    rank: number;
    character: {
        name: string;
        class: string;
        active_spec_name: string;
        region: string;
        realm: string;
        profile_url: string;
    };
}

interface GuildProfileResponse {
    members: RawMember[];
}

interface CharacterProfileResponse {
    name: string;
    class: string;
    active_spec_name: string;
    profile_url: string;
    mythic_plus_scores_by_season?: Array<{
        season: string;
        scores: RawScores;
    }>;
}

/**
 * Run promises with limited concurrency.
 */
async function batchRun<T>(
    tasks: (() => Promise<T>)[],
    concurrency: number
): Promise<T[]> {
    const results: T[] = [];
    let idx = 0;

    async function worker(): Promise<void> {
        while (idx < tasks.length) {
            const i = idx++;
            results[i] = await tasks[i]();
        }
    }

    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return results;
}

interface RawScores {
    all: number;
    spec_0?: number;
    spec_1?: number;
    spec_2?: number;
    spec_3?: number;
}

/**
 * Resolve Raider.IO's spec_0/1/2/3 scores to named specs using the
 * class's canonical spec order. Returns specs with non-zero score,
 * sorted descending.
 */
function resolveSpecScores(className: string, scores: RawScores): SpecScore[] {
    const specs = CLASS_SPECS[className];
    if (!specs) return [];

    const raw = [
        scores.spec_0 ?? 0,
        scores.spec_1 ?? 0,
        scores.spec_2 ?? 0,
        scores.spec_3 ?? 0,
    ];

    const result: SpecScore[] = [];
    for (let i = 0; i < specs.length; i++) {
        if (raw[i] > 0) {
            result.push({ spec: specs[i].name, role: specs[i].role, score: raw[i] });
        }
    }

    result.sort((a, b) => b.score - a.score);
    return result;
}

async function fetchCharacterScore(
    name: string,
    realm: string,
    region: string
): Promise<{
    scoreAll: number;
    specScores: SpecScore[];
    spec: string;
    className: string;
    profileUrl: string;
} | null> {
    const params = new URLSearchParams({
        region,
        realm,
        name: name.toLowerCase(),
        fields: 'mythic_plus_scores_by_season:current',
    });

    try {
        const res = await fetch(`${BASE_URL}/characters/profile?${params}`);
        if (!res.ok) return null;

        const data = (await res.json()) as CharacterProfileResponse;
        const scores = data.mythic_plus_scores_by_season?.[0]?.scores;

        return {
            scoreAll: scores?.all ?? 0,
            specScores: scores ? resolveSpecScores(data.class, scores) : [],
            spec: data.active_spec_name,
            className: data.class,
            profileUrl: data.profile_url,
        };
    } catch {
        return null;
    }
}

/**
 * Fetch guild members with their M+ data from Raider.IO.
 *
 * Returns characters sorted by overall M+ score descending. Characters
 * with zero score are excluded.
 */
export async function fetchGuildMythicPlus(
    guildName: string,
    realm: string,
    region: string
): Promise<RaiderIoCharacter[]> {
    const params = new URLSearchParams({
        region,
        realm,
        name: guildName,
        fields: 'members',
    });

    const url = `${BASE_URL}/guilds/profile?${params}`;
    console.log(`[RaiderIO] Fetching guild roster: ${guildName}-${realm} (${region})`);

    const res = await fetch(url);

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
            `Raider.IO API error ${res.status}: ${text.slice(0, 200)}`
        );
    }

    const data = (await res.json()) as GuildProfileResponse;
    const members = data.members.slice(0, MAX_MEMBERS_TO_QUERY);

    console.log(
        `[RaiderIO] Fetching M+ scores for ${members.length} members (of ${data.members.length} total)...`
    );

    const tasks = members.map((m) => () =>
        fetchCharacterScore(m.character.name, m.character.realm, region)
            .then((result) => (result ? { member: m, ...result } : null))
    );

    const results = await batchRun(tasks, CONCURRENCY);

    const characters: RaiderIoCharacter[] = [];
    for (const r of results) {
        if (!r || r.scoreAll <= 0) continue;

        characters.push({
            name: r.member.character.name,
            realm: r.member.character.realm,
            class: r.className,
            activeSpec: r.spec,
            profileUrl: r.profileUrl,
            scoreAll: r.scoreAll,
            specScores: r.specScores,
        });
    }

    characters.sort((a, b) => b.scoreAll - a.scoreAll);

    console.log(
        `[RaiderIO] Found ${characters.length} characters with M+ scores for ${guildName}-${realm}`
    );

    return characters;
}
