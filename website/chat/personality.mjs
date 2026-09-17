// Deterministic, web-only wording for Envelop and Tomato status messages.
// Keep selection pure so polling and rerendering cannot change a phrase.

export const VOICES = Object.freeze({
  ENVELOP: 'envelop',
  TOMATO: 'tomato',
});

export const EVENTS = Object.freeze({
  UNKNOWN_TOKEN: 'UNKNOWN_TOKEN',
  UNANSWERED_REQUEST: 'UNANSWERED_REQUEST',
  MALFORMED_EXPRESSION: 'MALFORMED_EXPRESSION',
  UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
  INVALID_REGISTER: 'INVALID_REGISTER',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  INVALID_INSTRUCTION: 'INVALID_INSTRUCTION',
  HARDWARE_OFFLINE: 'HARDWARE_OFFLINE',
  HARDWARE_RESTORED: 'HARDWARE_RESTORED',
  BUSY: 'BUSY',
  TIMEOUT: 'TIMEOUT',
  EXECUTION_FAULT: 'EXECUTION_FAULT',
});

export const TONES = Object.freeze({
  DIRECT: 'direct',
  LIGHTLY_PLAYFUL: 'lightly_playful',
  HARDWARE_SPECIFIC: 'hardware_specific',
  MEMORABLE: 'memorable',
});

// Inclusive lower bounds make the 100 possible rolls exactly 60/25/10/5.
export const TONE_BANDS = Object.freeze([
  Object.freeze({tone: TONES.DIRECT, start: 0, end: 59, weight: 60}),
  Object.freeze({tone: TONES.LIGHTLY_PLAYFUL, start: 60, end: 84, weight: 25}),
  Object.freeze({tone: TONES.HARDWARE_SPECIFIC, start: 85, end: 94, weight: 10}),
  Object.freeze({tone: TONES.MEMORABLE, start: 95, end: 99, weight: 5}),
]);

const e = EVENTS;
const t = TONES;

