// Deterministic, web-only wording for Envelop and Tomato status messages.
// Keep selection pure so polling and rerendering cannot change a phrase.

export const VOICES = Object.freeze({
  ENVELOP: 'envelop',
  TOMATO: 'tomato',
});

export const EVENTS = Object.freeze({
  UNKNOWN_TOKEN: 'UNKNOWN_TOKEN',
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
      [t.DIRECT]: ['I could not translate that word.', 'That word is outside the compute language.', 'I stopped at a word I do not recognize.'],
      [t.LIGHTLY_PLAYFUL]: ['That word is not in my translation notes.', 'I lost the calculation at that word.', 'That word took the expression off course.'],
      [t.HARDWARE_SPECIFIC]: ['No compiler token matches that word.', 'The tokenizer has no entry for that word.', 'Translation stopped before bytecode generation.'],
      [t.MEMORABLE]: ['One unknown word can halt a whole translation.', 'That word has no route into Tomato code.', 'The expression reached the edge of my vocabulary.'],
    },
    [e.MALFORMED_EXPRESSION]: {
      [t.DIRECT]: ['I could not read that expression.', 'The expression is incomplete or malformed.', 'I need a well-formed expression to continue.'],
      [t.LIGHTLY_PLAYFUL]: ['The pieces of that expression do not quite fit.', 'I found the numbers, but not a complete calculation.', 'That expression needs a little repair before translation.'],
      [t.HARDWARE_SPECIFIC]: ['Parsing stopped before an instruction sequence was produced.', 'The parser could not build a complete expression tree.', 'No bytecode was emitted for this expression.'],
      [t.MEMORABLE]: ['A calculation needs a path from first token to last.', 'The expression arrived with a gap in its logic.', 'I cannot wire an unfinished expression into a program.'],
    },
    [e.UNSUPPORTED_OPERATION]: {
      [t.DIRECT]: ['That operation is not supported.', 'I cannot translate that operation for Tomato.', 'That operation is outside the installed compute set.'],
      [t.LIGHTLY_PLAYFUL]: ['That operation is not on Tomato’s current menu.', 'I know what you asked, but I cannot pack it for Tomato.', 'That operation has not joined this compute set yet.'],
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
      [t.DIRECT]: ['I could not assemble that instruction.', 'That instruction is not valid for Tomato.', 'The raw program contains an invalid instruction.'],
      [t.LIGHTLY_PLAYFUL]: ['That instruction did not pass the assembly desk.', 'The program took a wrong turn on that instruction.', 'That line looks like assembly, but it does not fit this assembler.'],
      [t.HARDWARE_SPECIFIC]: ['The assembler rejected the instruction before submission.', 'No valid ABI encoding was produced for that instruction.', 'Instruction validation failed before Tomato execution.'],
      [t.MEMORABLE]: ['Assembly is exact: one invalid line stops the program.', 'I will not send Tomato a program I cannot encode.', 'That instruction never became machine code.'],
    },
    [e.HARDWARE_OFFLINE]: {
      [t.DIRECT]: ['Tomato is offline.', 'I cannot reach the hardware right now.', 'The hardware connection is unavailable.'],
      [t.LIGHTLY_PLAYFUL]: ['Tomato has stepped away from the wire.', 'The hardware has gone quiet for now.', 'I knocked, but Tomato is not on the connection.'],
      [t.HARDWARE_SPECIFIC]: ['The physical Tomato bridge is disconnected.', 'No active hardware route is available.', 'The device transport is not connected.'],
      [t.MEMORABLE]: ['The route ends here until Tomato reconnects.', 'A silent wire cannot carry this job.', 'Tomato is beyond the network horizon for now.'],
    },
    [e.HARDWARE_RESTORED]: {
      [t.DIRECT]: ['Tomato is back online.', 'The hardware connection is restored.', 'I can reach Tomato again.'],
      [t.LIGHTLY_PLAYFUL]: ['Tomato is back on the wire.', 'The hardware has checked back in.', 'The route to Tomato is open again.'],
      [t.HARDWARE_SPECIFIC]: ['The physical Tomato bridge has reconnected.', 'The device transport is connected again.', 'An active hardware route is available again.'],
      [t.MEMORABLE]: ['The wire is speaking again.', 'The route has found Tomato again.', 'Tomato has returned to the network map.'],
    },
  },
  [VOICES.TOMATO]: {
    [e.BUSY]: {
      [t.DIRECT]: ['I am busy with another job.', 'I cannot start this job yet.', 'My execution queue is busy.'],
      [t.LIGHTLY_PLAYFUL]: ['One job at a time; this one must wait.', 'My hands are full with the current program.', 'The next instruction train is waiting at the signal.'],
      [t.HARDWARE_SPECIFIC]: ['The executor returned a busy status.', 'The compute slot is occupied by another job.', 'Execution did not start because the device is busy.'],
      [t.MEMORABLE]: ['Even fast instructions must wait for an open machine.', 'The silicon is occupied; this job stays at the door.', 'One machine, one running program, one short wait.'],
    },
    [e.TIMEOUT]: {
      [t.DIRECT]: ['The job did not finish in time.', 'Execution timed out.', 'I could not complete the job before the deadline.'],
      [t.LIGHTLY_PLAYFUL]: ['That program stayed on the clock too long.', 'The deadline arrived before the answer.', 'The job ran out of allotted time.'],
      [t.HARDWARE_SPECIFIC]: ['Execution exceeded the job time limit.', 'The running program did not return before its deadline.', 'The executor stopped waiting for a return value.'],
      [t.MEMORABLE]: ['A program that never returns cannot deliver an answer.', 'The clock finished its work before the program did.', 'The answer remained beyond the execution deadline.'],
    },
    [e.EXECUTION_FAULT]: {
      [t.DIRECT]: ['The job ended with an execution fault.', 'I could not complete this program.', 'Execution stopped with a machine fault.'],
      [t.LIGHTLY_PLAYFUL]: ['The program and I reached a hard stop.', 'That instruction path ended badly.', 'The job tripped while it was running.'],
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
