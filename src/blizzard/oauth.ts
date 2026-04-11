import crypto from 'node:crypto';
import {
    OAUTH_AUTHORIZE_URL,
    OAUTH_SCOPE,
    OAUTH_TOKEN_URL,
    OAUTH_USERINFO_URL,
    REGION,
} from './constants';
import {
    getBattleNetLink,
    updateAccessToken,
    type BattleNetLink,
} from '../database/battleNetRepository';

/**
 * Discord-user-id ↔ state-token mapping for OAuth flows in progress.
 * Kept in memory because auth flows are short-lived (~5 min); if the bot
 * restarts mid-flow, the user just re-runs /link.
 */
interface PendingState {
    discordUserId: string;
    createdAt: number;
}
const pendingStates = new Map<string, PendingState>();
const STATE_TTL_MS = 10 * 60 * 1000;

function purgeExpiredStates(): void {
    const now = Date.now();
    for (const [state, { createdAt }] of pendingStates) {
        if (now - createdAt > STATE_TTL_MS) pendingStates.delete(state);
    }
}

/**
 * Start an OAuth flow for a given Discord user. Returns a fully formed
 * authorization URL they can click to grant consent at battle.net.
 */
export function beginLinkFlow(discordUserId: string): string {
    purgeExpiredStates();
    const state = crypto.randomBytes(24).toString('hex');
    pendingStates.set(state, { discordUserId, createdAt: Date.now() });

    const redirectUri = getRedirectUri();
    const params = new URLSearchParams({
        client_id: requireClientId(),
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: OAUTH_SCOPE,
        state,
    });
    return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export function consumeState(state: string): string | null {
    purgeExpiredStates();
    const entry = pendingStates.get(state);
    if (!entry) return null;
    pendingStates.delete(state);
    return entry.discordUserId;
}

function requireClientId(): string {
    const id = process.env.BLIZZARD_CLIENT_ID;
    if (!id) throw new Error('BLIZZARD_CLIENT_ID is not set.');
    return id;
}

function requireClientSecret(): string {
    const secret = process.env.BLIZZARD_CLIENT_SECRET;
    if (!secret) throw new Error('BLIZZARD_CLIENT_SECRET is not set.');
    return secret;
}

export function getRedirectUri(): string {
    const base = process.env.PUBLIC_BASE_URL;
    if (!base) {
        throw new Error(
            'PUBLIC_BASE_URL is not set. Set it to your public Railway domain ' +
                '(e.g. https://grey-parse-gary.up.railway.app) so the OAuth callback resolves.'
        );
    }
    return `${base.replace(/\/$/, '')}/auth/callback`;
}

interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope?: string;
    refresh_token?: string;
}

/**
 * Exchange an authorization `code` (delivered to the callback URL) for
 * an access+refresh token pair. The Blizzard token endpoint uses HTTP Basic
 * auth with the client credentials; the code goes in the request body.
 */
export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: getRedirectUri(),
    });

    return postToken(body);
}

/**
 * Refresh an expired access token using a stored refresh token.
 * Blizzard may or may not issue a new refresh token in the response; we
 * persist whichever we receive so long-term refresh rotation keeps working.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    });
    return postToken(body);
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
    const basic = Buffer.from(
        `${requireClientId()}:${requireClientSecret()}`
    ).toString('base64');

    const res = await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Blizzard token request failed: ${res.status} ${text}`);
    }
    return (await res.json()) as TokenResponse;
}

/**
 * Fetch the Battle.net user's battleTag (username#1234). Handy to show in
 * the /link confirmation so users know which account they attached.
 */
export async function fetchBattleTag(accessToken: string): Promise<string | null> {
    const res = await fetch(OAUTH_USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { battletag?: string };
    return json.battletag ?? null;
}

/**
 * Get a valid (non-expired) access token for a Discord user, transparently
 * refreshing if needed. Returns null if the user isn't linked or the
 * refresh failed (e.g. user revoked authorization on battle.net).
 */
export async function getValidAccessToken(
    discordUserId: string
): Promise<BattleNetLink | null> {
    const link = getBattleNetLink(discordUserId);
    if (!link) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    // Refresh 60s before actual expiry to avoid racing Blizzard's clock.
    if (link.expiresAt > nowSec + 60) return link;

    if (!link.refreshToken) return null;

    try {
        const refreshed = await refreshAccessToken(link.refreshToken);
        const newExpiresAt = nowSec + refreshed.expires_in;
        updateAccessToken(
            discordUserId,
            refreshed.access_token,
            newExpiresAt,
            refreshed.refresh_token ?? undefined
        );
        return {
            ...link,
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token ?? link.refreshToken,
            expiresAt: newExpiresAt,
        };
    } catch (err) {
        console.error(`[Blizzard] Token refresh failed for ${discordUserId}:`, err);
        return null;
    }
}

export const _currentRegion = REGION;