const rawCatalogs = {
  [VOICES.ENVELOP]: {
    [e.UNKNOWN_TOKEN]: {
      [t.DIRECT]: ['I do not know that word yet.', 'That word is outside what I understand.', 'I cannot use that word in this calculation.'],
      [t.LIGHTLY_PLAYFUL]: ['That word is not in my vocabulary yet.', 'I followed the calculation until that word.', 'That word and I have not been introduced.'],
      [t.HARDWARE_SPECIFIC]: ['No supported operation matches that word.', 'That word is outside the current compute language.', 'The calculation stopped at an unsupported term.'],
      [t.MEMORABLE]: ['A calculation can only use words with defined meaning.', 'That word has no place in the expression yet.', 'I know the path around that word, but not through it.'],
    },
    [e.MALFORMED_EXPRESSION]: {
      [t.DIRECT]: ['I think an operand went missing.', 'That expression seems unfinished.', 'That does not quite form a complete computation.'],
      [t.LIGHTLY_PLAYFUL]: ['The arithmetic is almost there. Almost.', 'There is a loose operator in there.', 'I can see what you started writing. I cannot see how it ends.'],
      [t.HARDWARE_SPECIFIC]: ['Parsing stopped before an instruction sequence was produced.', 'The parser could not build a complete expression tree.', 'No bytecode was emitted for this expression.'],
      [t.MEMORABLE]: ['A calculation needs a path from first token to last.', 'The expression arrived with a gap in its logic.', 'I cannot wire an unfinished expression into a program.'],
    },
    [e.UNSUPPORTED_OPERATION]: {
      [t.DIRECT]: ['I understand what you mean. Tomato cannot do that yet.', 'Perfectly sensible request. Not presently a Tomato operation.', 'Understood. Unsupported.'],
      [t.LIGHTLY_PLAYFUL]: ['Translation succeeded. Execution will not.', 'I know exactly what you are asking for. I simply cannot compile it.', 'That operation is not on Tomato’s current menu.'],
      [t.HARDWARE_SPECIFIC]: ['The current bytecode ABI has no instruction for that operation.', 'No installed opcode matches that operation.', 'Compilation stopped because the operation is absent from the ISA subset.'],
      [t.MEMORABLE]: ['A clear request still needs a real instruction behind it.', 'That operation has no path through the current machine.', 'I will not invent an instruction Tomato does not have.'],
    },
    [e.INVALID_REGISTER]: {
      [t.DIRECT]: ['That register is not available.', 'Use one of Tomato’s valid registers.', 'I cannot compile that register reference.'],
      [t.LIGHTLY_PLAYFUL]: ['That register wandered past the end of the register file.', 'Tomato has fewer register seats than that.', 'That register name is one slot too adventurous.'],
      [t.HARDWARE_SPECIFIC]: ['The compute ABI exposes registers R0 through R7.', 'Register encoding is limited to the eight ABI registers.', 'The register operand cannot be encoded in this program.'],
      [t.MEMORABLE]: ['A register that cannot be addressed cannot hold the answer.', 'That register exists beyond this program’s map.', 'The register file has a firm edge.'],
    },
    [e.OUT_OF_RANGE]: {
      [t.DIRECT]: ['That value is outside the allowed range.', 'The requested value cannot be encoded here.', 'Use a value within the supported range.'],
      [t.LIGHTLY_PLAYFUL]: ['That number does not fit in the available space.', 'The value overshot its field.', 'That number needs to come back inside the boundary.'],
      [t.HARDWARE_SPECIFIC]: ['The value exceeds the field width in the compute ABI.', 'Encoding stopped at a bounded numeric field.', 'The operand cannot be represented by the target instruction format.'],
      [t.MEMORABLE]: ['Every machine value needs somewhere finite to land.', 'That value crossed the line the encoding can represent.', 'The number is valid in theory, but not in this field.'],
    },
    [e.INVALID_INSTRUCTION]: {
      [t.DIRECT]: ['That is not valid Tomato syntax.', 'I cannot assemble that line.', 'Something is wrong with that instruction.'],
      [t.LIGHTLY_PLAYFUL]: ['Tomato code, yes. Valid Tomato code, no.', 'That almost looks like an instruction.', 'I know what you were going for. The syntax disagrees.'],
      [t.HARDWARE_SPECIFIC]: ['The assembler rejected the instruction before submission.', 'No valid ABI encoding was produced for that instruction.', 'Instruction validation failed before Tomato execution.'],
      [t.MEMORABLE]: ['Assembly is exact: one invalid line stops the program.', 'I will not send Tomato a program I cannot encode.', 'That instruction never became machine code.'],
    },
    [e.HARDWARE_OFFLINE]: {
      [t.DIRECT]: ['The physical machine is offline.', 'I cannot reach the physical machine right now.', 'No answer from the hardware.'],
      [t.LIGHTLY_PLAYFUL]: ['Tomato appears to be asleep.', 'The hardware has gone quiet.', 'The machine seems to be taking the afternoon off.'],
      [t.HARDWARE_SPECIFIC]: ['The physical Tomato bridge is disconnected.', 'No active hardware route is available.', 'The device transport is not connected.'],
      [t.MEMORABLE]: ['The route ends here until Tomato reconnects.', 'A silent wire cannot carry this job.', 'Tomato is beyond the network horizon for now.'],
    },
    [e.HARDWARE_RESTORED]: {
      [t.DIRECT]: ['Tomato is back.', 'The hardware answered.', 'Contact restored.'],
      [t.LIGHTLY_PLAYFUL]: ['There you are.', 'Found it.', 'We have the machine back.'],
      [t.HARDWARE_SPECIFIC]: ['The physical Tomato bridge has reconnected.', 'The device transport is connected again.', 'An active hardware route is available again.'],
      [t.MEMORABLE]: ['The wire is speaking again.', 'The route has found Tomato again.', 'Tomato has returned to the network map.'],
    },
  },
  [VOICES.TOMATO]: {
    [e.UNANSWERED_REQUEST]: {
      [t.DIRECT]: [
        'I do not know how to answer that.',
        'That is not a request I can answer.',
        'I cannot do anything useful with that request.',
        'I am a computer. You will have to be more specific.',
      ],
      [t.LIGHTLY_PLAYFUL]: [
        'Never heard of that one before.',
        'That made sense right up until the part that did not.',
        'Interesting question. Wrong computer.',
        'You may want the OG chat for that one.',
      ],
      [t.HARDWARE_SPECIFIC]: [
        'There is no opcode for that.',
        'That request has no path through my datapath.',
        'The instruction ROM has nothing to say about that.',
        'That one never reached my ALU.',
      ],
      [t.MEMORABLE]: [
        'I have an ALU, not a worldview.',
        'The instruction ROM is silent on this matter.',
        'I know exactly enough to know that I do not know what you meant.',
        'No amount of truth-table flexibility is saving that request.',
      ],
    },
    [e.BUSY]: {
      [t.DIRECT]: ['One computation at a time.', 'I am still working on the last one.', 'The datapath is occupied.'],
      [t.LIGHTLY_PLAYFUL]: ['Hold that thought.', 'Please form an orderly queue.', 'There is already something moving through the machine.'],
      [t.HARDWARE_SPECIFIC]: ['The executor returned a busy status.', 'The compute slot is occupied by another job.', 'Execution did not start because the device is busy.'],
      [t.MEMORABLE]: ['Even fast instructions must wait for an open machine.', 'The silicon is occupied; this job stays at the door.', 'One machine, one running program, one short wait.'],
    },
    [e.TIMEOUT]: {
      [t.DIRECT]: ['That took longer than it should have.', 'No result came back.', 'Execution took too long.'],
      [t.LIGHTLY_PLAYFUL]: ['That computation appears to have wandered off.', 'I waited. Nothing returned.', 'That job did not make it home.'],
      [t.HARDWARE_SPECIFIC]: ['Execution exceeded the job time limit.', 'The running program did not return before its deadline.', 'The executor stopped waiting for a return value.'],
      [t.MEMORABLE]: ['A program that never returns cannot deliver an answer.', 'The clock finished its work before the program did.', 'The answer remained beyond the execution deadline.'],
    },
    [e.EXECUTION_FAULT]: {
      [t.DIRECT]: ['Something went wrong during execution.', 'That job did not complete.', 'Execution halted before a result was produced.'],
      [t.LIGHTLY_PLAYFUL]: ['The datapath and that program have had a disagreement.', 'Something in that program disagreed with the machine.', 'The program and I reached a hard stop.'],
      [t.HARDWARE_SPECIFIC]: ['The executor returned a nonzero fault status.', 'The running program ended without a valid result.', 'Machine execution stopped on a fault condition.'],
      [t.MEMORABLE]: ['The program entered the machine, but no answer came out.', 'Some paths end in a fault instead of a result.', 'The machine stopped where the program could not continue.'],
    },
  },
};

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child);
  }
  return value;
}

