'use strict';
/* Landing-page hello: send one note to Tomato without opening chat.
 * Shares the web-chat identity (same localStorage), so the name made
 * here carries straight into /chat/ for continued conversation. */

const HELLO_URL = 'https://sevnusobochafwuvmuvu.supabase.co';
const HELLO_KEY = 'sb_publishable_nhog8psQAljHGK3RvIyp-Q_26yCYmsF';
const HELLO_DEVICE = '00000000-0000-0000-0000-000000000001';
const HELLO_STORE = 'envelop.web.session.v1';
const HELLO_WATCH_MS = 45000;
const HELLO_POLL_MS = 3000;

const helloState = { creds: null, expiresAt: 0, profile: null, watching: 0 };

function helloStatus(html) {
  const bar = document.getElementById('hello-status');
  bar.hidden = !html;
  bar.innerHTML = html || '';
}

function helloApiError(data) {
  if (data && typeof data === 'object') return data.message || data.msg || data.error_description || null;
  return null;
}

async function helloRequest(path, opts) {
  opts = opts || {};
  if (opts.auth !== false && Date.now() > helloState.expiresAt - 60000) await helloRefresh();
  const headers = { apikey: HELLO_KEY, 'Content-Type': 'application/json' };
  if (opts.auth !== false && helloState.creds) headers.Authorization = 'Bearer ' + helloState.creds.access_token;
  const res = await fetch(HELLO_URL + '/' + path, {
    method: opts.body ? 'POST' : 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(helloApiError(data) || 'Envelop network request failed.');
  return data;
}

function helloSaveCreds(creds) {
  helloState.creds = creds;
  helloState.expiresAt = Date.now() + creds.expires_in * 1000;
  try { localStorage.setItem(HELLO_STORE, JSON.stringify({ creds, expiresAt: helloState.expiresAt })); } catch (e) { /* private mode */ }
}

function helloLoadCreds() {
  try {
    const saved = JSON.parse(localStorage.getItem(HELLO_STORE) || 'null');
    if (!saved) return;
    helloState.creds = saved.creds;
    helloState.expiresAt = saved.expiresAt || 0;
  } catch (e) { helloState.creds = null; }
}

async function helloRefresh() {
  if (!helloState.creds) throw new Error('Sign in first');
  helloSaveCreds(await helloRequest('auth/v1/token?grant_type=refresh_token', {
    auth: false,
    body: { refresh_token: helloState.creds.refresh_token },
  }));
}

function helloAvatar(name) {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (Math.imul(h, 31) + ch.codePointAt(0)) | 0;
  return Math.abs(h) % 16;
}

function helloAsciiOk(body) {
  const bytes = new TextEncoder().encode(body);
  if (bytes.length < 1 || bytes.length > 256) return false;
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    if (c < 32 || c > 126) return false;
  }
  return true;
}

function helloEsc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function helloEnsureIdentity() {
  helloLoadCreds();
  if (!helloState.creds) {
    helloSaveCreds(await helloRequest('auth/v1/signup', { auth: false, body: { data: {} } }));
  }
  const rows = await helloRequest('rest/v1/profiles?id=eq.' + helloState.creds.user.id + '&select=*');
  if (rows[0]) {
    helloState.profile = rows[0];
    return rows[0];
  }
  const name = 'Guest-' + Math.floor(1000 + Math.random() * 9000);
  helloState.profile = await helloRequest('rest/v1/rpc/create_profile', {
    body: { p_name: name, p_avatar: helloAvatar(name) },
  });
  return helloState.profile;
}

async function helloTomatoOnline() {
  const leases = await helloRequest(
    'rest/v1/device_bridges?device_id=eq.' + HELLO_DEVICE + '&select=expires_at'
  );
  const now = Date.now();
  return leases.some((l) => new Date(l.expires_at).getTime() > now);
}

async function helloWatch(conv, since) {
  const end = Date.now() + HELLO_WATCH_MS;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, HELLO_POLL_MS));
    try {
      const rows = await helloRequest(
        'rest/v1/messages?conversation_id=eq.' + conv + '&select=*&order=created_at.desc,id.desc&limit=5'
      );
      const reply = rows.find(
        (m) => m.sender_id === HELLO_DEVICE && new Date(m.created_at).getTime() > since
      );
      if (reply) return reply.body;
    } catch (e) { return null; }
  }
  return null;
}

async function helloSend(event) {
  event.preventDefault();
  const input = document.getElementById('hello-text');
  const btn = document.getElementById('hello-send');
  const body = input.value.trim();
  if (!body || btn.disabled) return;
  if (!helloAsciiOk(body)) {
    helloStatus('Tomato reads plain text: letters, numbers and punctuation, up to 256 characters.');
    return;
  }
  btn.disabled = true;
  helloStatus('Sending…');
  try {
    const me = await helloEnsureIdentity();
    const conv = await helloRequest('rest/v1/rpc/get_or_create_dm', { body: { p_peer: HELLO_DEVICE } });
    const sentAt = Date.now();
    await helloRequest('rest/v1/rpc/send_message', {
      body: { p_conversation: conv, p_body: body, p_nonce: crypto.randomUUID() },
    });
    const online = await helloTomatoOnline();
    helloStatus(
      '<strong>Sent.</strong> You are in as ' + helloEsc(me.display_name) + '. ' +
      (online
        ? 'Tomato is online — watch its screen.'
        : 'Tomato is offline — your note waits for its bridge.') +
      ' <a class="text-link" href="chat/index.html">Keep talking in web chat</a>.'
    );
    input.value = '';
    const reply = await helloWatch(conv, sentAt);
    if (reply) helloStatus('<strong>Tomato answers:</strong> ' + helloEsc(reply));
  } catch (err) {
    helloStatus(helloEsc(err.message));
  } finally {
    btn.disabled = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('hello-form');
    if (form) form.addEventListener('submit', helloSend);
  });
}

if (typeof module !== 'undefined') module.exports = { helloAsciiOk: helloAsciiOk };
