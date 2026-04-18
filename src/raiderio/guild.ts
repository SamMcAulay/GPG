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

const BASE_URL = 'https://raider.io/api/v1';
const MAX_MEMBERS_TO_QUERY = 200;
const CONCURRENCY = 10;

export interface RaiderIoCharacter {
    name: string;
    realm: string;
    class: string;
    activeSpec: string;
    profileUrl: string;
    mythicPlusScore: number;
    mythicPlusRunCount: number;
}

interface RawMember {
    rank: number;
    character: {
        name: string;
        race: string;
        class: string;
        active_spec_name: string;
        active_spec_role: string;
        region: string;
        realm: string;
        profile_url: string;
    };
}

interface GuildProfileResponse {
    name: string;
    realm: string;
    region: string;
    members: RawMember[];
}

interface CharacterProfileResponse {
    name: string;
    class: string;
    active_spec_name: string;
    profile_url: string;
    mythic_plus_scores_by_season?: Array<{
        season: string;
        scores: { all: number };
    }>;
    mythic_plus_best_runs?: Array<{ mythic_level: number }>;
    mythic_plus_recent_runs?: Array<{ mythic_level: number }>;
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

/**
 * Fetch a single character's M+ data.
 */
async function fetchCharacterScore(
    name: string,
    realm: string,
    region: string
): Promise<{
    score: number;
    runCount: number;
    spec: string;
    className: string;
    profileUrl: string;
} | null> {
    const params = new URLSearchParams({
        region,
        realm,
        name: name.toLowerCase(),
        fields: 'mythic_plus_scores_by_season:current,mythic_plus_best_runs,mythic_plus_recent_runs',
    });

    try {
        const res = await fetch(`${BASE_URL}/characters/profile?${params}`);
        if (!res.ok) return null;

        const data = (await res.json()) as CharacterProfileResponse;
        const seasons = data.mythic_plus_scores_by_season ?? [];
        const score = seasons[0]?.scores?.all ?? 0;
        // best_runs = top timed per dungeon, recent_runs = last 10 completed
        const bestCount = data.mythic_plus_best_runs?.length ?? 0;
        const recentCount = data.mythic_plus_recent_runs?.length ?? 0;

        return {
            score,
            runCount: Math.max(bestCount, recentCount),
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
 * Returns characters sorted by M+ score descending. Characters with
 * zero score are excluded.
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

    // Batch-fetch character profiles.
    const tasks = members.map((m) => () =>
        fetchCharacterScore(m.character.name, m.character.realm, region)
            .then((result) =>
                result ? { member: m, ...result } : null
            )
    );

    const results = await batchRun(tasks, CONCURRENCY);

    const characters: RaiderIoCharacter[] = [];
    for (const r of results) {
        if (!r || r.score <= 0) continue;

        characters.push({
            name: r.member.character.name,
            realm: r.member.character.realm,
            class: r.className,
            activeSpec: r.spec,
            profileUrl: r.profileUrl,
            mythicPlusScore: r.score,
            mythicPlusRunCount: r.runCount,
        });
    }

    characters.sort((a, b) => b.mythicPlusScore - a.mythicPlusScore);

    console.log(
        `[RaiderIO] Found ${characters.length} characters with M+ scores for ${guildName}-${realm}`
    );

    return characters;
}
