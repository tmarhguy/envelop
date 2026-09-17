'use strict';
/* Envelop web chat: whoever is online, plus Tomato.
 * Anonymous identity (name only), durable DMs, Tomato pinned + verified.
 * Needs SOME bridge online (a Mac holding the lease) for Tomato's screen. */

const SUPABASE_URL = 'https://sevnusobochafwuvmuvu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nhog8psQAljHGK3RvIyp-Q_26yCYmsF';
const DEVICE_ID = '00000000-0000-0000-0000-000000000001';
const STORE_KEY = 'envelop.web.session.v1';
const READ_KEY = 'envelop.web.read.v1';
const ASSET_VERSION = '20260917-premium-2';
const MODE_KEY = 'envelop.execution-mode.v1';
const POLL_ACTIVE_MS = 3000;
const POLL_BACKOFF_MS = [10000, 20000, 30000];
const BEAT_MS = 15000;
const FRESH_MS = 45000;
const TOMATO_REPLY_FAST_MS = 300;
const TOMATO_REPLY_SLOW_MS = 1000;
const TOMATO_REPLY_FAST_WINDOW_MS = 5000;
const TOMATO_REPLY_QUIET_MS = 1500;
// Migration-sensitive API strings live here so a renamed RPC is one edit.
const COMPUTE_API = Object.freeze({
  enqueue: 'rest/v1/rpc/enqueue_compute_job',
  read: 'rest/v1/rpc/my_compute_job',
  cancel: 'rest/v1/rpc/cancel_compute_job',
});

const state = {
  creds: null,
  expiresAt: 0,
  profile: null,
  people: [],
  peer: null,
  conversation: null,
  messages: [],
  tomatoOnline: false,
  tomatoOnlineKnown: false,
  connectionOutcome: null,
  connectionOutcomeUntil: 0,
  isAdmin: false,
  presenceMode: null,
  lastBeat: 0,
  pollTimer: 0,
  pollInFlight: false,
  pollAbort: null,
  unchangedPolls: 0,
  searchTimer: 0,
  busy: false,
  executionMode: 'virtual',
  loadingThread: false,
  scrollToLatest: false,
  awaitTomatoAt: 0,
  awaitTomatoThem: 0,
  awaitTomatoExpected: 0,
  awaitTomatoReceived: 0,
  readAt: {},
  latestIncoming: {},
};

const localJobs = [];
let jobViewsPromise = null;
let jobViewsModule = null;
let helpGuidePromise = null;
let helpGuideModule = null;
let intentsPromise = null;
let intentsModule = null;
let experienceModule = null;
let experiencePromise = null;
const virtualQueue = [];
let virtualRunning = false;
function experience() {
  return experiencePromise ||= import('./experience.mjs?v=' + ASSET_VERSION).then(module => experienceModule = module);
}
const messageTabs = new Map();
const expandedMessages = new Set();
let pendingDraft = null;
let typingTimer = 0;
let replyPollTimer = 0;
let replyPollInFlight = false;
let suggestionRound = 0;
let suggestionStarted = false;
const $ = (id) => document.getElementById(id);
const MOBILE_CHAT = '(max-width: 760px)';

function mobileChat() {
  return window.matchMedia(MOBILE_CHAT).matches;
}

function randomId(source = globalThis.crypto) {
  if (source && typeof source.randomUUID === 'function') {
    return source.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (source && typeof source.getRandomValues === 'function') {
    source.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function jobViews() {
  if (!jobViewsPromise) {
    jobViewsPromise = import('./job-view.mjs?v=' + ASSET_VERSION).then(module => {
      jobViewsModule = module;
      return module;
    });
  }
  return jobViewsPromise;
}

function helpGuide() {
  if (!helpGuidePromise) {
    helpGuidePromise = import('./help.mjs?v=' + ASSET_VERSION).then(module => {
      helpGuideModule = module;
      return module;
    });
  }
  return helpGuidePromise;
}

function tomatoIntents() {
  if (!intentsPromise) {
    intentsPromise = import('./intents.mjs?v=' + ASSET_VERSION).then(module => {
      intentsModule = module;
      return module;
    });
  }
  return intentsPromise;
}

function updateJobView(job) {
  if (jobViewsModule) job.view = jobViewsModule.statusView(job);
}

function bindAppHeight() {
  let frame = 0;
  const apply = () => {
    frame = 0;
    const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    document.documentElement.style.setProperty('--app-height', Math.round(h) + 'px');
    requestAnimationFrame(() => {
      const log = $('chat-log');
      const draft = $('chat-draft');
      const typing = $('chat-typing');
      if (log && ((draft && document.activeElement === draft) || (typing && !typing.hidden))) {
        log.scrollTop = log.scrollHeight;
      }
    });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(apply);
  };
  schedule();
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', schedule, {passive: true});
    visualViewport.addEventListener('scroll', schedule, {passive: true});
  }
  window.addEventListener('resize', schedule, {passive: true});
}

function setPane(pane) {
  const grid = $('chat-grid');
  if (!grid) return;
  grid.dataset.pane = pane;
  document.body.classList.toggle('chat-thread-open', pane === 'thread');
}

function closeThread() {
  clearAwaitTomato();
  state.peer = null;
  state.conversation = null;
  state.messages = [];
  setPane('list');
  renderPeople();
  renderThread();
}

function viewingPeer(id) {
  if (!state.peer || state.peer.id !== id) return false;
  if (!mobileChat()) return true;
  const grid = $('chat-grid');
  return !!(grid && grid.dataset.pane === 'thread');
}

function readStoreKey() {
  return READ_KEY + '.' + ((state.profile && state.profile.id) || 'anon');
}

function loadRead() {
  try {
    state.readAt = JSON.parse(localStorage.getItem(readStoreKey()) || '{}') || {};
  } catch (e) {
    state.readAt = {};
  }
}

function saveRead() {
  try { localStorage.setItem(readStoreKey(), JSON.stringify(state.readAt)); } catch (e) { /* private mode */ }
}

function hasUnread(peerId) {
  if (viewingPeer(peerId)) return false;
  const incoming = state.latestIncoming[peerId];
  if (!incoming) return false;
  const read = state.readAt[peerId];
  return !read || incoming > read;
}

function markPeerRead(peerId) {
  const incoming = state.latestIncoming[peerId];
  const stamp = incoming || new Date().toISOString();
  if (!state.readAt[peerId] || stamp > state.readAt[peerId]) {
    state.readAt[peerId] = stamp;
    saveRead();
  }
}

function peerOfConversation(row) {
  const me = state.profile && state.profile.id;
  if (row.participant_a === me) return row.participant_b;
  if (row.participant_b === me) return row.participant_a;
  return null;
}

async function refreshInbox(signal) {
  if (!state.profile) return false;
  try {
    const convos = await request('rest/v1/conversations?select=id,participant_a,participant_b', {signal});
    const convPeer = {};
    for (const row of convos) {
      const peer = peerOfConversation(row);
      if (peer) convPeer[row.id] = peer;
    }
    const rows = await request('rest/v1/messages?select=id,conversation_id,sender_id,created_at&order=created_at.desc&limit=80', {signal});
    const latest = {};
    const me = state.profile.id;
    for (const message of rows) {
      const peer = convPeer[message.conversation_id];
      if (!peer || message.sender_id === me || latest[peer]) continue;
      latest[peer] = message.created_at;
    }
    const changed = JSON.stringify(latest) !== JSON.stringify(state.latestIncoming);
    state.latestIncoming = latest;
    if (state.peer && viewingPeer(state.peer.id)) markPeerRead(state.peer.id);
    return changed;
  } catch (e) { return false; /* inbox is best-effort */ }
}

function themCount() {
  const me = state.profile && state.profile.id;
  return state.messages.filter((m) => m.sender_id !== me).length;
}

function tomatoIsBusy() {
  if (!state.peer || !state.peer.is_device) return false;
  if (state.busy || state.loadingThread) return true;
  if (localJobs.some((j) => j.conversation === state.conversation
    && (['compiling', 'executing'].includes(j.phase) || (j.phase === 'queued' && j.via === 'virtual')))) return true;
  if (!state.awaitTomatoAt) return false;
  if (Date.now() - state.awaitTomatoAt > 25000) {
    state.awaitTomatoAt = 0;
    state.awaitTomatoExpected = 0;
    state.awaitTomatoReceived = 0;
    clearTimeout(typingTimer);
    stopReplyPolling();
    return false;
  }
  return true;
}

function markAwaitTomato(expectedReplies = 0) {
  state.awaitTomatoAt = Date.now();
  state.awaitTomatoThem = themCount();
  state.awaitTomatoExpected = expectedReplies;
  state.awaitTomatoReceived = 0;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(clearAwaitTomato, 25000);
}

function markTomatoProgress() {
  if (!state.awaitTomatoAt) return;
  state.awaitTomatoAt = Date.now();
  state.awaitTomatoThem = themCount();
  clearTimeout(typingTimer);
  typingTimer = setTimeout(clearAwaitTomato, TOMATO_REPLY_QUIET_MS);
}

function clearAwaitTomato() {
  state.awaitTomatoAt = 0;
  state.awaitTomatoExpected = 0;
  state.awaitTomatoReceived = 0;
  clearTimeout(typingTimer);
  stopReplyPolling();
  syncTyping();
}

function stopReplyPolling() {
  if (replyPollTimer) clearTimeout(replyPollTimer);
  replyPollTimer = 0;
}

function scheduleReplyPoll(delay = 0) {
  stopReplyPolling();
  if (!state.awaitTomatoAt || document.hidden || !state.conversation) return;
  replyPollTimer = setTimeout(pollTomatoReplies, delay);
}

function tomatoReplyPollDelay() {
  return Date.now() - state.awaitTomatoAt < TOMATO_REPLY_FAST_WINDOW_MS
    ? TOMATO_REPLY_FAST_MS
    : TOMATO_REPLY_SLOW_MS;
}

async function pollTomatoReplies() {
  replyPollTimer = 0;
  if (replyPollInFlight || !state.awaitTomatoAt || document.hidden || !state.conversation) return;
  replyPollInFlight = true;
  try {
    await fetchMessages();
  } catch (e) {
    // The regular poll surfaces persistent connectivity failures.
  } finally {
    replyPollInFlight = false;
    if (state.awaitTomatoAt) scheduleReplyPoll(tomatoReplyPollDelay());
  }
}

function typingDots() {
  const dots = document.createElement('span');
  dots.className = 'typing-dots';
  dots.setAttribute('aria-hidden', 'true');
  dots.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  return dots;
}

function syncTyping() {
  const el = $('chat-typing');
  if (!el) return;
  const on = tomatoIsBusy();
  el.hidden = !on;
  const sub = document.querySelector('#chat-peer small');
  if (sub && state.peer && state.peer.is_device) {
    if (on) sub.textContent = 'Typing…';
    else if (mobileChat()) sub.textContent = state.tomatoOnline ? 'Physical online' : 'Virtual ready';
    else if (state.tomatoOnline) sub.textContent = 'Online · notes appear on Tomato’s screen';
    else sub.textContent = 'Offline · Virtual Tomato available';
  }
  if (on) {
    const log = $('chat-log');
    if (log) log.scrollTop = log.scrollHeight;
  }
}

function syncComposer() {
  const send = $('chat-send');
  if (send) {
    send.disabled = !!(state.busy || state.submitting);
    send.textContent = (state.busy || state.submitting) ? 'Sending…' : (state.peer?.is_device && state.executionMode === 'physical' && !state.tomatoOnline ? 'Queue' : 'Send');
    send.setAttribute('aria-busy', String(!!(state.busy || state.submitting)));
  }
  const join = $('chat-join');
  if (join) {
    join.disabled = !!state.busy;
    join.textContent = state.busy ? 'Entering…' : 'Enter';
    join.setAttribute('aria-busy', String(!!state.busy));
  }
  const draft = $('chat-draft');
  if (draft) { draft.readOnly = !!(state.busy || state.submitting); draft.setAttribute('aria-busy', String(draft.readOnly)); }
  for (const id of ['mode-virtual','mode-physical']) {
    const button = $(id); if (button) button.disabled = !!(state.busy || state.submitting);
  }
}

function setBusy(value) {
  state.busy = value;
  syncComposer();
  syncTyping();
}

function showError(text) {
  const bar = $('chat-error');
  if (!text) { bar.hidden = true; bar.textContent = ''; return; }
  bar.hidden = false;
  bar.textContent = /failed to fetch|network|load failed|fetch failed|timed? ?out|aborted/i.test(text)
    ? 'The connection is taking a break. Your draft is still here. Virtual calculations remain available in the current conversation.'
    : text;
}

function apiError(data) {
  if (data && typeof data === 'object') return data.message || data.msg || data.error_description || null;
  return null;
}

async function request(path, opts) {
  opts = opts || {};
  if (opts.auth !== false && Date.now() > state.expiresAt - 60000) await refresh();
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (opts.auth !== false && state.creds) headers.Authorization = 'Bearer ' + state.creds.access_token;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (opts.signal?.aborted) abort();
  else opts.signal?.addEventListener('abort', abort, {once:true});
  const timeout = setTimeout(abort, 15000);
  try {
  const res = await fetch(SUPABASE_URL + '/' + path, {
    method: opts.body ? 'POST' : 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: controller.signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(apiError(data) || 'Envelop network request failed.');
  return data;
  } finally { clearTimeout(timeout); opts.signal?.removeEventListener('abort', abort); }
}

function saveCreds(creds) {
  state.creds = creds;
  state.expiresAt = Date.now() + creds.expires_in * 1000;
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ creds, expiresAt: state.expiresAt })); } catch (e) { /* private mode */ }
}

