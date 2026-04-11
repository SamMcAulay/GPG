import express from 'express';
import {
    consumeState,
    exchangeCodeForToken,
    fetchBattleTag,
} from '../blizzard/oauth';
import { upsertBattleNetLink } from '../database/battleNetRepository';
import { REGION } from '../blizzard/constants';

/**
 * Start the OAuth callback HTTP server.
 *
 * The only route that matters is `/auth/callback`. Blizzard redirects users
 * here with `code` and `state` after they've authorized the app. We swap
 * the code for tokens and persist the link keyed on the Discord user id
 * that started the flow (pulled from the state token).
 *
 * `/` returns a boring "OK" so Railway's healthcheck passes and humans who
 * visit the domain don't see an ugly 404.
 */
export function startHttpServer(): void {
    const app = express();
    const port = Number(process.env.PORT || 3000);

    app.get('/', (_req, res) => {
        res.type('text/plain').send('Grey Parse Gary — OAuth callback service.');
    });

    app.get('/auth/callback', async (req, res) => {
        const code = typeof req.query.code === 'string' ? req.query.code : null;
        const state = typeof req.query.state === 'string' ? req.query.state : null;
        const error = typeof req.query.error === 'string' ? req.query.error : null;

        if (error) {
            return res
                .status(400)
                .type('text/html')
                .send(renderPage('Authorization denied', `Battle.net reported: ${error}`));
        }
        if (!code || !state) {
            return res
                .status(400)
                .type('text/html')
                .send(renderPage('Missing parameters', 'Expected both `code` and `state`.'));
        }

        const discordUserId = consumeState(state);
        if (!discordUserId) {
            return res
                .status(400)
                .type('text/html')
                .send(
                    renderPage(
                        'State expired',
                        'That link has already been used or has expired. Run /link in Discord again.'
                    )
                );
        }

        try {
            const token = await exchangeCodeForToken(code);
            const battleTag = await fetchBattleTag(token.access_token);
            const expiresAt = Math.floor(Date.now() / 1000) + token.expires_in;

            upsertBattleNetLink({
                discordUserId,
                battleTag,
                accessToken: token.access_token,
                refreshToken: token.refresh_token ?? null,
                expiresAt,
                region: REGION,
            });

            return res.type('text/html').send(
                renderPage(
                    'Linked!',
                    `${battleTag ?? 'Your account'} is now linked. You can close this tab and return to Discord.`
                )
            );
        } catch (err) {
            console.error('[OAuth] Callback error:', err);
            return res
                .status(500)
                .type('text/html')
                .send(
                    renderPage(
                        'Something broke',
                        'The bot couldn\'t complete the Battle.net exchange. Check the bot logs.'
                    )
                );
        }
    });

    app.listen(port, () => {
        console.log(`[HTTP] OAuth callback server listening on :${port}`);
    });
}

function renderPage(title: string, body: string): string {
    const safeTitle = escapeHtml(title);
    const safeBody = escapeHtml(body);
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:520px;margin:80px auto;padding:0 24px;color:#e6e6e6;background:#1a1a1a}
h1{font-size:22px;margin-bottom:8px}
p{color:#aaa;line-height:1.5}
</style></head>
<body><h1>${safeTitle}</h1><p>${safeBody}</p></body></html>`;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
