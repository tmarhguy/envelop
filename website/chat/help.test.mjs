import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HELP_GUIDE,
  LEGACY_UNANSWERED_REPLY,
  SUGGESTION_CATALOG,
  isHelpRequest,
  isLegacyUnansweredReply,
  legacyUnansweredDetails,
  selectSuggestions,
} from './help.mjs';
import {compile} from './virtual/compiler.mjs';

test('help aliases are explicit and do not swallow ordinary conversation', () => {
  for (const input of [
    'what cannnnnn u do', '/help', '/HELP!', 'help', 'Help?', 'what can you do', 'What can you do?',
    'Hmm, what else can you do?', 'I mean, what more can you do?',
    'I mean, can u do and more?',
    'If there is and and or and nor in one sentence what happens?',
    'What else can. +=^]^{*',
  ]) {
    assert.equal(isHelpRequest(input), true, input);
  }
  for (const input of [
    'help me add 2 and 3', '/helper', 'what can you do with 5 + 4',
    'send and or to my classmate', 'hello',
  ]) {
    assert.equal(isHelpRequest(input), false, input);
  }
});

test('help guide covers the installed browser compute contract', () => {
  const titles = HELP_GUIDE.groups.map(group => group.title);
  assert.deepEqual(titles, [
    'Arithmetic',
    'Logic',
    'Composed logic',
    'Precedence',
    '32-bit experiments',
    'Malformed-input experiments',
    'Raw programs',
    'Questions about Tomato',
    'Tomato OS and programs',
    'Numbers and boundaries',
    'People, provenance, and source',
  ]);

  const text = JSON.stringify(HELP_GUIDE);
  for (const required of [
    '/run', '34 * 3', '345 / 345', 'xorand', '4294967295 + 1',
    'R0=23', 'ADD', 'XOR', 'RETURN', 'Is Tomato real hardware?',
    'What programs are on Tomato?', 'How are integers represented?',
    'Who is Tyrone Marhguy?', 'Does Envelop use AI?',
  ]) {
    assert.match(text, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.equal(Object.isFrozen(HELP_GUIDE), true);
  assert.equal(Object.isFrozen(HELP_GUIDE.groups), true);
  assert.doesNotMatch(text, /\p{Extended_Pictographic}/u);
});

test('every help example is a directly runnable prompt', () => {
  for (const group of HELP_GUIDE.groups) {
    for (const option of group.options) {
      assert.equal(typeof option.prompt, 'string');
      assert.ok(option.prompt.length > 0);
    }
  }
});

test('in-chat suggestions always include help and vary deterministically with input', () => {
  const first = selectSuggestions({session: 'abc', day: '2026-09-17', input: 'x', round: 0, count: 4});
  assert.deepEqual(selectSuggestions({session: 'abc', day: '2026-09-17', input: 'x', round: 0, count: 4}), first);
  assert.equal(first[0].label, 'Help');
  assert.equal(first[0].prompt, '/help');
  assert.equal(first[1].label, 'Hello');
  assert.equal(first[1].prompt, 'Hello Tomato');
  assert.equal(first.length, 4);
  const afterOperation = selectSuggestions({session: 'abc', day: '2026-09-17', input: '', round: 1, started: true, count: 4});
  assert.equal(afterOperation.some(item => item.label === 'Hello'), false);
  assert.equal(afterOperation[0].label, 'Help');
  assert.equal(afterOperation.length, 4);
  assert.notDeepEqual(
    selectSuggestions({session: 'abc', day: '2026-09-17', input: 'xy', round: 1, count: 4}),
    first,
  );
  assert.equal(new Set(SUGGESTION_CATALOG.map(item => item.category)).size, SUGGESTION_CATALOG.length);
  for (const suggestion of SUGGESTION_CATALOG.slice(2)) {
    assert.doesNotThrow(() => compile(suggestion.prompt), suggestion.label);
  }
});

test('only the legacy firmware dead end is recognized as unanswered', () => {
  assert.equal(isLegacyUnansweredReply(LEGACY_UNANSWERED_REPLY), true);
  assert.equal(isLegacyUnansweredReply('  try /HELP.   I run bounded integer jobs.  '), true);
  assert.equal(isLegacyUnansweredReply('Try /help for a list of options.'), false);
  assert.equal(isLegacyUnansweredReply('12 / 0x0000000C'), false);

  const details = legacyUnansweredDetails(LEGACY_UNANSWERED_REPLY);
  assert.deepEqual(details, {
    event: 'UNANSWERED_REQUEST',
    rawReply: LEGACY_UNANSWERED_REPLY,
  });
  assert.equal(Object.isFrozen(details), true);
  assert.equal(legacyUnansweredDetails('A normal Tomato reply.'), null);
});