function loadCreds() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.creds = saved.creds;
    state.expiresAt = saved.expiresAt || 0;
  } catch (e) { state.creds = null; }
}

async function refresh() {
  if (!state.creds) throw new Error('Sign in first');
  const creds = await request('auth/v1/token?grant_type=refresh_token', {
    auth: false,
    body: { refresh_token: state.creds.refresh_token },
  });
  saveCreds(creds);
}

function avatarFor(name) {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (Math.imul(h, 31) + ch.codePointAt(0)) | 0;
  return Math.abs(h) % 16;
}

function avatarColor(id) {
  const palette = ['#5a715a', '#ad342b', '#1d4e5f', '#7a5c2e', '#4a4e69', '#645244'];
  return palette[id % palette.length];
}

async function restore() {
  loadCreds();
  if (!state.creds) { renderWelcome(); return; }
  try {
    await refresh();
    const rows = await request('rest/v1/profiles?id=eq.' + state.creds.user.id + '&select=*');
    state.profile = rows[0] || null;
    if (!state.profile) { renderWelcome(); return; }
    loadRead();
    loadJobHistory();
    await checkAdmin();
    renderChat();
    startPolling();
  } catch (err) {
    renderWelcome();
    showError(err.message);
  }
}

async function enter() {
  const input = $('chat-name');
  const name = input.value.trim();
  if (!name || name.length > 32 || state.busy) return;
  setBusy(true);
  showError('');
  try {
    if (!state.creds) saveCreds(await request('auth/v1/signup', { auth: false, body: { data: {} } }));
    state.profile = await request('rest/v1/rpc/create_profile', { body: { p_name: name, p_avatar: avatarFor(name) } });
    loadRead();
    loadJobHistory();
    await checkAdmin();
    renderChat();
    startPolling();
    if (pendingDraft) {
      const text = pendingDraft;
      pendingDraft = null;
      try {
        await search('');
        const tomato = state.people.find((p) => p.is_device) || null;
        if (tomato) await openPeer(tomato);
      } catch (e) { /* draft still fills below */ }
      const draft = $('chat-draft');
      if (draft) { draft.value = text; draft.focus(); }
      showError('');
    }
  } catch (err) {
    showError(err.message);
  } finally {
    setBusy(false);
  }
}

function isFresh(p) {
  if (!p.presence || !p.presence.last_seen) return false;
  return Date.now() - new Date(p.presence.last_seen).getTime() < FRESH_MS;
}

async function beat(signal) {
  if (state.presenceMode === false) return;
  state.lastBeat = Date.now();
  try {
    await request('rest/v1/rpc/heartbeat', { body: {}, signal });
  } catch (err) {
    if (err.name !== 'AbortError') showError(err.message);
  }
}

async function search(query, signal) {
  const clean = (query || '').replace(/[^a-zA-Z0-9 \-]/g, '');
  const fetchRows = (withPresence) => {
    const params = new URLSearchParams({
      select: withPresence ? '*,presence(last_seen)' : '*',
      order: 'is_device.desc,display_name.asc,id.asc',
      limit: '50',
    });
    if (clean) params.set('display_name', 'ilike.*' + clean + '*');
    return request('rest/v1/profiles?' + params.toString(), {signal});
  };
  try {
    let rows;
    if (state.presenceMode === false) {
      rows = await fetchRows(false);
    } else {
      try {
        rows = await fetchRows(true);
        state.presenceMode = true;
      } catch (e) {
        // Backend predates presence: show everyone, skip heartbeats.
        rows = await fetchRows(false);
        state.presenceMode = false;
      }
    }
    let visible = rows.filter((p) => p.id !== (state.profile && state.profile.id));
    if (state.presenceMode) {
      visible = visible.filter((p) => p.is_device || p.pinned || isFresh(p) || hasUnread(p.id));
    }
    if (!visible.some((p) => p.is_device)) {
      const pinned = await request('rest/v1/profiles?id=eq.' + DEVICE_ID + '&select=*', {signal});
      visible = pinned.concat(visible);
    }
    const before = JSON.stringify(state.people);
    state.people = visible;
    const changed = before !== JSON.stringify(visible);
    if (changed) renderPeople();
    return changed;
  } catch (err) {
    if (err.name !== 'AbortError') showError(err.message);
    return false;
  }
}

async function openPeer(peer) {
  const switching = !(state.peer && state.peer.id === peer.id);
  state.peer = peer;
  state.conversation = null;
  state.messages = [];
  state.loadingThread = true;
  clearAwaitTomato();
  setPane('thread');
  renderPeople();
  renderThread();
  if (mobileChat() && switching && !(history.state && history.state.envelopPane === 'thread')) {
    history.pushState({ envelopPane: 'thread' }, '');
  }
  try {
    state.conversation = await request('rest/v1/rpc/get_or_create_dm', { body: { p_peer: peer.id } });
    await fetchMessages();
  } catch (err) {
    showError(err.message);
  } finally {
    state.loadingThread = false;
    renderThread();
  }
}

