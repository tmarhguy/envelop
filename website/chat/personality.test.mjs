import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENTS,
  TONES,
  TONE_BANDS,
  VOICES,
  phraseCatalogs,
  selectPersonality,
  toneForRoll,
  voiceForEvent,
} from './personality.mjs';

const eventValues = Object.values(EVENTS);
const toneValues = Object.values(TONES);

test('tone bands are exactly 70/20/8/2', () => {
  assert.deepEqual(TONE_BANDS.map(({tone, weight}) => [tone, weight]), [
    [TONES.DIRECT, 70],
    [TONES.LIGHTLY_PLAYFUL, 20],
    [TONES.HARDWARE_SPECIFIC, 8],
    [TONES.MEMORABLE, 2],
  ]);

  const counts = Object.fromEntries(toneValues.map(tone => [tone, 0]));
  for (let roll = 0; roll < 100; roll++) counts[toneForRoll(roll)]++;
  assert.deepEqual(counts, {
    [TONES.DIRECT]: 70,
    [TONES.LIGHTLY_PLAYFUL]: 20,
    [TONES.HARDWARE_SPECIFIC]: 8,
    [TONES.MEMORABLE]: 2,
  });
});

test('every supported event has curated variants in every tone', () => {
  const catalogEvents = Object.values(VOICES).flatMap(voice => Object.keys(phraseCatalogs[voice]));
  assert.deepEqual(new Set(catalogEvents), new Set(eventValues));
  assert.equal(catalogEvents.length, eventValues.length);

  for (const event of eventValues) {
    const voice = voiceForEvent(event);
    for (const tone of toneValues) {
      const variants = phraseCatalogs[voice][event][tone];
      assert.ok(Array.isArray(variants), `${voice}.${event}.${tone}`);
      assert.ok(variants.length >= 3, `${voice}.${event}.${tone} needs at least three variants`);
      assert.equal(new Set(variants).size, variants.length, `${voice}.${event}.${tone} repeats a variant`);
    }
  }
});

test('selection is stable for an event and key but varies across keys', () => {
  for (const event of eventValues) {
    const first = selectPersonality({event, key: `job:${event}:42`});
    assert.deepEqual(selectPersonality({event, key: `job:${event}:42`}), first);
    assert.equal(first.voice, voiceForEvent(event));
    assert.ok(toneValues.includes(first.tone));
    assert.ok(phraseCatalogs[first.voice][event][first.tone].includes(first.text));

    const selections = new Set(
      Array.from({length: 300}, (_, index) => selectPersonality({event, key: `input:${index}`}).text),
    );
    assert.ok(selections.size >= 6, `${event} should vary across stable keys`);
  }
});

test('voice ownership prevents untruthful attribution', () => {
  for (const event of [
    EVENTS.UNKNOWN_TOKEN,
    EVENTS.MALFORMED_EXPRESSION,
    EVENTS.UNSUPPORTED_OPERATION,
    EVENTS.INVALID_REGISTER,
    EVENTS.OUT_OF_RANGE,
    EVENTS.INVALID_INSTRUCTION,
    EVENTS.HARDWARE_OFFLINE,
    EVENTS.HARDWARE_RESTORED,
    EVENTS.INTERPRETING,
    EVENTS.EXPRESSION_READY,
    EVENTS.SENDING_TO_HARDWARE,
    EVENTS.PHYSICAL_EXECUTION,
    EVENTS.VIRTUAL_EXECUTION,
    EVENTS.RESULT_RETURNED,
  ]) {
    assert.equal(voiceForEvent(event), VOICES.ENVELOP);
  }
  for (const event of [
    EVENTS.UNANSWERED_REQUEST,
    EVENTS.BUSY,
    EVENTS.TIMEOUT,
    EVENTS.EXECUTION_FAULT,
  ]) {
    assert.equal(voiceForEvent(event), VOICES.TOMATO);
  }

  assert.throws(
    () => selectPersonality({event: EVENTS.UNKNOWN_TOKEN, key: 'squared', voice: VOICES.TOMATO}),
    /belongs to the envelop voice/,
  );
  assert.throws(() => selectPersonality({event: 'DIVIDE_BY_ZERO', key: '1/0'}), /Unknown personality event/);
  assert.throws(() => selectPersonality({event: EVENTS.BUSY}), /stable event, input, or job key/);
});

test('catalogs contain no emoji or unreachable machine personalities', () => {
  const text = JSON.stringify(phraseCatalogs);
  assert.doesNotMatch(text, /\p{Extended_Pictographic}/u);
  assert.doesNotMatch(text, /divide[- ]by[- ]zero|raw lut|overflow/i);
  assert.doesNotMatch(text, /Try \/help\. I run bounded integer jobs\./i);
});
