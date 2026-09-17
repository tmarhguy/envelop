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
  const compiling = statusView({id: 'job-1', phase: PHASES.COMPILING});
  assert.deepEqual(
    {phase: compiling.phase, voice: compiling.voice, pending: compiling.pending, technical: compiling.technical},
    {phase: 'compiling', voice: 'envelop', pending: true, technical: 'COMPILING'},
  );

  const queued = statusView({id: 'job-1', phase: PHASES.QUEUED, via: 'hardware'});
  assert.equal(queued.voice, 'envelop');
  assert.equal(queued.technical, 'QUEUED · HARDWARE');

  const executing = statusView({id: 'job-1', phase: PHASES.EXECUTING, via: 'virtual'});
  assert.equal(executing.voice, 'envelop');
  assert.equal(executing.title, 'Running in Virtual Tomato');
  assert.equal(executing.text, null);
  assert.equal(executing.technical, 'EXECUTING · VIRTUAL');

  const succeeded = statusView({id: 'job-1', phase: PHASES.SUCCEEDED, compute: true, target: 'Virtual Tomato · browser CPU emulator'});
  assert.equal(succeeded.resultFirst, true);
  assert.equal(succeeded.title, 'Result ready');
  assert.equal(succeeded.text, null);
  assert.equal(succeeded.technical, 'Virtual Tomato · browser CPU emulator');

  const reply = statusView({
    id: 'greet-1',
    phase: PHASES.SUCCEEDED,
    compute: false,
    via: 'virtual',
    target: 'Virtual Tomato · deterministic greeting rule',
    replies: ['Hello, Ada! I\'m Virtual Tomato.'],
  });
  assert.equal(reply.title, null);
  assert.equal(reply.text, null);
  assert.equal(reply.technical, 'Virtual Tomato · deterministic greeting rule');

  const unknown = statusView({phase: PHASES.UNKNOWN});
  assert.equal(unknown.voice, 'envelop');
  assert.match(unknown.technical, /REPLAY_BLOCKED/);
});

test('phase copy is stable per job and changes its selection key by phase', () => {
  const first = statusView({id: 'stable-job', phase: PHASES.EXECUTING, via: 'virtual'});
  assert.deepEqual(statusView({id: 'stable-job', phase: PHASES.EXECUTING, via: 'virtual'}), first);
  assert.notEqual(statusView({id: 'other-job', phase: PHASES.EXECUTING, via: 'virtual'}).text, undefined);
  assert.equal(first.technical, 'EXECUTING · VIRTUAL');
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
  assert.ok(outcome.text.length > 0);
  assert.equal(outcome.technical, 'UNKNOWN_TOKEN · squared');
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

test('partial-expression outcomes expose only recovered syntax', () => {
  const outcome = compileOutcome({
    code: 'MALFORMED_EXPRESSION',
    details: {recoveredOperands: ['23'], recoveredOperators: ['+']},
  }, '23 +');
  assert.equal(outcome.voice, 'envelop');
  assert.equal(outcome.guidance, 'Recovered so far: 23 +.');
});