async function fetchMessages(signal) {
  if (!state.conversation) return false;
  const conv = state.conversation;
  const previousThem = themCount();
  const rows = await request(
    'rest/v1/messages?conversation_id=eq.' + conv + '&select=*&order=created_at.desc,id.desc&limit=20',
    {signal},
  );
  if (state.conversation !== conv) return false;
  const next = rows.slice().reverse();
  const changed = JSON.stringify(next) !== JSON.stringify(state.messages);
  state.messages = next;
  const newTomatoMessages = Math.max(0, themCount() - previousThem);
  if (newTomatoMessages && state.awaitTomatoAt) {
    state.awaitTomatoReceived += newTomatoMessages;
    if (state.awaitTomatoExpected && state.awaitTomatoReceived >= state.awaitTomatoExpected) {
      clearAwaitTomato();
    } else {
      markTomatoProgress();
    }
  }
  if (state.peer) {
    const me = state.profile && state.profile.id;
    const lastIn = [...state.messages].reverse().find((m) => m.sender_id !== me);
    if (lastIn) state.latestIncoming[state.peer.id] = lastIn.created_at;
    if (viewingPeer(state.peer.id)) markPeerRead(state.peer.id);
  }
  if (changed) {
    renderThread();
    renderPeople();
  }
  return changed;
}

function tomatoPrintable(body) {
  if (!body || BufferSafeLength(body) > 256) return false;
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    if (c < 32 || c > 126) return false;
  }
  return true;
}

function BufferSafeLength(s) { return new TextEncoder().encode(s).length; }

function requestLatestScroll() {
  state.scrollToLatest = true;
}

function timelineItems(messages, jobs, conversation) {
  let order = 0;
  const items = (messages || []).map(value => ({
    kind: 'message',
    value,
    at: Date.parse(value.created_at) || 0,
    order: order++,
  }));
  for (const value of (jobs || [])) {
    if (value.conversation !== conversation) continue;
    items.push({
      kind: 'job',
      value,
      at: Date.parse(value.created_at) || 0,
      order: order++,
    });
  }
  return items.sort((a, b) => a.at - b.at || a.order - b.order);
}

async function send() {
  if (state.submitting) return;
  state.submitting = true;
  syncComposer();
  try { await sendDraft(); }
  catch (error) { showError(error.message || 'Could not send. Your draft is still here.'); }
  finally { state.submitting = false; syncComposer(); if (helpGuideModule) renderSuggestions(helpGuideModule); }
}

async function sendDraft() {
  const input = $('chat-draft');
  const body = input.value.trim();
  if (!body || state.busy || !state.conversation || !state.peer) return;
  if (BufferSafeLength(body) > 256) { showError('Use at most 256 bytes per message.'); return; }
  if (state.peer.is_device) {
    const mode = state.executionMode;
    const rules = await experience();
    if (/^\/note\s+/i.test(body)) {
      await queueHardwareNote(body.replace(/^\/note\s+/i, '')); input.value = ''; return;
    }
    const conversational = rules.conversationReply(body);
    if (conversational) { addConversationJob(body, conversational); input.value = ''; showError(''); return; }
    const [guide, intents] = await Promise.all([helpGuide(), tomatoIntents()]);
    const localAnswer = intents.localAnswerFor(body);
    if (localAnswer) {
      addKnowledgeJob(body, localAnswer);
      input.value = '';
      showError('');
      return;
    }
    if (guide.isHelpRequest(body)) {
      await addHelpJob(body);
      input.value = '';
      showError('');
      return;
    }
    if (mode === 'physical' && !tomatoPrintable(body)) {
      showError('Use 1–256 bytes. Tomato accepts printable ASCII.');
      return;
    }
    let compiled;
    let compiler, alu;
    try {
      [compiler, , alu] = await Promise.all([
        import('./virtual/compiler.mjs?v=' + ASSET_VERSION),
        jobViews(),
        import('./virtual/alu.mjs?v=' + ASSET_VERSION),
      ]);
      compiled = compiler.compile(body);
    } catch (err) {
      const views = await jobViews();
      const outcome = views.compileOutcome(err, body);
      if (!outcome) { showError(err.message); return; }
      const failedJob = {
        id: randomId(),
        conversation: state.conversation,
        body,
        name: state.profile.display_name,
        created_at: new Date().toISOString(),
        compute: true,
        phase: views.PHASES.FAILED,
        outcome,
      };
      updateJobView(failedJob);
      localJobs.push(failedJob);
      input.value = '';
      showError('');
      requestLatestScroll();
      renderThread();
      return;
    }
    if (compiled) {
      const pendingHardware = localJobs.filter(candidate =>
        candidate.via === 'hardware' && ['queued', 'executing'].includes(candidate.phase)).length;
      if (mode === 'physical' && pendingHardware >= 4) {
        showError('Four hardware jobs are already waiting. Let one finish before adding another.');
        return;
      }
      if (mode === 'virtual' && virtualQueue.length >= 4) { showError('Four calculations are already running or waiting. Try again when one finishes.'); return; }
      markSuggestionOperationStarted();
      const job = {id: randomId(), conversation: state.conversation, body,
        name: state.profile.display_name, created_at: new Date().toISOString(),
        program: compiled.canonical,
        alu: alu.describeAlu(compiled.canonical),
        hex: compiler.hex(compiled.bytes),
        version: 'Remote bytecode v1',
        understood: compiled.understood || null,
        ast: compiled.ast || null,
        phase:'compiling', compute:true};
      updateJobView(job);
      localJobs.push(job);
      input.value='';showError('');requestLatestScroll();renderThread();
      await new Promise(resolve => setTimeout(resolve, 0));
      // The selected mode owns the route, including when physical Tomato is off.
      if (mode === 'physical') runHardware(job);
      else runVirtual(job);
      return;
    }
    // Plain chat always sends; the server queues while hardware is away.
    // Firmware auto-replies to canonical "Hello": normalize greeting variants
    // (e.g. "Hello, Tomato.") client-side, same as the Virtual Tomato worker.
    const greet = compiler.normalizeGreeting ? compiler.normalizeGreeting(body) : null;
    if (greet && mode === 'virtual') {
      addVirtualGreeting(body);
      input.value = '';
      showError('');
      return;
    }
    if (!greet && mode === 'virtual') {
      addGuidanceJob(body);
      input.value = ''; showError(''); return;
    }
    if (greet) {
      if (state.tomatoOnline) markAwaitTomato(4);
      setBusy(true);
      try {
        await request('rest/v1/rpc/send_message' , {
          body: { p_conversation: state.conversation, p_body: greet, p_nonce: randomId() },
        });
        input.value = '';
        showError('');
        requestLatestScroll();
        await fetchMessages();
        scheduleReplyPoll();
      } catch (err) {
        clearAwaitTomato();
        showError(err.message);
      } finally {
        setBusy(false);
      }
      return;
    }
  }
  const awaitingTomato = !!(state.peer && state.peer.is_device && state.tomatoOnline);
  if (awaitingTomato) markAwaitTomato();
  setBusy(true);
  try {
    await request('rest/v1/rpc/send_message' , {
      body: { p_conversation: state.conversation, p_body: body, p_nonce: randomId() },
    });
    input.value = '';
    showError('');
    requestLatestScroll();
    await fetchMessages();
    if (awaitingTomato) scheduleReplyPoll();
  } catch (err) {
    if (awaitingTomato) clearAwaitTomato();
    showError(err.message);
  } finally {
    setBusy(false);
  }
}

function pollingDelay(changed) {
  if (changed) {
    state.unchangedPolls = 0;
    return POLL_ACTIVE_MS;
  }
  const delay = POLL_BACKOFF_MS[Math.min(state.unchangedPolls, POLL_BACKOFF_MS.length - 1)];
  state.unchangedPolls++;
  return delay;
}

function schedulePoll(delay) {
  if (state.pollTimer) clearTimeout(state.pollTimer);
  state.pollTimer = 0;
  if (!state.profile || document.hidden) return;
  state.pollTimer = setTimeout(poll, delay);
}

async function poll() {
  if (state.pollInFlight || document.hidden || !state.profile) return;
  state.pollInFlight = true;
  const controller = new AbortController();
  state.pollAbort = controller;
  const signal = controller.signal;
  let changed = false;
  try {
    if (Date.now() - state.lastBeat > BEAT_MS) await beat(signal);
    const leases = await request('rest/v1/device_bridges?device_id=eq.' + DEVICE_ID + '&select=expires_at', {signal});
    const now = Date.now();
    const online = leases.some((l) => new Date(l.expires_at).getTime() > now);
    const onlineChanged = state.tomatoOnlineKnown && online !== state.tomatoOnline;
    if (!state.tomatoOnlineKnown) {
      state.tomatoOnlineKnown = true;
      if (!online) {
        const views = await jobViews();
        state.connectionOutcome = views.personalityOutcome('HARDWARE_OFFLINE', 'initial-offline:' + DEVICE_ID);
      }
    } else if (online !== state.tomatoOnline) {
      const views = await jobViews();
      const event = online ? 'HARDWARE_RESTORED' : 'HARDWARE_OFFLINE';
      const leaseKey = leases.map(lease => lease.expires_at).sort().join(',');
      state.connectionOutcome = views.personalityOutcome(event, event + ':' + leaseKey);
      state.connectionOutcomeUntil = online ? now + 8000 : 0;
    }
    state.networkIssue = false;
    state.tomatoOnline = online;
    changed = onlineChanged;
    if (state.conversation && state.peer && viewingPeer(state.peer.id) && !state.awaitTomatoAt) {
      changed = (await fetchMessages(signal)) || changed;
    }
    changed = (await refreshInbox(signal)) || changed;
    changed = (await search($('chat-search') ? $('chat-search').value : '', signal)) || changed;
    if (onlineChanged) {
      renderPeople();
      renderThread();
    }
    renderNotice();
  } catch (err) {
    if (err.name !== 'AbortError') {
      state.networkIssue = true;
      renderBanner();
      changed = true;
    }
  } finally {
    if (state.pollAbort === controller) state.pollAbort = null;
    state.pollInFlight = false;
    schedulePoll(pollingDelay(changed));
  }
}

