import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASES,
  compileOutcome,
  normalizePhase,
  personalityOutcome,
  statusView,
  technicalLine,
} from './job-view.mjs';

test('operation phases map to compact view models', () => {
  const compiling = statusView({phase: PHASES.COMPILING});
  assert.deepEqual(
    {phase: compiling.phase, voice: compiling.voice, pending: compiling.pending, technical: compiling.technical},
    {phase: 'compiling', voice: 'envelop', pending: true, technical: 'COMPILING'},
  );

  const queued = statusView({phase: PHASES.QUEUED, via: 'hardware'});
  assert.equal(queued.voice, 'envelop');
  assert.equal(queued.technical, 'QUEUED · PHYSICAL');

  const executing = statusView({phase: PHASES.EXECUTING, via: 'virtual'});
  assert.equal(executing.voice, 'envelop');
  assert.match(executing.text, /Virtual Tomato is executing/);

  const succeeded = statusView({phase: PHASES.SUCCEEDED, target: 'Virtual Tomato · browser CPU emulator'});
  assert.equal(succeeded.resultFirst, true);
  assert.equal(succeeded.text, null);
  assert.equal(succeeded.technical, 'Virtual Tomato · browser CPU emulator');

  const unknown = statusView({phase: PHASES.UNKNOWN});
  assert.equal(unknown.voice, 'envelop');
  assert.match(unknown.technical, /REPLAY_BLOCKED/);
});

test('legacy statuses normalize without changing durable resolution semantics', () => {
  assert.equal(normalizePhase({status: 'offer'}), PHASES.QUEUED);
  assert.equal(normalizePhase({status: 'running'}), PHASES.EXECUTING);
  assert.equal(normalizePhase({status: 'done'}), PHASES.SUCCEEDED);
  assert.equal(normalizePhase({status: 'error'}), PHASES.FAILED);
  assert.equal(normalizePhase({}), PHASES.UNKNOWN);
});

test('unknown words use a friendly local Envelop response', () => {
  const error = {
    code: 'UNKNOWN_TOKEN',
    message: "Unknown word 'squared'.",
    details: {token: 'squared', guidance: 'Try a supported operator or /help.'},
  };
  const outcome = compileOutcome(error, '/calc 2 squared');
  assert.equal(outcome.voice, 'envelop');
  assert.equal(outcome.event, 'UNKNOWN_TOKEN');
  assert.equal(outcome.text, 'I can’t help with “squared” yet.');
  assert.equal(outcome.technical, null);
  assert.equal(outcome.guidance, 'Try a supported operator or /help.');
  assert.deepEqual(compileOutcome(error, '/calc 2 squared'), outcome);
  assert.equal(compileOutcome(new Error('network'), 'same key'), null);
});

test('machine failures use Tomato only after execution', () => {
  const fault = personalityOutcome('EXECUTION_FAULT', 'job-42', {statusByte: 7});
  assert.equal(fault.voice, 'tomato');
  assert.equal(fault.technical, 'EXECUTION_FAULT · 7');
  assert.equal(statusView({phase: PHASES.FAILED, outcome: fault}).voice, 'tomato');

  assert.equal(technicalLine('INVALID_REGISTER', {register: 'R8'}), 'INVALID_REGISTER · R8');
});
