/**
 * Home Assistant authentication helper.
 * Handles the HA auth flow: login_flow → auth code → access token.
 */
import { type Page, type BrowserContext } from '@playwright/test';

const HA_BASE = process.env.HA_BASE_URL || 'http://localhost:18125';
const HA_USER = process.env.HA_USERNAME || 'admin';
const HA_PASS = process.env.HA_PASSWORD || 'admin123';

export interface HATokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** Get HA access token via REST auth flow */
export async function getHAToken(): Promise<HATokens> {
  // Step 1: Start login flow
  const flowRes = await fetch(`${HA_BASE}/auth/login_flow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: `${HA_BASE}/`,
      handler: ['homeassistant', null],
      redirect_uri: `${HA_BASE}/?auth_callback=1`,
    }),
  });
  const flow = await flowRes.json();

  // Step 2: Submit credentials
  const authRes = await fetch(`${HA_BASE}/auth/login_flow/${flow.flow_id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: `${HA_BASE}/`,
      username: HA_USER,
      password: HA_PASS,
    }),
  });
  const authResult = await authRes.json();
  if (authResult.type !== 'create_entry') {
    throw new Error(`Auth failed: ${JSON.stringify(authResult.errors || authResult)}`);
  }

  // Step 3: Exchange code for token
  const tokenRes = await fetch(`${HA_BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: authResult.result,
      client_id: `${HA_BASE}/`,
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tokens)}`);
  }
  return tokens;
}

/** Login to HA via browser by injecting auth tokens into localStorage */
export async function loginAndNavigate(page: Page, panelPath: string): Promise<void> {
  // Get fresh tokens via API
  const tokens = await getHAToken();

  const tokenPayload = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    clientId: `${HA_BASE}/`,
    baseUrl: HA_BASE,
  };

  const injectTokenScript = (args: typeof tokenPayload) => {
    const hassTokens = JSON.stringify({
      hassUrl: args.baseUrl,
      clientId: args.clientId,
      refresh_token: args.refreshToken,
      access_token: args.accessToken,
      token_type: 'Bearer',
    });
    localStorage.setItem('hassTokens', hassTokens);
  };

  // Use addInitScript so tokens are set BEFORE any HA JS runs
  await page.addInitScript(injectTokenScript, tokenPayload);

  // Navigate directly to the panel — tokens will be available via localStorage
  await page.goto(`/${panelPath}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // If HA still redirected to auth, wait for it to settle and go back
  if (page.url().includes('/auth/authorize')) {
    await page.waitForTimeout(1000);
    await page.goto(`/${panelPath}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  }

  await page.waitForTimeout(5000); // Allow panel JS to load and render
}

/** Call HA WebSocket API with auth token */
export async function callWS(token: string, message: Record<string, any>): Promise<any> {
  const wsUrl = HA_BASE.replace('http', 'ws') + '/api/websocket';

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket timeout')), 30_000);

    import('ws').then(({ default: WebSocket }) => {
      const ws = new WebSocket(wsUrl);
      let msgId = 1;
      let authenticated = false;

      ws.on('open', () => {});

      ws.on('message', (data: any) => {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'auth_required') {
          ws.send(JSON.stringify({ type: 'auth', access_token: token }));
          return;
        }

        if (msg.type === 'auth_ok') {
          authenticated = true;
          ws.send(JSON.stringify({ id: msgId, ...message }));
          return;
        }

        if (msg.type === 'auth_invalid') {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(`Auth invalid: ${msg.message}`));
          return;
        }

        if (msg.id === msgId) {
          clearTimeout(timeout);
          ws.close();
          if (msg.success === false) {
            reject(new Error(`WS error: ${JSON.stringify(msg.error)}`));
          } else {
            resolve(msg.result);
          }
        }
      });

      ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  });
}

/** Call HA REST API */
export async function callAPI(
  token: string,
  method: string,
  path: string,
  body?: any,
): Promise<any> {
  const res = await fetch(`${HA_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}