function startPolling() {
  stopPolling();
  state.unchangedPolls = 0;
  if (!document.hidden) poll();
}

function stopPolling() {
  if (state.pollTimer) clearTimeout(state.pollTimer);
  state.pollTimer = 0;
  if (state.pollAbort) state.pollAbort.abort();
  state.pollAbort = null;
}

async function checkAdmin() {
  try {
    state.isAdmin = !!(await request('rest/v1/rpc/am_i_admin', { body: {} }));
  } catch (err) {
    state.isAdmin = false;
  }
  renderAdmin();
}

async function removePerson(peer) {
  if (!confirm('Remove ' + peer.display_name + ' from Envelop? Their conversations go too.')) return;
  try {
    await request('rest/v1/rpc/admin_remove_profile', { body: { p_user: peer.id } });
    if (state.peer && state.peer.id === peer.id) {
      state.peer = null; state.conversation = null; state.messages = [];
    }
    showError('');
    await search($('chat-search') ? $('chat-search').value : '');
    renderThread();
  } catch (err) {
    showError(err.message);
  }
}

async function flushAll() {
  if (!confirm('Flush EVERYTHING? All people, conversations and messages go. Only Tomato stays.')) return;
  if (!confirm('Really flush? This cannot be undone.')) return;
  try {
    await request('rest/v1/rpc/admin_flush', { body: {} });
    forget();
    showError('Flushed. Enter a name to start over (re-bootstrap admin + bridge grants after).');
  } catch (err) {
    showError(err.message);
  }
}

function renderWelcome() {
  $('chat-welcome').hidden = false;
  $('chat-grid').hidden = true;
  setPane('list');
}

function renderChat() {
  $('chat-welcome').hidden = true;
  $('chat-grid').hidden = false;
  setPane(state.peer ? 'thread' : 'list');
  renderMe(false);
  renderPeople();
  renderAdmin();
  renderThread();
}

function renderMe(editing) {
  const me = $('chat-me');
  me.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'chat-me-row';
  const av = document.createElement('span');
  av.className = 'avatar';
  av.style.background = avatarColor(state.profile.avatar_id);
  av.textContent = (state.profile.display_name || '?').slice(0, 1).toUpperCase();
  row.appendChild(av);
  const who = document.createElement('span');
  who.className = 'who';
  const name = document.createElement('b');
  name.textContent = state.profile.display_name;
  if (state.profile.verified) {
    const seal = document.createElement('img');
    seal.src = '../media/verified.svg';
    seal.alt = 'Verified';
    seal.width = 14; seal.height = 14;
    name.appendChild(seal);
  }
  who.append(name);
  const sub = document.createElement('small');
  sub.textContent = 'Online';
  who.appendChild(sub);
  row.appendChild(who);
  if (!editing) {
    const pen = document.createElement('button');
    pen.type = 'button';
    pen.className = 'icon-btn';
    pen.title = 'Edit name';
    pen.setAttribute('aria-label', 'Edit name');
    pen.textContent = '✎';
    pen.addEventListener('click', () => renderMe(true));
    row.appendChild(pen);
  }
  me.append(row);
  if (!editing) return;
  const ed = document.createElement('div');
  ed.className = 'chat-edit';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 32;
  input.value = state.profile.display_name;
  input.setAttribute('aria-label', 'New name');
  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = 'Save';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  save.addEventListener('click', async () => {
    const v = input.value.trim();
    if (!v || v.length > 32) { showError('Name must be 1–32 characters'); return; }
    try {
      state.profile = await request('rest/v1/rpc/update_profile_name', { body: { p_name: v } });
      showError('');
      renderMe(false);
    } catch (err) {
      showError(err.message);
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save.click();
    if (e.key === 'Escape') { renderMe(false); showError(''); }
  });
  cancel.addEventListener('click', () => { renderMe(false); showError(''); });
  ed.append(input, save, cancel);
  me.appendChild(ed);
  input.focus();
  input.select();
}

function renderPeople() {
  const list = $('chat-people');
  list.innerHTML = '';
  for (const p of state.people) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    if (state.peer && state.peer.id === p.id) btn.setAttribute('aria-current', 'true');
    const av = document.createElement('span');
    av.className = 'avatar';
    av.style.background = avatarColor(p.avatar_id);
    av.textContent = (p.display_name || '?').slice(0, 1).toUpperCase();
    const who = document.createElement('span');
    who.className = 'who';
    const b = document.createElement('b');
    b.textContent = p.display_name;
    if (p.verified) {
      const seal = document.createElement('img');
      seal.src = '../media/verified.svg';
      seal.alt = 'Verified';
      seal.width = 14; seal.height = 14;
      b.appendChild(seal);
    }
    who.appendChild(b);
    const sub = document.createElement('small');
    const online = p.is_device ? state.tomatoOnline : !state.presenceMode || isFresh(p);
    const unread = hasUnread(p.id);
    sub.textContent = unread ? 'Unread' : online ? 'Online' : 'Offline';
    who.appendChild(sub);
    btn.append(av, who);
    if (unread) {
      btn.classList.add('unread');
      const pip = document.createElement('span');
      pip.className = 'unread-pip';
      pip.setAttribute('aria-hidden', 'true');
      btn.appendChild(pip);
      btn.setAttribute('aria-label', (p.display_name || 'Person') + ', unread');
    }
    btn.addEventListener('click', () => openPeer(p));
    li.appendChild(btn);
    if (state.isAdmin && !p.is_device && state.profile && p.id !== state.profile.id) {
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'row-remove';
      rm.title = 'Remove ' + p.display_name;
      rm.setAttribute('aria-label', 'Remove ' + p.display_name);
      rm.textContent = '✕';
      rm.addEventListener('click', () => removePerson(p));
      li.appendChild(rm);
    }
    list.appendChild(li);
  }
}

function renderAdmin() {
  const box = $('chat-admin');
  box.innerHTML = '';
  if (!state.isAdmin) { box.hidden = true; return; }
  box.hidden = false;
  const label = document.createElement('span');
  label.textContent = 'Admin';
  const flush = document.createElement('button');
  flush.type = 'button';
  flush.textContent = 'Flush everything';
  flush.addEventListener('click', flushAll);
  box.append(label, flush);
}

function insertExample(draft, example, start = draft.length, end = start) {
  const before = draft.slice(0, start), after = draft.slice(end);
  const text = (before && !/\s$/.test(before) ? ' ' : '') + example
    + (after && !/^\s/.test(after) ? ' ' : '');
  return {value: before + text + after, cursor: before.length + text.length};
}

function fillDraft(prompt) {
  const input = $('chat-draft');
  if (!input) return;
  input.value = String(prompt || '');
  input.focus();
  showError('');
}

async function submitCuratedText(value) {
  const input = $('chat-draft');
  if (!input || state.busy || state.submitting) return;
  if (input.value.trim()) {
    if (helpGuideModule?.isHelpRequest(value)) { await addHelpJob(value); return; }
    const answer = intentsModule?.localAnswerFor(value);
    if (answer) { addKnowledgeJob(value, answer); return; }
    // Natural-language examples insert their parsed expression, not prose inside math.
    let example = String(value || '');
    try {
      const compiler = await import('./virtual/compiler.mjs?v=' + ASSET_VERSION);
      const parsed = compiler.compile(example);
      if (parsed?.understood) example = '(' + parsed.understood + ')';
    } catch { /* malformed examples remain available for deliberate experiments */ }
    const next = insertExample(input.value, example, input.selectionStart, input.selectionEnd);
    if (BufferSafeLength(next.value) > 256) { showError('That example would exceed 256 bytes.'); return; }
    input.value = next.value;
    input.focus();
    input.setSelectionRange(next.cursor, next.cursor);
    showError('');
    return;
  }
  input.value = String(value || '');
  showError('');
  await send();
}

function addKnowledgeJob(body, answer) {
  localJobs.push({
    id: randomId(),
    conversation: state.conversation,
    body,
    created_at: new Date().toISOString(),
    knowledge: true,
    answer,
  });
  requestLatestScroll();
  renderThread();
}

function addConversationJob(body, reply) {
  const job = {id:randomId(), conversation:state.conversation, body, created_at:new Date().toISOString(),
    phase:'succeeded', compute:false, via:'local', target:'Envelop · local conversation rules', replies:[reply]};
  localJobs.push(job); requestLatestScroll(); renderThread();
}

