import assert from 'node:assert/strict';
import test from 'node:test';
import {
  conversationReply,
  executionMode,
  guidanceFor,
  modeDescription,
  presentation,
} from './experience.mjs';

test('conversation rules stay local and deterministic', () => {
  assert.match(conversationReply("what's up?"), /Ready to explore/);
  assert.match(conversationReply("what's good"), /Ready to explore/);
  assert.match(conversationReply('okay'), /Whenever you're ready/);
  assert.match(conversationReply('what is happening'), /Start with 23 \+ 19/);
  assert.match(conversationReply("I'm confused"), /Start with 23 \+ 19/);
  assert.equal(conversationReply('23 + 19'), null);
  assert.equal(conversationReply('tell me a joke'), null);
});

test('mode copy distinguishes virtual from durable physical queueing', () => {
  assert.equal(executionMode('physical'), 'physical');
  assert.equal(executionMode('anything-else'), 'virtual');
  assert.match(modeDescription('virtual', false), /browser/);
  assert.match(modeDescription('physical', true), /physical computer/);
  assert.match(modeDescription('physical', false), /wait for Tomato/);
});

test('unanswered requests present friendly guidance tone', () => {
  const guide = guidanceFor('UNANSWERED_REQUEST');
  assert.equal(guide.title, 'Let’s try a different way');
  const view = presentation(
    {phase: 'failed', compute: false, via: 'local'},
    {phase: 'failed', event: 'UNANSWERED_REQUEST', voice: 'envelop', text: 'fallback', technical: 'UNANSWERED_REQUEST'},
  );
  assert.equal(view.tone, 'guidance');
  assert.equal(view.title, guide.title);
  assert.equal(view.text, guide.text);
  assert.equal(view.pending, false);
});

test('queued hardware jobs keep waiting tone while offline', () => {
  const view = presentation(
    {phase: 'queued', via: 'hardware', backendId: 'job-1', compute: true},
    {phase: 'queued', voice: 'envelop', text: 'queued', technical: 'QUEUED · HARDWARE', pending: true},
  );
  assert.equal(view.tone, 'waiting');
  assert.match(view.title, /Saved for physical Tomato/);
  assert.match(view.text, /safely queued/);
});

test('success and in-flight copy stay stable instead of rotating phrases', () => {
  const compute = presentation(
    {phase: 'succeeded', compute: true, via: 'virtual'},
    {phase: 'succeeded', voice: 'envelop', text: 'The reply envelope contains the return value.', technical: 'Virtual Tomato · browser CPU emulator'},
  );
  assert.equal(compute.title, 'Result ready');
  assert.equal(compute.text, null);

  const reply = presentation(
    {phase: 'succeeded', compute: false, via: 'virtual', replies: ['Hello']},
    {phase: 'succeeded', voice: 'envelop', text: 'Reply ready.', technical: 'Virtual Tomato · deterministic greeting rule'},
  );
  assert.equal(reply.title, null);
  assert.equal(reply.text, null);

  const running = presentation(
    {phase: 'executing', compute: true, via: 'virtual'},
    {phase: 'executing', voice: 'envelop', text: 'The browser machine is at work.', technical: 'EXECUTING · VIRTUAL', pending: true},
  );
  assert.equal(running.title, 'Running in Virtual Tomato');
  assert.equal(running.text, null);
});
