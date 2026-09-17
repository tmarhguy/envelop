'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { computeResolution, randomId, resultTrace, timelineItems, insertExample } = require('./chat.js');

test('UUID generation works when randomUUID is unavailable', () => {
  const source = {
    getRandomValues(bytes) {
      bytes.fill(0xab);
      return bytes;
    },
  };
  assert.equal(randomId(source), 'abababab-abab-4bab-abab-abababababab');
  assert.match(randomId(null), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('durable compute permits virtual only after a terminal non-result', () => {
  assert.equal(computeResolution('completed'), 'physical');
  assert.equal(computeResolution('cancelled'), 'virtual-safe');
  assert.equal(computeResolution('failed'), 'virtual-safe');
  for (const status of ['queued', 'claimed', 'running', null, undefined]) {
    assert.equal(computeResolution(status), 'unknown');
  }
});

test('hardware queue waits durably with bounded client backpressure', () => {
  const source = readFileSync(join(__dirname, 'chat.js'), 'utf8');
  const hardware = source.slice(
    source.indexOf('async function runHardware(job)'),
    source.indexOf('function runVirtual(job)'),
  );
  assert.match(source, /pendingHardware >= 4/);
  assert.match(hardware, /pollingFailures \+= 1/);
  assert.doesNotMatch(hardware, /25000|25_000/);
});

test('Tomato replies refresh progressively while the typing state is active', () => {
  const source = readFileSync(join(__dirname, 'chat.js'), 'utf8');
  const busy = source.slice(
    source.indexOf('function tomatoIsBusy()'),
    source.indexOf('function markAwaitTomato()'),
  );
  const fetch = source.slice(
    source.indexOf('async function fetchMessages(signal)'),
    source.indexOf('function tomatoPrintable(body)'),
  );
  const replyPoll = source.slice(
    source.indexOf('async function pollTomatoReplies()'),
    source.indexOf('function typingDots()'),
  );
  assert.match(source, /const TOMATO_REPLY_FAST_MS = 300/);
  assert.match(source, /const TOMATO_REPLY_SLOW_MS = 1000/);
  assert.match(source, /const TOMATO_REPLY_FAST_WINDOW_MS = 5000/);
  assert.match(source, /const TOMATO_REPLY_QUIET_MS = 1500/);
  assert.doesNotMatch(busy, /themCount\(\) > state\.awaitTomatoThem/);
  assert.match(fetch, /state\.awaitTomatoReceived \+= newTomatoMessages/);
  assert.match(fetch, /state\.awaitTomatoReceived >= state\.awaitTomatoExpected/);
  assert.match(fetch, /clearAwaitTomato\(\)/);
  assert.match(replyPoll, /await fetchMessages\(\)/);
  assert.doesNotMatch(replyPoll, /refreshInbox|search\(|device_bridges/);
  assert.match(source, /viewingPeer\(state\.peer\.id\) && !state\.awaitTomatoAt/);
  assert.match(source, /await fetchMessages\(\);\s*scheduleReplyPoll\(\)/);
  assert.match(source, /if \(greet\) \{\s*if \(state\.tomatoOnline\) markAwaitTomato\(4\)/);
});

test('virtual mode greets immediately and physical mode still reaches Tomato', () => {
  const source = readFileSync(join(__dirname, 'chat.js'), 'utf8');
  const sendFlow = source.slice(source.indexOf('async function sendDraft()'), source.indexOf('function pollingDelay'));
  const greeting = source.slice(source.indexOf('function addVirtualGreeting'), source.indexOf('function renderPromptButton'));
  assert.match(source, /MODE_KEY = 'envelop\.execution-mode\.v1'/);
  assert.match(source, /executionMode: 'virtual'/);
  assert.match(sendFlow, /if \(greet && mode === 'virtual'\) \{\s*addVirtualGreeting\(body\)/);
  assert.match(sendFlow, /if \(state\.tomatoOnline\) markAwaitTomato\(4\)/);
  assert.match(greeting, /fullName\.split\(\/\\s\+\/\)\[0\]/);
  assert.match(greeting, /Virtual Tomato · deterministic greeting rule/);
  assert.match(greeting, /Hello, \$\{firstName\}! I'm Virtual Tomato\./);
  assert.match(source, /rules\.conversationReply\(body\)/);
  assert.match(source, /addGuidanceJob\(body\)/);
});

test('virtual fallback keeps its copy and action visibly separated', () => {
  const source = readFileSync(join(__dirname, 'chat.js'), 'utf8');
  const fallback = source.slice(
    source.indexOf("if (view.phase==='failed'"),
    source.indexOf("if(!job.program&&!job.hex)"),
  );
  assert.match(fallback, /job-status hardware-fallback/);
  assert.match(fallback, /note\.append\(copy,fb\)/);
  assert.doesNotMatch(fallback, /createTextNode\(' '\)/);
});

test('result traces preserve returned decimal and hexadecimal forms', () => {
  assert.deepEqual(resultTrace(['12 / 0x0000000c']), {
    decimal: '12',
    hex: '0x0000000C',
  });
  assert.equal(resultTrace(['Tomato completed the job.']), null);
});

test('reviewed actions submit immediately and links stay navigation-only', () => {
  const source = readFileSync(join(__dirname, 'chat.js'), 'utf8');
  assert.match(source, /await submitCuratedText\(prompt\)/);
  assert.match(source, /function safeKnowledgeHref/);
  assert.match(source, /renderAnswerAction\(action\)/);
  assert.match(source, /sourceLink\.rel = 'noopener noreferrer'/);
  assert.doesNotMatch(
    source.slice(source.indexOf('function renderAnswerAction'), source.indexOf('function renderKnowledgeJob')),
    /runHardware|runVirtual|request\(/,
  );
  assert.match(source, /Expression tree/);
  assert.match(source, /Selected target/);
});

test('execution details place the expression tree after Tomato assembly', () => {
  const source = readFileSync(join(__dirname, 'chat.js'), 'utf8');
  const details = source.slice(source.indexOf("block('Source'"), source.indexOf("block('Selected target'"));
  assert.ok(details.indexOf("block('Tomato program") < details.indexOf("block('Expression tree'"));
  assert.ok(details.indexOf("block('Expression tree'") < details.indexOf("block(job.compute?('Encoded bytes"));
});

test('execution mode owns virtual versus physical compute routing', () => {
  const source = readFileSync(join(__dirname, 'chat.js'), 'utf8');
  const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
  const sendFlow = source.slice(source.indexOf('async function sendDraft()'), source.indexOf('function pollingDelay'));
  assert.match(html, /id="execution-mode"/);
  assert.match(html, /id="mode-virtual"/);
  assert.match(html, /id="mode-physical"/);
  assert.match(source, /function selectExecutionMode\(/);
  assert.match(source, /MODE_KEY = 'envelop\.execution-mode\.v1'/);
  assert.match(sendFlow, /if \(mode === 'physical'\) runHardware\(job\);\s*else runVirtual\(job\)/);
  assert.match(sendFlow, /virtualQueue\.length >= 4/);
  assert.match(source, /card\.dataset\.tone=view\.tone/);
});

test('virtual compute stops when Tomato returns instead of replaying demo waits', () => {
  const worker = readFileSync(join(__dirname, 'virtual', 'worker.mjs'), 'utf8');
  const compute = worker.slice(worker.indexOf('if(job){'), worker.indexOf('}else{'));
  assert.match(worker, /tileText\(2,11,3\)!=='Ama'/);
  assert.match(worker, /makeFrame\(3,0,\[\]\)/);
  assert.match(worker, /replies\.length=0/);
  assert.match(worker, /f\.type===8&&!job/);
  assert.match(compute, /i<64&&!computeFinished&&!executionFailure/);
  assert.doesNotMatch(compute, /i<200|i<240/);
});

test('virtual conversation stops after the complete reply stream goes quiet', () => {
  const worker = readFileSync(join(__dirname, 'virtual', 'worker.mjs'), 'utf8');
  assert.match(worker, /replies\.length===0\|\|quietTicks<12/);
  assert.match(worker, /replies\.length!==lastReplyCount/);
});

test('local knowledge routes before hardware ASCII validation', () => {
  const source = readFileSync(join(__dirname, 'chat.js'), 'utf8');
  const send = source.slice(
    source.indexOf('async function send()'),
    source.indexOf('function pollingDelay('),
  );
  assert.ok(send.indexOf('intents.localAnswerFor(body)') < send.indexOf('!tomatoPrintable(body)'));
  assert.ok(send.indexOf('guide.isHelpRequest(body)') < send.indexOf('!tomatoPrintable(body)'));
});

test('persisted messages and local jobs share one chronological timeline', () => {
  const messages = [
    {id: 'm1', created_at: '2026-09-17T01:00:00Z'},
    {id: 'm3', created_at: '2026-09-17T01:02:00Z'},
  ];
  const jobs = [
    {id: 'other', conversation: 'elsewhere', created_at: '2026-09-17T00:00:00Z'},
    {id: 'j2', conversation: 'tomato', created_at: '2026-09-17T01:01:00Z'},
  ];

  assert.deepEqual(
    timelineItems(messages, jobs, 'tomato').map(item => item.value.id),
    ['m1', 'j2', 'm3'],
  );
});

test('open-compute explainer states the deterministic footprint honestly', () => {
  const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
  assert.match(html, /DETERMINISTIC · OPEN COMPUTE/);
  assert.match(html, /Envelop runs without AI/);
  assert.match(html, /Deterministic by design/);
  assert.match(html, /0 bytes of model weights/);
  assert.match(html, /tested 96 KiB source budget/);
  assert.match(html, /Generative response space/);
  assert.match(html, /One inspectable path/);
  assert.match(html, /Same input/);
  assert.match(html, /12 · 0x0000000C/);

  const behaviorBytes = ['knowledge.mjs', 'intents.mjs', 'help.mjs']
    .reduce((total, file) => total + statSync(join(__dirname, file)).size, 0);
  assert.ok(behaviorBytes < 96 * 1024, `behavior source is ${behaviorBytes} bytes`);
});

test('open-compute comparison avoids fragile connector geometry', () => {
  const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
  const css = readFileSync(join(__dirname, 'chat.css'), 'utf8');
  const comparison = css.slice(css.indexOf('.comparison-diagram'));
  assert.match(html, /class="comparison-route-marker"[^>]*>Two architectures · two response shapes<\/div>/);
  assert.doesNotMatch(html, /<span class="dot"><\/span> PEOPLE AND ONE DORM COMPUTER/);
  assert.doesNotMatch(comparison, /\.comparison-input::after/);
  assert.doesNotMatch(comparison, /\.response-compare::before/);
  assert.doesNotMatch(comparison, /\.response-compare article::before/);
  assert.doesNotMatch(comparison, /\.deterministic-track::before/);
  assert.match(comparison, /\.deterministic-track \{[^}]*grid-template-columns:repeat\(2/);
});

test('mobile pages prioritize the recording and omit screenshot galleries', () => {
  const chatHtml = readFileSync(join(__dirname, 'index.html'), 'utf8');
  const siteHtml = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  const siteCss = readFileSync(join(__dirname, '..', 'style.css'), 'utf8');
  const chatCss = readFileSync(join(__dirname, 'chat.css'), 'utf8');
  assert.ok(chatHtml.indexOf('chat-mobile-demo') < chatHtml.indexOf('id="chat-name"'));
  assert.match(chatCss, /\.chat-mobile-demo \{ display:block/);
  assert.match(siteHtml, /class="mobile-hero-start"[^>]*>Start a conversation/);
  assert.match(siteCss, /\.mobile-hero-start \{[\s\S]*?display: flex;[\s\S]*?margin: 12px 6px 4px;/);
  assert.doesNotMatch(siteCss.slice(siteCss.lastIndexOf('.mobile-hero-start {')), /position:\s*absolute/);
  assert.match(siteCss, /\.hero-demo \{ order:-1;max-width:none; \}/);
  assert.match(siteCss, /\.evidence-pair \{ display:none; \}/);
});

test('minimal suggestions live inside the active chat instead of name entry', () => {
  const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
  const source = readFileSync(join(__dirname, 'chat.js'), 'utf8');
  const css = readFileSync(join(__dirname, 'chat.css'), 'utf8');
  const welcome = html.slice(html.indexOf('id="chat-welcome"'), html.indexOf('id="chat-grid"'));
  const conversation = html.slice(html.indexOf('id="chat-convo"'), html.indexOf('class="chat-composer"'));
  const binding = source.slice(source.indexOf('function bindTryChip'), source.indexOf('function renderSuggestions'));
  assert.doesNotMatch(welcome, /data-suggestions/);
  assert.match(conversation, /class="try-row thread-suggestions" data-suggestions/);
  assert.match(binding, /await submitCuratedText\(text\)/);
  assert.match(source, /\$\('chat-draft'\)\.addEventListener\('input'.*renderSuggestions\(helpGuideModule\)/s);
  assert.match(source, /selectSuggestions\(\{[\s\S]*?started: suggestionStarted, count: 4/);
  assert.match(css, /\.thread-suggestions \{[\s\S]*?flex-wrap: nowrap;/);
  assert.match(css, /\.thread-suggestions \.try-chip \{[\s\S]*?min-width: 0;[\s\S]*?white-space: nowrap;/);
  assert.match(css, /\.hardware-fallback \{ gap:6px; \}/);
  assert.ok(source.indexOf('pendingHardware >= 4') < source.indexOf('markSuggestionOperationStarted()'));
  assert.doesNotMatch(source, /\}, 6000\)/, 'suggestions do not move under the pointer');
});

test('example insertion preserves a draft and replaces only its selection', () => {
  assert.deepEqual(insertExample('23 + ', 'xnor(5, 3)'), {value:'23 + xnor(5, 3)',cursor:15});
  assert.deepEqual(insertExample('23 + 19', '7',5,7), {value:'23 + 7',cursor:6});
  assert.equal(insertExample('abc', '/help',0,0).value,'/help abc');
});

test('reload preserves results and never replays interrupted hardware work', () => {
  const vm = require('node:vm');
  const storage = new Map();
  const context = vm.createContext({module:{exports:{}},sessionStorage:{
    setItem:(k,v)=>storage.set(k,v), getItem:k=>storage.get(k),
  }});
  vm.runInContext(readFileSync(join(__dirname,'chat.js'),'utf8'),context);
  const result = vm.runInContext(`
    state.profile={id:'test'};
    localJobs.push(
      {id:'done',body:'23+19',phase:'succeeded',replies:['42']},
      {id:'physical',body:'7+8',phase:'executing',via:'hardware',backendId:'durable-id'},
      {id:'virtual',body:'9+1',phase:'queued',via:'virtual'}
    );
    saveJobHistory(); loadJobHistory();
    JSON.stringify(localJobs);
  `,context);
  const jobs=JSON.parse(result);
  assert.equal(jobs[0].replies[0],'42');
  assert.equal(jobs[1].phase,'unknown');
  assert.equal(jobs[1].backendId,'durable-id');
  assert.equal(jobs[2].phase,'failed');
  assert.equal(jobs[2].outcome.technical,'VIRTUAL_INTERRUPTED');
});

test('lost hardware polling becomes unknown without virtual replay', async () => {
  const vm = require('node:vm');
  const views = await import('./job-view.mjs');
  const context = vm.createContext({module:{exports:{}},setTimeout:fn=>fn(),views});
  vm.runInContext(readFileSync(join(__dirname,'chat.js'),'utf8'),context);
  await vm.runInContext(`
    jobViewsModule=views;
    state.tomatoOnline=true;
    renderThread=()=>{};
    let readAttempts=0;
    request=async path=>{
      if(path===COMPUTE_API.enqueue)return {id:'durable-id'};
      readAttempts++;
      throw Error('Connection lost');
    };
    runVirtual=()=>{throw Error('Unsafe replay');};
    var testJob={id:'job',body:'1+2',conversation:'conversation',hex:'01',phase:'compiling'};
    runHardware(testJob);
  `,context);
  assert.equal(vm.runInContext('testJob.phase',context),'unknown');
  assert.equal(vm.runInContext('testJob.backendId',context),'durable-id');
  assert.equal(vm.runInContext('readAttempts',context),3);
});