function addGuidanceJob(body) {
  const job = {id:randomId(), conversation:state.conversation, body, created_at:new Date().toISOString(),
    phase:'failed', compute:false, via:'local',
    outcome:{event:'UNANSWERED_REQUEST',voice:'envelop',technical:'UNANSWERED_REQUEST'}};
  localJobs.push(job); requestLatestScroll(); renderThread();
}

async function queueHardwareNote(body) {
  if (!tomatoPrintable(body)) { throw new Error('Notes for physical Tomato need 1–256 printable ASCII bytes.'); }
  await request('rest/v1/rpc/send_message', {body:{p_conversation:state.conversation,p_body:body,p_nonce:randomId()}});
  requestLatestScroll(); await fetchMessages(); showError('');
}

function addVirtualGreeting(body, preview = false) {
  const fullName = String(state.profile && state.profile.display_name || 'Friend').trim();
  const firstName = fullName.split(/\s+/)[0] || 'Friend';
  const job = {
    id: randomId(),
    conversation: state.conversation,
    body,
    name: fullName,
    created_at: new Date().toISOString(),
    phase: 'succeeded',
    compute: false,
    preview,
    via: 'virtual',
    target: 'Virtual Tomato · deterministic greeting rule',
    replies: [`Hello, ${firstName}! I'm Virtual Tomato.`],
  };
  updateJobView(job);
  localJobs.push(job);
  requestLatestScroll();
  renderThread();
}

function renderPromptButton(prompt, label = prompt) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'prompt-button';
  button.dataset.prompt = prompt;
  button.textContent = label;
  button.addEventListener('click', async () => {
    button.disabled = true;
    await submitCuratedText(prompt);
    if (button.isConnected) button.disabled = false;
  });
  return button;
}

function safeKnowledgeHref(value) {
  try {
    const url = new URL(String(value || ''), location.href);
    const allowed = url.origin === location.origin
      || ['tmarhguy.com', 'tomato.tmarhguy.com', 'github.com', 'en.wikipedia.org'].includes(url.hostname);
    return url.protocol === 'https:' && allowed ? url.href : null;
  } catch {
    return null;
  }
}

function renderAnswerAction(action) {
  if (!action || !['ask', 'compute', 'link'].includes(action.type)) return null;
  if (action.type !== 'link') return renderPromptButton(action.value, action.label);
  const href = safeKnowledgeHref(action.href);
  if (!href) return null;
  const anchor = document.createElement('a');
  anchor.className = 'prompt-button prompt-link';
  anchor.href = href;
  anchor.textContent = action.label;
  if (new URL(href).origin !== location.origin) {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  }
  return anchor;
}

function renderKnowledgeJob(job) {
  const card = document.createElement('article');
  card.className = 'chat-job knowledge-card';
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', job.liveAnnounced ? 'off' : 'polite');
  card.setAttribute('aria-atomic', 'true');
  job.liveAnnounced = true;
  const query = document.createElement('div');
  query.className = 'job-text';
  query.textContent = job.body;
  const answer = document.createElement('p');
  answer.className = 'knowledge-answer';
  answer.textContent = job.answer.answer;
  const provenance = document.createElement('small');
  provenance.className = 'job-technical';
  const source = job.answer.provenance;
  const sourceHref = safeKnowledgeHref(source && source.href);
  if (sourceHref) {
    const sourceLink = document.createElement('a');
    sourceLink.href = sourceHref;
    sourceLink.textContent = `${source.label} · reviewed local answer`;
    if (new URL(sourceHref).origin !== location.origin) {
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener noreferrer';
    }
    provenance.append(sourceLink);
  } else {
    provenance.textContent = 'Reviewed local answer';
  }
  const actions = document.createElement('div');
  actions.className = 'prompt-list';
  actions.setAttribute('aria-label', 'Answer actions');
  for (const action of job.answer.actions || []) {
    const element = renderAnswerAction(action);
    if (element) actions.append(element);
  }
  card.append(query, answer, provenance, actions);
  return card;
}

async function addHelpJob(body = '/help') {
  const guide = await helpGuide();
  localJobs.push({
    id: randomId(),
    conversation: state.conversation,
    body,
    name: state.profile && state.profile.display_name,
    created_at: new Date().toISOString(),
    help: true,
    guide: guide.HELP_GUIDE,
  });
  requestLatestScroll();
  renderThread();
}

function renderHelpJob(job) {
  const card = document.createElement('article');
  card.className = 'chat-job help-guide';
  const query = document.createElement('div');
  query.className = 'job-text';
  query.textContent = job.body;
  card.append(query);

  const title = document.createElement('h2');
  title.textContent = job.guide.title;
  card.append(title);
  const intro = document.createElement('p');
  intro.className = 'help-intro';
  intro.textContent = job.guide.intro;
  card.append(intro);

  const groups = document.createElement('div');
  groups.className = 'help-groups';
  for (const group of job.guide.groups) {
    const section = document.createElement('details');
    const groupId = `${job.id}:${group.title}`;
    section.open = expandedMessages.has(groupId);
    section.addEventListener('toggle', () => { if (section.open) expandedMessages.add(groupId); else expandedMessages.delete(groupId); });
    const heading = document.createElement('summary');
    heading.textContent = group.title;
    section.append(heading);
    const list = document.createElement('ul');
    for (const option of group.options) {
      const item = document.createElement('li');
      item.append(renderPromptButton(option.prompt, option.label));
      const example = document.createElement('code');
      example.textContent = option.prompt;
      item.append(example);
      list.append(item);
    }
    section.append(list);
    groups.append(section);
  }
  card.append(groups);

  const technical = document.createElement('small');
  technical.className = 'job-technical help-technical';
  technical.textContent = 'Envelop · examples';
  card.append(technical);
  return card;
}

function appendFallbackSupport(parent, rawReply) {
  const hint = document.createElement('p');
  hint.className = 'fallback-hint';
  hint.textContent = 'Try /help for a list of options.';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Show /help options';
  button.addEventListener('click', () => addHelpJob('/help'));
  hint.append(document.createTextNode(' '), button);
  parent.append(hint);

  const details = document.createElement('details');
  details.className = 'job-exec fallback-raw';
  const summary = document.createElement('summary');
  summary.textContent = 'View original Tomato reply';
  const raw = document.createElement('pre');
  raw.textContent = rawReply;
  details.append(summary, raw);
  parent.append(details);
}

function renderLegacyFallback(message) {
  const card = document.createElement('article');
  card.className = 'chat-msg them legacy-fallback';
  const fallback = helpGuideModule.legacyUnansweredDetails(message.body);
  const outcome = jobViewsModule.personalityOutcome(
    fallback.event,
    message.id || message.body,
  );
  const human = document.createElement('div');
  human.className = 'job-human';
  human.textContent = 'I don’t have a matching answer for that yet. Try a calculation or a question about Tomato.';
  const technical = document.createElement('small');
  technical.className = 'job-technical';
  technical.textContent = 'Let’s try a different way';
  card.append(technical, human);
  appendFallbackSupport(card, message.body);
  const stamp = document.createElement('time');
  const date = new Date(message.created_at);
  stamp.textContent = isNaN(date) ? '' : date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  card.append(stamp);
  return card;
}

function saveJobHistory() {
  if (!state.profile) return;
  try { sessionStorage.setItem('envelop.jobs.' + state.profile.id, JSON.stringify(localJobs.slice(-100))); } catch { /* storage may be unavailable */ }
}

function loadJobHistory() {
  localJobs.length = 0;
  try {
    const jobs = JSON.parse(sessionStorage.getItem('envelop.jobs.' + state.profile.id) || '[]');
    for (const job of jobs.slice(-100)) {
      if (!job || typeof job.id !== 'string' || typeof job.body !== 'string') continue;
      if (['compiling','queued','executing'].includes(job.phase)) {
        job.phase = job.via === 'hardware' ? 'unknown' : 'failed';
        if (job.phase === 'failed') job.outcome = {voice:'envelop',text:'The page closed before execution finished. Send the expression again to run it.',technical:'VIRTUAL_INTERRUPTED'};
      }
      delete job.liveSignature;
      localJobs.push(job);
    }
  } catch { /* invalid or unavailable tab storage */ }
}