export const phraseCatalogs = deepFreeze(rawCatalogs);

const eventVoice = deepFreeze(Object.fromEntries([
  ...Object.keys(phraseCatalogs[VOICES.ENVELOP]).map(event => [event, VOICES.ENVELOP]),
  ...Object.keys(phraseCatalogs[VOICES.TOMATO]).map(event => [event, VOICES.TOMATO]),
]));

export function voiceForEvent(event) {
  const voice = eventVoice[event];
  if (!voice) throw new RangeError(`Unknown personality event: ${String(event)}`);
  return voice;
}

export function hashKey(value) {
  const source = String(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function toneForRoll(roll) {
  if (!Number.isInteger(roll) || roll < 0 || roll > 99) {
    throw new RangeError('Tone roll must be an integer from 0 through 99.');
  }
  return TONE_BANDS.find(band => roll >= band.start && roll <= band.end).tone;
}

export function selectPersonality({event, key, voice = voiceForEvent(event)}) {
  if (key === undefined || key === null) throw new TypeError('A stable event, input, or job key is required.');
  const expectedVoice = voiceForEvent(event);
  if (voice !== expectedVoice) {
    throw new RangeError(`${event} belongs to the ${expectedVoice} voice.`);
  }

  const stableKey = String(key);
  const tone = toneForRoll(hashKey(`${event}\u001f${stableKey}\u001ftone`) % 100);
  const variants = phraseCatalogs[voice][event][tone];
  const variant = hashKey(`${voice}\u001f${event}\u001f${stableKey}\u001f${tone}\u001fphrase`) % variants.length;
  return Object.freeze({voice, event, tone, text: variants[variant]});
}
