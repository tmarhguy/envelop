import test from 'node:test';
import assert from 'node:assert/strict';
import {isCalculationBearing, localAnswerFor, recognizeTomatoIntent} from './intents.mjs';
import {CARDS, PROGRAM_IDS} from './knowledge.mjs';

test('source-backed questions map to deterministic local cards', () => {
  const cases = new Map([
    ['What can Tomato do?', 'capability'],
    ['Which operators are supported?', 'operators'],
    ['Who built Tomato?', 'tyrone'],
    ['Who is Tyrone Marhguy?', 'tyrone'],
    ['Who is Tyrone?', 'tyrone'],
    ['What other projects has Tyrone built?', 'tyroneProjects'],
    ['What has Tyrone contributed to open source?', 'openSource'],
    ['What is Tyrone’s UDP stack?', 'udpStack'],
    ['What is Envelop?', 'envelop'],
    ['What is FramePort?', 'frameport'],
    ['How can I try it?', 'tryTomato'],
    ['Can I buy Tomato?', 'distribution'],
    ['Where is the source?', 'sources'],
    ['How can I learn more?', 'learning'],
    ['Is Tomato an FPGA?', 'hardware'],
    ['Where is Tomato?', 'location'],
    ['Tell me about Tomato architecture', 'architecture'],
    ['How is a Tomato instruction laid out?', 'instructionWord'],
    ['Why did Tomato use a Dual-LUT ALU?', 'alu'],
    ['Why are there 524,288 ALU configurations?', 'aluSettings'],
    ['Why does Tomato have 256 registers?', 'registers'],
    ['What operating system does Tomato run?', 'os'],
    ['How many registers can I use here?', 'sandboxRegisters'],
    ['How are integers represented?', 'numbers'],
    ['How do negative numbers work?', 'negative'],
    ['Does Envelop support modulo percent?', 'modulo'],
    ['What are masks and composed operations?', 'masks'],
    ['Can I see Tomato’s screen?', 'screen'],
    ['Does Envelop use AI?', 'deterministic'],
    ['What programs are on Tomato?', 'programs'],
  ]);
  for (const [input, id] of cases) {
    const card = localAnswerFor(input);
    assert.equal(card.id, id, input);
    assert.match(card.provenance.href, /^(?:https:\/\/|\.{1,2}\/)/);
    assert.ok(card.actions.length >= 2 && card.actions.length <= 4);
    assert.deepEqual(localAnswerFor(input), card);
    assert.ok(Object.isFrozen(card));
  }
});

test('intent recognition fails closed around calculations and ordinary chat', () => {
  for (const input of ['What is 5 + 4?', 'xor(5, 3)', '/calc 2 + 2', '/run; R0=1; RETURN R0']) {
    assert.equal(isCalculationBearing(input), true, input);
    assert.equal(localAnswerFor(input), null, input);
  }
  for (const input of ['hello', 'send this to my friend', 'I like tomatoes']) {
    assert.equal(recognizeTomatoIntent(input), null, input);
  }
  assert.equal(recognizeTomatoIntent('Is Tomato 32 bit and real hardware?'), 'hardware');
});

test('unsupported Tomato facts receive a qualified clarification', () => {
  const answer = localAnswerFor('What color is Tomato’s desk?');
  assert.equal(answer.id, 'clarification');
  assert.match(answer.answer, /source-backed/);
});

test('register answers distinguish full hardware from sandbox state', () => {
  const answer = localAnswerFor('How many registers does Tomato have?');
  assert.match(answer.answer, /256 × 32-bit/);
  assert.match(answer.answer, /R0 through R7/);
  assert.equal(localAnswerFor('How many registers can I use here?').id, 'sandboxRegisters');
});

test('all fourteen Tomato OS entries have deterministic cards', () => {
  assert.equal(PROGRAM_IDS.length, 14);
  for (const id of PROGRAM_IDS) {
    const card = CARDS[`program-${id}`];
    assert.ok(card, id);
    assert.match(card.answer, /cannot launch/i);
    assert.ok(card.actions.some(action => action.href?.includes('virtual.html')));
  }
  assert.equal(localAnswerFor('Open Snake').id, 'program-snake');
  assert.equal(localAnswerFor('How does Sudoku work?').id, 'program-sudoku');
});

test('every curated action is safe and reaches a tested route', () => {
  const allowedHosts = new Set(['tmarhguy.com', 'tomato.tmarhguy.com', 'github.com', 'en.wikipedia.org']);
  for (const [id, card] of Object.entries(CARDS)) {
    for (const action of card.actions) {
      assert.ok(['ask', 'compute', 'link'].includes(action.type), `${id}: ${action.type}`);
      assert.ok(action.label && action.label.length <= 48, id);
      if (action.type === 'ask') {
        assert.ok(localAnswerFor(action.value), `${id}: ${action.value}`);
      } else if (action.type === 'compute') {
        assert.equal(isCalculationBearing(action.value), true, `${id}: ${action.value}`);
      } else {
        const url = new URL(action.href, 'https://tmarhguy.github.io/envelop/chat/');
        assert.equal(url.protocol, 'https:', id);
        assert.ok(url.origin === 'https://tmarhguy.github.io' || allowedHosts.has(url.hostname), `${id}: ${url}`);
      }
    }
  }
});

test('knowledge catalog excludes sensitive and black-box claims', () => {
  const catalog = JSON.stringify(CARDS);
  assert.doesNotMatch(catalog, /\+1 \(\d{3}\)|2003-11-24|triplet|rastafarian|currentCity|phone/i);
  assert.doesNotMatch(catalog, /\b(?:employer|internship|fluid silicon|aragorn ai|vero electric)\b/i);
  assert.doesNotMatch(catalog, /\bi remember\b|\bi feel\b|\bi understand exactly\b/i);
  assert.match(CARDS.deterministic.answer, /runs without AI/i);
  assert.match(CARDS.availability.answer, /cannot prove Tomato is online now/i);
});

test('unknown people and social dead ends stay deterministic', () => {
  assert.equal(localAnswerFor('Who is Ada Lovelace?').id, 'unknownPerson');
  assert.equal(localAnswerFor('Thank you!').id, 'thanks');
  assert.equal(localAnswerFor('This is awesome').id, 'praise');
  assert.equal(localAnswerFor('This is not helpful').id, 'frustration');
  assert.equal(localAnswerFor('Goodbye').id, 'goodbye');
});