function renderThread() {
  saveJobHistory();
  const empty = $('chat-empty');
  const wrap = $('chat-convo');
  if (!state.peer) {
    empty.hidden = false;
    wrap.hidden = true;
    setPane('list');
    syncTyping();
    return;
  }
  empty.hidden = true; wrap.hidden = false;
  setPane('thread');
  const head = $('chat-peer');
  head.innerHTML = '';
  head.append(state.peer.display_name);
  if (state.peer.verified) {
    const seal = document.createElement('img');
    seal.src = '../media/verified.svg';
    seal.alt = 'Verified';
    seal.width = 16; seal.height = 16;
    head.appendChild(seal);
  }
  const sub = document.createElement('small');
  if (state.peer.is_device) {
    if (tomatoIsBusy()) sub.textContent = 'Typing…';
    else if (mobileChat()) sub.textContent = state.tomatoOnline ? 'Physical online' : 'Virtual ready';
    else sub.textContent = state.tomatoOnline
      ? 'Online · notes appear on Tomato’s screen'
      : 'Offline · Virtual Tomato available';
  } else {
    sub.textContent = !state.presenceMode || isFresh(state.peer) ? 'Online' : 'Offline';
  }
  head.appendChild(sub);
  renderNotice();
  const box = $('chat-messages');
  const log = $('chat-log') || box;
  const prevTop = log.scrollTop;
  const fresh = box.dataset.conv !== String(state.conversation || '');
  const nearBottom = fresh || (log.scrollHeight - prevTop - log.clientHeight < 80);
  const stickToLatest = state.scrollToLatest || nearBottom;
  state.scrollToLatest = false;
  box.innerHTML = '';
  for (const item of timelineItems(state.messages, localJobs, state.conversation)) {
    if (item.kind === 'job') {
      box.appendChild(renderJob(item.value));
      continue;
    }
    const m = item.value;
    const isTomatoFallback = m.sender_id !== (state.profile && state.profile.id)
      && state.peer.is_device
      && helpGuideModule
      && jobViewsModule
      && helpGuideModule.legacyUnansweredDetails(m.body);
    if (isTomatoFallback) {
      box.appendChild(renderLegacyFallback(m));
      continue;
    }
    const div = document.createElement('div');
    div.className = 'chat-msg ' + (m.sender_id === (state.profile && state.profile.id) ? 'me' : 'them');
    appendMessageViews(div, m.id, m.body, null, null, 'UTF-8 message bytes', ['Text','Hex']);
    const t = document.createElement('time');
    const d = new Date(m.created_at);
    t.textContent = isNaN(d) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    div.appendChild(t);
    if (state.peer.is_device && m.sender_id === state.profile?.id) {
      const receipt = document.createElement('small');
      receipt.className = 'note-receipt';
      receipt.textContent = 'Physical note · saved for delivery. Notes appear on Tomato’s screen when it connects; they may not receive a reply.';
      div.append(receipt);
    }
    box.appendChild(div);
  }
  box.dataset.conv = String(state.conversation || '');
  syncTyping();
  log.scrollTop = stickToLatest ? log.scrollHeight : prevTop;
  if (stickToLatest) {
    requestAnimationFrame(() => {
      if (log === $('chat-log')) log.scrollTop = log.scrollHeight;
    });
  }
}

function renderNotice() {
  const notice = $('chat-notice');
  if (notice) notice.hidden = true;
  renderBanner();
}

function selectExecutionMode(mode) {
  if (state.submitting || state.busy) return;
  state.executionMode = mode === 'physical' ? 'physical' : 'virtual';
  try { localStorage.setItem(MODE_KEY, state.executionMode); } catch {}
  renderBanner(); syncComposer();
}

function renderBanner() {
  const control = $('execution-mode');
  if (!control) return;
  control.hidden = !(state.profile && !$('chat-grid').hidden && state.peer?.is_device);
  for (const mode of ['virtual','physical']) {
    $(`mode-${mode}`).setAttribute('aria-pressed', String(state.executionMode === mode));
  }
  const description = experienceModule?.modeDescription(state.executionMode, state.tomatoOnline);
  if (description) $('mode-description').textContent = state.networkIssue && state.executionMode === 'physical'
    ? 'Connection paused. Existing queued requests stay saved; new requests need a connection.' : description;
  syncComposer();
}

async function leave() {
  if (!confirm('Leave Envelop? Your name and conversations are deleted for good.')) return;
  try {
    await request('rest/v1/rpc/leave_network', { body: {} });
    forget();
    showError('Left. Your chats were deleted.');
  } catch (err) {
    showError(err.message);
  }
}

function forget() {
  // Best-effort server wipe first so the name doesn't linger for
  // everyone else; falls back to dropping the local session only
  // (pre-004 backends, or identities never named).
  if (state.creds) {
    request('rest/v1/rpc/leave_network', { body: {} }).catch(() => {});
  }
  try { sessionStorage.removeItem('envelop.jobs.' + state.profile?.id); } catch {}
  localJobs.length = 0;
  try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  stopPolling();
  state.creds = null; state.profile = null; state.peer = null;
  state.conversation = null; state.messages = []; state.people = [];
  state.isAdmin = false;
  state.tomatoOnline = false;
  state.tomatoOnlineKnown = false;
  state.connectionOutcome = null;
  state.connectionOutcomeUntil = 0;
  state.awaitTomatoAt = 0;
  state.awaitTomatoExpected = 0;
  state.awaitTomatoReceived = 0;
  stopReplyPolling();
  state.loadingThread = false;
  state.readAt = {};
  state.latestIncoming = {};
  clearTimeout(typingTimer);
  setBusy(false);
  $('chat-admin').hidden = true;
  renderWelcome();
  showError('');
}

function bindTryChip(chip) {
  chip.addEventListener('click', async () => {
    const text = chip.getAttribute('data-example') || chip.textContent.trim();
    if (state.profile && !$('chat-grid').hidden) {
      const tomato = state.people.find((p) => p.is_device);
      if (!tomato) {
        fillDraft(text);
        return;
      }
      if (tomato && (!state.peer || state.peer.id !== tomato.id)) {
        try { await openPeer(tomato); } catch (e) {
          fillDraft(text);
          return;
        }
      }
      chip.disabled = true;
      await submitCuratedText(text);
      suggestionRound += 1;
      if (helpGuideModule) renderSuggestions(helpGuideModule);
      if (chip.isConnected) chip.disabled = false;
      return;
    }
    const nameInput = $('chat-name');
    if (!nameInput || !nameInput.value.trim()) {
      pendingDraft = text;
      const hint = $('try-hint');
      if (hint) {
        hint.hidden = false;
        hint.textContent = 'Pick a name above, press Enter — we’ll fill in “' + text + '” for Tomato.';
      }
      if (nameInput) nameInput.focus();
      return;
    }
    pendingDraft = text;
    enter();
  });
}

function renderSuggestions(module) {
  let session = 'session';
  try {
    session = sessionStorage.getItem('envelop.playground.session') || randomId();
    sessionStorage.setItem('envelop.playground.session', session);
  } catch (e) { /* deterministic day rotation still applies */ }
  const now = new Date();
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  for (const [index, row] of [...document.querySelectorAll('[data-suggestions]')].entries()) {
    row.innerHTML = '';
    const lead = document.createElement('span');
    lead.textContent = $('chat-draft')?.value.trim() ? 'Insert:' : 'Try:';
    row.append(lead);
    const input = $('chat-draft') ? $('chat-draft').value : '';
    for (const suggestion of module.selectSuggestions({session: `${session}:${index}`, day, input, round: suggestionRound, started: suggestionStarted, count: 4})) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'try-chip';
      chip.dataset.example = suggestion.prompt;
      chip.textContent = suggestion.label;
      chip.title = `${module.isHelpRequest(suggestion.prompt) ? 'Show help' : input.trim() ? 'Insert into draft' : 'Run now'}: ${suggestion.prompt}`;
      row.append(chip);
      bindTryChip(chip);
    }
  }
}

function markSuggestionOperationStarted() {
  if (suggestionStarted) return;
  suggestionStarted = true;
  try { sessionStorage.setItem('envelop.suggestions.started', '1'); } catch (e) { /* private mode */ }
  suggestionRound += 1;
  if (helpGuideModule) renderSuggestions(helpGuideModule);
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    try { state.executionMode = localStorage.getItem(MODE_KEY) === 'physical' ? 'physical' : 'virtual'; } catch {}
    try { suggestionStarted = sessionStorage.getItem('envelop.suggestions.started') === '1'; } catch (e) { /* private mode */ }
    $('chat-join').addEventListener('click', enter);
    $('chat-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); });
    // Tappable examples: tap enters the exact text, addressed to Tomato.
    document.querySelectorAll('.try-chip').forEach(bindTryChip);
    $('chat-send').addEventListener('click', send);
    $('chat-draft').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    $('chat-draft').addEventListener('input', () => {
      suggestionRound += 1;
      if (helpGuideModule) renderSuggestions(helpGuideModule);
    });
    $('chat-search').addEventListener('input', (e) => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => search(e.target.value), 250);
    });
    $('chat-forget').addEventListener('click', forget);
    $('chat-leave').addEventListener('click', leave);
    $('mode-virtual').addEventListener('click', () => selectExecutionMode('virtual'));
    $('mode-physical').addEventListener('click', () => selectExecutionMode('physical'));
    $('chat-back').addEventListener('click', () => {
      if (history.state && history.state.envelopPane === 'thread') history.back();
      else closeThread();
    });
    window.addEventListener('popstate', () => {
      if (state.peer && mobileChat()) closeThread();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.peer && mobileChat() && !$('chat-grid').hidden) {
        if (history.state && history.state.envelopPane === 'thread') history.back();
        else closeThread();
      }
    });
    bindAppHeight();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopPolling();
        stopReplyPolling();
      }
      else if (state.profile) {
        state.unchangedPolls = 0;
        poll();
        if (state.awaitTomatoAt) scheduleReplyPoll();
      }
    });
    for (const menu of document.querySelectorAll('.site-menu')) {
      menu.addEventListener('click', event => { if (event.target.closest('a')) menu.open = false; });
      document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; });
      menu.addEventListener('keydown', event => {
        if (event.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); }
      });
    }
    Promise.all([jobViews(), helpGuide(), tomatoIntents(), experience()])
      .then(([, guide]) => {
        renderSuggestions(guide);
        if (state.profile) renderThread();
      })
      .catch(() => { /* surfaced when the related action is used */ });
    window.addEventListener('pagehide', () => {
      stopReplyPolling();
    }, {once: true});
    restore();
  });
}

