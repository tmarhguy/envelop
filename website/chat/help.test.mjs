import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HELP_GUIDE,
  LEGACY_UNANSWERED_REPLY,
  isHelpRequest,
  isLegacyUnansweredReply,
  legacyUnansweredDetails,
} from './help.mjs';

test('help aliases are explicit and do not swallow ordinary conversation', () => {
  for (const input of ['/help', '/HELP!', 'help', 'Help?', 'what can you do', 'What can you do?']) {
    assert.equal(isHelpRequest(input), true, input);
  }
  for (const input of ['help me add 2 and 3', '/helper', 'what can you do with 5 + 4', 'hello']) {
    assert.equal(isHelpRequest(input), false, input);
  }
});

test('help guide covers the installed browser compute contract', () => {
  const titles = HELP_GUIDE.groups.map(group => group.title);
  assert.deepEqual(titles, [
    'Chat',
    'Controlled compute',
    'Raw Tomato program',
    'Limits',
    'Where it runs',
  ]);

  const text = JSON.stringify(HELP_GUIDE);
  for (const required of [
    '/help', '/run', '34 * 3', '345 / 345', 'quotient up to 13',
    'R0–R7', '32 instructions maximum', '0–255',
    'ADD', 'SUB', 'AND', 'OR', 'XOR', 'RETURN',
    'Physical Tomato', 'Virtual Tomato',
  ]) {
    assert.match(text, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.equal(Object.isFrozen(HELP_GUIDE), true);
  assert.equal(Object.isFrozen(HELP_GUIDE.groups), true);
  assert.doesNotMatch(text, /\p{Extended_Pictographic}/u);
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
