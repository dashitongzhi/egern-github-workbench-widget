/**
 * GitHub Workbench widget for Egern.
 *
 * Auth modes:
 * 1. GITHUB_TOKEN: paste a classic/fine-grained token in the module env.
 * 2. OAuth Device Flow: uses the bundled public client id by default. Set
 *    GITHUB_CLIENT_ID only when you want to use your own OAuth App.
 */
const STORAGE_TOKEN = 'github_workbench_access_token_v1';
const STORAGE_DEVICE = 'github_workbench_device_flow_v1';
const DEFAULT_GITHUB_CLIENT_ID = 'Ov23licgvm9aj2TFVGhC';

export default async function (ctx) {
  const env = ctx.env || {};
  const C = {
    bg: { light: '#ffffff', dark: '#0d1117' },
    panel: { light: '#f6f8fa', dark: '#161b22' },
    text: { light: '#24292f', dark: '#f0f6fc' },
    dim: { light: '#57606a', dark: '#8b949e' },
    border: { light: '#d0d7de', dark: '#30363d' },
    blue: { light: '#0969da', dark: '#58a6ff' },
    green: { light: '#1a7f37', dark: '#3fb950' },
    purple: { light: '#8250df', dark: '#a371f7' },
    orange: { light: '#bc4c00', dark: '#d29922' },
    red: { light: '#cf222e', dark: '#f85149' },
  };

  const timeout = Number(env.REQUEST_TIMEOUT_MS || 8000);
  const baseUrl = (env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/$/, '');
  const openUrl = env.OPEN_URL || 'https://github.com/pulls';
  const repos = String(env.REPOS || '').split(',').map(s => s.trim()).filter(Boolean);
  const staleDays = Number(env.STALE_DAYS || 7);
  const maxRecent = Number(env.RECENT_LIMIT || 4);

  const text = (value, size, weight, color, opts = {}) => ({
    type: 'text',
    text: String(value ?? ''),
    font: { size, weight },
    textColor: color,
    ...opts,
  });
  const icon = (name, color, size = 13) => ({
    type: 'image',
    src: `sf-symbol:${name}`,
    color,
    width: size,
    height: size,
  });
  const row = (children, gap = 5, opts = {}) => ({
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap,
    children,
    ...opts,
  });
  const col = (children, gap = 6, opts = {}) => ({
    type: 'stack',
    direction: 'column',
    gap,
    children,
    ...opts,
  });

  async function postForm(url, body) {
    const encoded = Object.keys(body)
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(body[k])}`)
      .join('&');
    const resp = await ctx.http.post(url, {
      timeout,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: encoded,
    });
    return await resp.json();
  }

  async function getDeviceState() {
    const clientId = String(env.GITHUB_CLIENT_ID || DEFAULT_GITHUB_CLIENT_ID).trim();
    if (!clientId) return { status: 'missing_auth' };

    let state = ctx.storage.getJSON(STORAGE_DEVICE);
    const now = Date.now();
    if (!state || !state.device_code || now >= Number(state.expires_at || 0)) {
      const device = await postForm('https://github.com/login/device/code', {
        client_id: clientId,
        scope: env.GITHUB_SCOPES || 'repo read:user',
      });
      if (!device.device_code) {
        return { status: 'device_error', message: device.error_description || device.error || 'Device code request failed' };
      }
      state = {
        device_code: device.device_code,
        user_code: device.user_code,
        verification_uri: device.verification_uri || 'https://github.com/login/device',
        interval: Number(device.interval || 5),
        expires_at: now + Number(device.expires_in || 900) * 1000,
        last_poll_at: 0,
      };
      ctx.storage.setJSON(STORAGE_DEVICE, state);
    }

    if (now - Number(state.last_poll_at || 0) >= Math.max(5, Number(state.interval || 5)) * 1000) {
      state.last_poll_at = now;
      ctx.storage.setJSON(STORAGE_DEVICE, state);
      const tokenResp = await postForm('https://github.com/login/oauth/access_token', {
        client_id: clientId,
        device_code: state.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      });
      if (tokenResp.access_token) {
        ctx.storage.set(STORAGE_TOKEN, tokenResp.access_token);
        ctx.storage.delete(STORAGE_DEVICE);
        return { status: 'authorized', token: tokenResp.access_token };
      }
      if (tokenResp.error && !['authorization_pending', 'slow_down'].includes(tokenResp.error)) {
        return { status: 'device_error', message: tokenResp.error_description || tokenResp.error };
      }
    }

    return { status: 'pending', state };
  }

  async function resolveToken() {
    if (env.GITHUB_TOKEN) return { token: String(env.GITHUB_TOKEN).trim(), mode: 'env' };
    const stored = ctx.storage.get(STORAGE_TOKEN);
    if (stored) return { token: stored, mode: 'device' };
    const device = await getDeviceState();
    if (device.token) return { token: device.token, mode: 'device' };
    return device;
  }

  function loginWidget(auth) {
    const hasDeviceCode = !!(auth.state && auth.state.user_code);
    const code = hasDeviceCode ? auth.state.user_code : (auth.status === 'missing_auth' ? 'SETUP' : 'WAIT');
    const verify = hasDeviceCode ? auth.state.verification_uri : 'https://github.com/settings/developers';
    const message = auth.status === 'missing_auth'
      ? 'GitHub 登录页不会生成 code。先填 GITHUB_TOKEN，或配置可用的 OAuth Client ID。'
      : auth.status === 'device_error'
        ? auth.message
        : '把下面的 code 输入到 github.com/login/device 授权。';
    const hint = hasDeviceCode ? 'Tap to open GitHub device login' : 'Tap to open GitHub Developer Settings';
    return {
      type: 'widget',
      url: verify,
      backgroundColor: C.bg,
      padding: [14, 16],
      gap: 10,
      children: [
        row([icon('point.3.connected.trianglepath.dotted', C.text, 16), text('GitHub Workbench', 'headline', 'bold', C.text), { type: 'spacer' }]),
        col([
          text(message, 11, 'medium', C.dim, { maxLines: 3 }),
          text(code, 28, 'heavy', C.blue, { textAlign: 'center', maxLines: 1, minScale: 0.6 }),
          text(hint, 10, 'medium', C.dim, { textAlign: 'center' }),
        ], 8, { padding: 12, borderRadius: 8, backgroundColor: C.panel }),
      ],
    };
  }

  const auth = await resolveToken();
  if (!auth.token) return loginWidget(auth);

  const apiHeaders = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${auth.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  async function apiGet(path) {
    const resp = await ctx.http.get(path.startsWith('http') ? path : `${baseUrl}${path}`, {
      timeout,
      headers: apiHeaders,
    });
    if (resp.status === 401 || resp.status === 403) {
      if (auth.mode === 'device') ctx.storage.delete(STORAGE_TOKEN);
      throw new Error(`GitHub auth/API error ${resp.status}`);
    }
    return await resp.json();
  }
  async function searchOne(query, perPage = 1) {
    const data = await apiGet(`/search/issues?q=${encodeURIComponent(query)}&per_page=${perPage}&sort=updated&order=desc`);
    return data || { total_count: 0, items: [] };
  }
  async function searchScoped(query, perPage = 1) {
    if (!repos.length) return await searchOne(query, perPage);
    const parts = await Promise.all(repos.map(repo => searchOne(`${query} repo:${repo}`, perPage)));
    const items = parts.flatMap(p => p.items || [])
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, perPage);
    return {
      total_count: parts.reduce((sum, p) => sum + Number(p.total_count || 0), 0),
      items,
    };
  }

  try {
    const me = await apiGet('/user');
    const login = me.login;
    const sinceDate = new Date(Date.now() - staleDays * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const base = repos.length ? 'is:pr' : `is:pr involves:${login}`;

    const [open, review, mine, assigned, drafts, stale, mergedToday, recent] = await Promise.all([
      searchScoped(`${base} is:open archived:false`),
      searchScoped(`is:pr is:open review-requested:${login} archived:false`),
      searchScoped(`is:pr is:open author:${login} archived:false`),
      searchScoped(`is:pr is:open assignee:${login} archived:false`),
      searchScoped(`${base} is:open draft:true archived:false`),
      searchScoped(`${base} is:open updated:<${sinceDate} archived:false`),
      searchScoped(`${repos.length ? 'is:pr' : `is:pr author:${login}`} is:merged merged:>=${today} archived:false`),
      searchScoped(`${base} is:open archived:false`, maxRecent),
    ]);

    const counts = {
      open: open.total_count || 0,
      review: review.total_count || 0,
      mine: mine.total_count || 0,
      assigned: assigned.total_count || 0,
      drafts: drafts.total_count || 0,
      stale: stale.total_count || 0,
      mergedToday: mergedToday.total_count || 0,
    };
    const family = String(ctx.widgetFamily || '').toLowerCase();
    return renderWorkbench({
      C,
      text,
      icon,
      row,
      col,
      openUrl,
      login,
      repos,
      counts,
      recent: recent.items || [],
      maxRecent,
      isSmall: family.includes('small'),
    });
  } catch (e) {
    return {
      type: 'widget',
      url: openUrl,
      backgroundColor: C.bg,
      padding: [14, 16],
      gap: 8,
      children: [
        row([icon('point.3.connected.trianglepath.dotted', C.text, 16), text('GitHub Workbench', 'headline', 'bold', C.text), { type: 'spacer' }]),
        text('GitHub 请求失败', 14, 'bold', C.red),
        text(String(e && e.message ? e.message : e), 11, 'medium', C.dim, { maxLines: 3 }),
      ],
    };
  }
}

function renderWorkbench({ C, text, icon, row, col, openUrl, login, repos, counts, recent, maxRecent, isSmall }) {
  const card = (label, value, color, symbol) => col([
    row([icon(symbol, color, 11), text(label, 9, 'bold', C.dim, { maxLines: 1 }), { type: 'spacer' }], 4),
    text(value, 22, 'heavy', color, { maxLines: 1, minScale: 0.6 }),
  ], 2, { flex: 1, padding: [8, 8], borderRadius: 8, backgroundColor: C.panel });

  const item = pr => {
    const repo = (pr.repository_url || '').split('/repos/')[1] || '';
    const title = `#${pr.number} ${pr.title || ''}`;
    const isDraft = pr.draft || String(pr.title || '').toLowerCase().startsWith('draft:');
    return row([
      icon(isDraft ? 'circle.dotted' : 'point.3.connected.trianglepath.dotted', isDraft ? C.dim : C.green, 10),
      col([
        text(title, 10, 'semibold', C.text, { maxLines: 1, minScale: 0.65 }),
        text(repo, 9, 'medium', C.dim, { maxLines: 1, minScale: 0.7 }),
      ], 1, { flex: 1 }),
    ], 5, { url: pr.html_url });
  };

  const updated = new Date();
  const time = `${String(updated.getHours()).padStart(2, '0')}:${String(updated.getMinutes()).padStart(2, '0')}`;
  const scope = repos.length ? `${repos.length} repos` : `@${login}`;

  if (isSmall) {
    return {
      type: 'widget',
      url: openUrl,
      backgroundColor: C.bg,
      padding: [12, 14],
      gap: 8,
      children: [
        row([
          icon('point.3.connected.trianglepath.dotted', C.text, 14),
          text('GitHub', 'subheadline', 'bold', C.text, { maxLines: 1 }),
          { type: 'spacer' },
          text(time, 9, 'medium', C.dim),
        ], 5),
        row([
          card('OPEN', counts.open, C.blue, 'arrow.triangle.pull'),
          card('REVIEW', counts.review, C.orange, 'eye'),
        ], 6),
        row([
          card('MINE', counts.mine, C.purple, 'person.crop.circle'),
          card('STALE', counts.stale, counts.stale ? C.red : C.dim, 'clock.badge.exclamationmark'),
        ], 6),
        text(scope, 9, 'medium', C.dim, { maxLines: 1, minScale: 0.7 }),
      ],
    };
  }

  return {
    type: 'widget',
    url: openUrl,
    backgroundColor: C.bg,
    padding: [12, 14],
    gap: 8,
    children: [
      row([
        icon('point.3.connected.trianglepath.dotted', C.text, 15),
        text('GitHub Workbench', 'headline', 'bold', C.text, { maxLines: 1 }),
        { type: 'spacer' },
        text(scope, 9, 'medium', C.dim, { maxLines: 1, minScale: 0.7 }),
        text(time, 9, 'medium', C.dim),
      ], 5),
      row([
        card('OPEN', counts.open, C.blue, 'arrow.triangle.pull'),
        card('REVIEW', counts.review, C.orange, 'eye'),
        card('MINE', counts.mine, C.purple, 'person.crop.circle'),
      ], 6),
      row([
        card('ASSIGNED', counts.assigned, C.green, 'target'),
        card('DRAFT', counts.drafts, C.dim, 'circle.dotted'),
        card('STALE', counts.stale, counts.stale ? C.red : C.dim, 'clock.badge.exclamationmark'),
        card('MERGED', counts.mergedToday, C.green, 'checkmark.seal'),
      ], 6),
      col((recent || []).slice(0, maxRecent).map(item), 5, { padding: [8, 9], borderRadius: 8, backgroundColor: C.panel }),
    ],
  };
}