if (typeof module !== 'undefined') module.exports = { avatarFor, computeResolution, randomId, resultTrace, timelineItems, insertExample };


// All rendering uses textContent. Program/hex never become executable markup.
function appendMessageViews(parent,id,text,program,bytes,version,modes) {
  const tabs=document.createElement('div');tabs.className='message-tabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Message representation');
  const content=document.createElement('div');content.className='message-content';
  const choices=modes||['Text','Program','Hex'];
  const paint=()=>{const mode=messageTabs.get(id)||'Text';for(const b of tabs.children)b.setAttribute('aria-pressed',String(b.textContent===mode));
    content.textContent=mode==='Text'?text:mode==='Program'?program:version+'\n'+(bytes||Array.from(new TextEncoder().encode(text),b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' '));
    content.classList.toggle('code-view',mode!=='Text');};
  for(const label of choices){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{messageTabs.set(id,label);paint();};tabs.append(b);}
  parent.append(tabs,content);paint();
}
function renderJob(job) {
 if(job.help)return renderHelpJob(job);
 if(job.knowledge)return renderKnowledgeJob(job);
 const card=document.createElement('article');card.className='chat-job';
 const q=document.createElement('div');q.className='job-text';q.textContent=job.body;card.append(q);
 if(job.compute&&job.understood){
  const u=document.createElement('p');u.className='job-understood';
  const lab=document.createElement('small');lab.textContent='Understood as';u.append(lab);
  const line=document.createElement('code');line.textContent=job.understood;u.append(line);card.append(u);
 }
 updateJobView(job);
 const view=job.view||{phase:job.phase||'unknown',voice:'envelop',text:'Operation status unavailable.',technical:'STATUS_UNKNOWN'};
 card.dataset.tone=view.tone||'working';
 const appendReplies=()=>{
  for(const reply of (job.replies||[])){const bubble=document.createElement('div');bubble.className='virtual-reply';const label=document.createElement('small');label.textContent=job.via==='local'?'Envelop':job.via==='hardware'?'Physical Tomato':job.compute?'Virtual Tomato':'Virtual Tomato · reply';bubble.append(label);const t=document.createElement('div');t.className='virtual-text';t.textContent=reply;bubble.append(t);card.append(bubble);}
 };
 if(view.resultFirst)appendReplies();
 const status=document.createElement('div');status.className='job-status job-response';status.dataset.phase=view.phase;
 const liveSignature=JSON.stringify([view.phase,view.text,view.technical,job.replies||[]]);
 const announce=job.liveSignature!==liveSignature;
 job.liveSignature=liveSignature;
 status.setAttribute('role','status');
 status.setAttribute('aria-live',announce?'polite':'off');
 status.setAttribute('aria-atomic','true');
 if(announce&&job.replies&&job.replies.length)status.setAttribute('aria-label',[view.text,...job.replies].filter(Boolean).join(' '));
 if(view.pending)status.append(typingDots());
 const statusCopy=document.createElement('span');statusCopy.className='job-response-copy';
 if(view.title){const title=document.createElement('strong');title.className='response-title';title.textContent=view.title;statusCopy.append(title);}
 if(view.text){
  const human=document.createElement('span');human.className='job-human';
  human.textContent=view.text;statusCopy.append(human);
 }
 if(view.technical && view.phase==='succeeded'){
  const technical=document.createElement('small');technical.className='job-technical';technical.textContent=view.technical;statusCopy.append(technical);
 }
 if(view.guidance){
  const guidance=document.createElement('span');guidance.className='job-guidance';guidance.textContent=view.guidance;statusCopy.append(guidance);
 }
 status.append(statusCopy);card.append(status);
 if (!view.resultFirst) appendReplies();
 if(view.tone==='guidance') {
   const actions=document.createElement('div');actions.className='prompt-list';
   const edit=document.createElement('button');edit.type='button';edit.className='prompt-button';edit.textContent='Edit request';
   edit.onclick=()=>{if($('chat-draft').value.trim()) { showError('Your draft is still here. Finish it or clear it before editing this request.'); $('chat-draft').focus(); } else fillDraft(job.body);};
   actions.append(edit,renderPromptButton('/help','Explore examples'),renderPromptButton('23 + 19','Try 23 + 19'));
   card.append(actions);
 }
 if(view.phase==='failed' && view.tone==='problem' && job.via==='virtual') {
   const retry=document.createElement('button');retry.type='button';retry.className='prompt-button';retry.textContent='Retry virtually';
   retry.onclick=()=>{if(virtualQueue.length>=4){showError('Let a waiting calculation finish first.');return;} job.phase='queued';job.outcome=null;runVirtual(job);};
   card.append(retry);
 }
 if(view.phase==='queued' && job.via==='hardware' && job.backendId) {
   const cancel=document.createElement('button');cancel.type='button';cancel.className='prompt-button';cancel.textContent='Cancel queued run';
   cancel.onclick=async()=>{cancel.disabled=true;try{await cancelHardwareJob(job);}catch(error){showError('Could not confirm cancellation. Check the hardware result before retrying.');cancel.disabled=false;}};
   card.append(cancel);
 }
 if(view.phase!=='succeeded' && view.technical) {
   const diagnostics=document.createElement('details');diagnostics.className='job-diagnostics';
   const summary=document.createElement('summary');summary.textContent='Technical details';
   const pre=document.createElement('pre');pre.textContent=view.technical+(job.fallbackRaw?'\n'+job.fallbackRaw:'');
   diagnostics.append(summary,pre);card.append(diagnostics);
 }
   if (view.phase==='failed' && job.compute && job.hardwareAttempt && job.virtualSafe && !(job.replies&&job.replies.length)) {
     const note=document.createElement('p');note.className='job-status hardware-fallback';
     const copy=document.createElement('span');
     copy.textContent='This hardware run has ended. You can start a separate virtual run.';
     const fb=document.createElement('button');fb.type='button';fb.textContent='Run in Virtual Tomato';
     fb.onclick=()=>{job.hwSeq=(job.hwSeq||0)+1;job.phase='queued';job.outcome=null;job.via=null;job.hardwareAttempt=false;job.virtualSafe=false;updateJobView(job);runVirtual(job);};
     note.append(copy,fb);card.append(note);
   }
 if(view.phase==='unknown' && job.backendId){
   const check=document.createElement('button');check.type='button';check.className='prompt-button';check.textContent='Check hardware result';
   check.onclick=async()=>{
     check.disabled=true;
     try {
       const row=await request(COMPUTE_API.read,{body:{p_job:job.backendId}});
       if(row.status==='completed')completeHardwareJob(job,row);
       else if(['failed','cancelled'].includes(row.status)){
         job.virtualSafe=true;
         failJobWithEnvelop(job,row.result_text||'The physical job is terminal.','HARDWARE_JOB_TERMINAL');
       }else showError('This hardware job is still pending. It has not been replayed.');
       renderThread();
     }catch(error){showError(error.message);check.disabled=false;}
   };
   card.append(check);
 }
 if(!job.program&&!job.hex)return card;
  const det=document.createElement('details');det.className='job-exec';
 det.open=expandedMessages.has(job.id);
 det.addEventListener('toggle',()=>{if(det.open)expandedMessages.add(job.id);else expandedMessages.delete(job.id);});
 const sum=document.createElement('summary');sum.textContent='View execution';det.append(sum);
 const block=(label,value)=>{
  if(value===undefined||value===null||value==='')return;
  const wrap=document.createElement('div');wrap.className='exec-block';
  const heading=document.createElement('small');heading.textContent=label;wrap.append(heading);
  const pre=document.createElement('pre');pre.textContent=String(value);wrap.append(pre);det.append(wrap);
 };
 block('Source',job.body);
 if(job.understood)block('Parsed expression',job.understood);
 if(job.compute){
  block('Tomato program · '+job.version,job.program);
 }
 if(job.alu)block('Native ALU · f(A,B,C) + g(A,B,C) + cin',job.alu);
 if(job.ast)block('Expression tree',JSON.stringify(job.ast,null,2));
 block(job.compute?('Encoded bytes · '+job.version):'Encoded bytes · UTF-8 chat text',job.hex||'');
 block('Selected target',job.target||(job.via==='virtual'?'Virtual Tomato · browser CPU emulator':job.via==='hardware'?'Durable hardware route · awaiting completion':'Not selected yet'));
 const returned=resultTrace(job.replies);
 if(returned)block('Returned result',`${returned.decimal}\n${returned.hex}`);
 card.append(det);
  return card;
}
function resultTrace(replies) {
  for(const reply of replies||[]){
    const match=String(reply).match(/^\s*(-?\d+)\s*\/\s*(0x[0-9a-f]+)\s*$/i);
    if(match)return {decimal:match[1],hex:match[2].toUpperCase().replace(/^0X/,'0x')};
  }
  return null;
}
function computeResolution(status) {
  if (status === 'completed') return 'physical';
  if (status === 'cancelled' || status === 'failed') return 'virtual-safe';
  return 'unknown';
}
function setJobPhase(job, phase) {
  job.phase = phase;
  updateJobView(job);
}
function failJobWithPersonality(job, event, details, key) {
  job.outcome = jobViewsModule.personalityOutcome(event, key || job.id, details);
  setJobPhase(job, 'failed');
}
function failJobWithEnvelop(job, text, code, details) {
  job.outcome = jobViewsModule.fixedOutcome({text, code, details});
  setJobPhase(job, 'failed');
}
function tomatoStatus(text) {
  const match = String(text || '').match(/Tomato rejected the job \(status (\d+)\)\.?/i);
  return match ? Number(match[1]) : null;
}
function completeHardwareJob(job, row) {
  const result = row && row.result_text;
  const statusByte = tomatoStatus(result);
  if (statusByte !== null) {
    job.virtualSafe = true;
    failJobWithPersonality(job, 'EXECUTION_FAULT', {statusByte, guidance: statusByte === 1 ? 'The physical firmware rejected an opcode. Update Tomato OS to match this compiler, or explicitly run this job virtually.' : 'The physical machine rejected this program; no result was returned.'}, job.id + ':status:' + statusByte);
    return;
  }
  job.replies = [result || 'Tomato completed the job.'];
  job.target = 'Physical Tomato · durable hardware job';
  setJobPhase(job, 'succeeded');
}
async function cancelHardwareJob(job) {
  const row=await request(COMPUTE_API.cancel,{body:{p_job:job.backendId}});
  if(row.status==='completed') { job.hwSeq=(job.hwSeq||0)+1; completeHardwareJob(job,row); }
  else if(['cancelled','failed'].includes(row.status)) {
    job.hwSeq=(job.hwSeq||0)+1;
    job.virtualSafe=true;
    job.outcome=jobViewsModule.fixedOutcome({text:'This queued run was cancelled. Nothing will run from it later.',code:'HARDWARE_CANCELLED'});
    setJobPhase(job,'failed');
  } else showError('Tomato has already picked up this run. Wait for its result before running it again.');
  renderThread();
}

async function runHardware(job) {
  // Authenticated sessions can queue while the physical machine is offline. Virtual may
  // follow only a terminal failed/cancelled row; ambiguous jobs never replay.
  job.hardwareAttempt = true; job.virtualSafe = false;
  job.via = 'hardware'; setJobPhase(job, 'queued');
  job.hwSeq = (job.hwSeq || 0) + 1;
  const seq = job.hwSeq;
  renderThread();
  const alive = () => job.hwSeq === seq && (job.phase === 'queued' || job.phase === 'executing');
  let jobId = null;
  let queuedAt = null;
  let claimedAt = null;
  let pollingFailures = 0;
  const resolveCancellation = async () => {
    if (!jobId) return 'unknown';
    try {
      const final = await request(COMPUTE_API.cancel, { body: { p_job: jobId } });
      const resolution = computeResolution(final && final.status);
      if (resolution === 'physical') {
        completeHardwareJob(job, final);
        renderThread();
      }
      return resolution;
    } catch (e) {
      return 'unknown';
    }
  };
  const showInterrupted = async () => {
    const wasExecuting = job.phase === 'executing';
    const resolution = await resolveCancellation();
    if (resolution === 'physical' || !alive()) return;
    job.virtualSafe = resolution === 'virtual-safe';
    if (resolution === 'virtual-safe') {
      if (wasExecuting) failJobWithPersonality(job, 'TIMEOUT', {}, job.id + ':physical-timeout');
      else failJobWithEnvelop(job, 'The hardware route became unavailable; the durable job is terminal.', 'HARDWARE_UNAVAILABLE');
    } else {
      setJobPhase(job, 'unknown');
    }
    renderThread();
  };
  try {
    const enq = await request(COMPUTE_API.enqueue, {
      body: { p_device: DEVICE_ID, p_conversation: job.conversation, p_job_hex: job.hex },
    });
    jobId = enq && enq.id;
    if (!jobId) throw new Error('Hardware submission could not be confirmed.');
    job.backendId = jobId;
    renderThread();
    queuedAt = Date.now();
    for (;;) {
      const queuedFor = Math.max(0, Date.now() - queuedAt);
      const pollDelay = claimedAt ? 1700 : Math.min(10000, 2000 + Math.floor(queuedFor / 15000) * 1300);
      await new Promise((r) => setTimeout(r, pollDelay));
      if (!alive()) return;
      let cur;
      try {
        cur = await request(COMPUTE_API.read, { body: { p_job: jobId } });
        pollingFailures = 0;
      } catch (e) {
        pollingFailures += 1;
        job.pollingDelayed = true;
        if (pollingFailures >= 3) { setJobPhase(job, 'unknown'); renderThread(); return; }
        continue;
      }
      if (!alive()) return;
      job.pollingDelayed = false;
      if (cur.status === 'completed') {
        completeHardwareJob(job, cur);
        renderThread(); return;
      }
      if (cur.status === 'failed' || cur.status === 'cancelled') {
        job.virtualSafe = true;
        failJobWithEnvelop(job, cur.result_text || 'The physical Tomato job is terminal.', 'HARDWARE_JOB_TERMINAL');
        renderThread(); return;
      }
      if (cur.status === 'claimed' || cur.status === 'running') {
        if (!claimedAt) claimedAt = Date.now();
        setJobPhase(job, 'executing');
      } else {
        claimedAt = null;
        setJobPhase(job, 'queued');
      }
      renderThread();
      if (claimedAt && Date.now() - claimedAt > 60000) {
        await showInterrupted();
        return;
      }
    }
  } catch (err) {
    if (!alive()) return;
    // A lost enqueue response can hide a durable queued job. With no id it
    // cannot be cancelled safely, so do not offer virtual execution.
    setJobPhase(job, 'unknown');
    renderThread();
  }
}
function runVirtual(job) {
 if(job.phase!=='queued'&&job.phase!=='compiling')return;
 if(virtualQueue.includes(job))return;
 job.via='virtual';job.target='Virtual Tomato · browser CPU emulator';setJobPhase(job,'queued');
 virtualQueue.push(job);renderThread();pumpVirtualQueue();
}
function pumpVirtualQueue() {
 if(virtualRunning||!virtualQueue.length)return;
 virtualRunning=true;executeVirtual(virtualQueue[0]);
}
function executeVirtual(job) {
 job.via='virtual';job.target='Virtual Tomato · browser CPU emulator';setJobPhase(job,'queued');renderThread();
 let worker;
 try { worker=new Worker('./virtual/worker.mjs?v='+ASSET_VERSION,{type:'module'}); }
 catch (error) { failJobWithEnvelop(job,'Could not start Virtual Tomato. '+error.message,'VIRTUAL_WORKER_ERROR');virtualQueue.shift();virtualRunning=false;renderThread();pumpVirtualQueue();return; }
 const timer=setTimeout(()=>{if(job.phase==='executing')failJobWithPersonality(job,'TIMEOUT',{},job.id+':virtual-timeout');else failJobWithEnvelop(job,'Could not start Virtual Tomato in time.','VIRTUAL_START_TIMEOUT');finish();},30000);
 let finished=false;
 function finish(){if(finished)return;finished=true;clearTimeout(timer);worker.terminate();virtualQueue.shift();virtualRunning=false;renderThread();pumpVirtualQueue();}
 worker.onerror=()=>{failJobWithEnvelop(job,'Could not start Virtual Tomato. Reload the page and try again.','VIRTUAL_WORKER_ERROR');finish();};
 worker.onmessage=async({data})=>{if(finished)return;try{if(data.kind==='compiled'){job.program=data.program;job.hex=data.hex;job.version=data.version;if(data.understood)job.understood=data.understood;if(data.ast)job.ast=data.ast;if(data.alu)job.alu=data.alu;renderThread();}
 else if(data.kind==='phase'&&data.phase==='executing'){setJobPhase(job,'executing');renderThread();}
 else if(data.kind==='result'){
  const guide=await helpGuide();
  const fallback=(data.replies||[])
    .map(reply=>guide.legacyUnansweredDetails(reply))
    .find(Boolean);
  if(fallback){
   job.fallbackRaw=fallback.rawReply;
   job.replies=[];
   failJobWithPersonality(job,fallback.event,{},job.id+':'+job.body);
  }else{
   job.replies=data.replies;job.target=data.target;setJobPhase(job,'succeeded');
  }
  finish();
 }
 else if(data.kind==='error'){
   const error=data.error||{};
   const compile=jobViewsModule.compileOutcome(error,job.body);
   if(compile){job.outcome=compile;setJobPhase(job,'failed');}
   else if(error.code==='EXECUTION_FAULT')failJobWithPersonality(job,'EXECUTION_FAULT',error.details,job.id+':'+(error.details&&error.details.statusByte));
   else if(job.phase==='executing')failJobWithPersonality(job,'EXECUTION_FAULT',error.details,job.id+':virtual-fault');
   else failJobWithEnvelop(job,error.message||'Virtual Tomato could not start.','VIRTUAL_EXECUTION_ERROR');
   finish();
 }}catch(error){failJobWithEnvelop(job,'Could not read the virtual result.','VIRTUAL_RESULT_ERROR');finish();}};
 try{worker.postMessage({text:job.body,name:job.name});}catch(error){failJobWithEnvelop(job,'Could not start the virtual run.','VIRTUAL_WORKER_ERROR');finish();}
}
