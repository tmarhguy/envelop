// Deterministic, web-only wording for Envelop and Tomato status messages.
// Keep selection pure so polling and rerendering cannot change a phrase.

export const VOICES = Object.freeze({
  ENVELOP: 'envelop',
  TOMATO: 'tomato',
});

export const EVENTS = Object.freeze({
  INTERPRETING: 'INTERPRETING',
  EXPRESSION_READY: 'EXPRESSION_READY',
  SENDING_TO_HARDWARE: 'SENDING_TO_HARDWARE',
  PHYSICAL_EXECUTION: 'PHYSICAL_EXECUTION',
  VIRTUAL_EXECUTION: 'VIRTUAL_EXECUTION',
  RESULT_RETURNED: 'RESULT_RETURNED',
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
  DIRECT: 'graceful',
  LIGHTLY_PLAYFUL: 'characterful',
  HARDWARE_SPECIFIC: 'hardware_mail_metaphor',
  MEMORABLE: 'memorable',
});

// Inclusive lower bounds make the 100 possible rolls exactly 70/20/8/2.
export const TONE_BANDS = Object.freeze([
  Object.freeze({tone: TONES.DIRECT, start: 0, end: 69, weight: 70}),
  Object.freeze({tone: TONES.LIGHTLY_PLAYFUL, start: 70, end: 89, weight: 20}),
  Object.freeze({tone: TONES.HARDWARE_SPECIFIC, start: 90, end: 97, weight: 8}),
  Object.freeze({tone: TONES.MEMORABLE, start: 98, end: 99, weight: 2}),
]);

const e = EVENTS;
const t = TONES;

const rawCatalogs = {
  [VOICES.ENVELOP]: {
    [e.INTERPRETING]: {
      [t.DIRECT]: ['Reading the expression.', 'Interpreting what you sent.', 'Working out the requested expression.'],
      [t.LIGHTLY_PLAYFUL]: ['Let me untangle that.', 'Finding the calculation inside your message.', 'Giving that expression a careful read.'],
      [t.HARDWARE_SPECIFIC]: ['Opening the envelope and parsing its contents.', 'Reading the message before building a program.', 'Sorting the expression before delivery.'],
      [t.MEMORABLE]: ['First, the message must become meaning.', 'I am tracing the shape of your request.', 'The expression is becoming a program.'],
    },
    [e.EXPRESSION_READY]: {
      [t.DIRECT]: ['The expression is ready.', 'The Tomato program is ready.', 'Translation is complete.'],
      [t.LIGHTLY_PLAYFUL]: ['That parsed cleanly.', 'Expression understood. Program prepared.', 'The calculation has taken shape.'],
      [t.HARDWARE_SPECIFIC]: ['The program is packed and ready to send.', 'The encoded program is ready for its route.', 'The envelope now contains Tomato bytes.'],
      [t.MEMORABLE]: ['Meaning has become machine code.', 'The request now has a runnable form.', 'The expression is ready to meet the machine.'],
    },
    [e.SENDING_TO_HARDWARE]: {
      [t.DIRECT]: ['Sending the durable job to the hardware route.', 'The hardware job is queued.', 'Submitting the program to the verified hardware route.'],
      [t.LIGHTLY_PLAYFUL]: ['The hardware route has mail.', 'The device route is next.', 'Your program is waiting for the hardware.'],
      [t.HARDWARE_SPECIFIC]: ['The encoded envelope is in the durable hardware queue.', 'The bridge route has a durable job to deliver.', 'The program is queued for the verified hardware route.'],
      [t.MEMORABLE]: ['The program has left the browser for the machine.', 'A durable route now carries the calculation.', 'The envelope is sealed; the verified device route is its destination.'],
    },
    [e.PHYSICAL_EXECUTION]: {
      [t.DIRECT]: ['The physical machine is executing the program.', 'The hardware executor is running the job.', 'The durable hardware job is running.'],
      [t.LIGHTLY_PLAYFUL]: ['The hardware has the calculation now.', 'The real machine is at work.', 'The hardware accepted the program.'],
      [t.HARDWARE_SPECIFIC]: ['The verified bridge reports the durable job running.', 'Execution is active on the physical hardware route.', 'The durable executor has claimed the job.'],
      [t.MEMORABLE]: ['The program is now real electrical work.', 'The machine has taken over from the message.', 'The hardware is carrying the expression to its answer.'],
    },
    [e.VIRTUAL_EXECUTION]: {
      [t.DIRECT]: ['Virtual Tomato is executing the program.', 'The browser emulator is running the job.', 'Virtual execution is in progress.'],
      [t.LIGHTLY_PLAYFUL]: ['Virtual Tomato has the calculation.', 'The browser machine is at work.', 'Running the same bytes, virtually.'],
      [t.HARDWARE_SPECIFIC]: ['The encoded program is running in the browser CPU emulator.', 'This envelope stayed local for virtual execution.', 'The virtual target is executing the program bytes.'],
      [t.MEMORABLE]: ['The program is running without leaving this browser.', 'A virtual machine is carrying the expression to its answer.', 'The hardware story has a local understudy.'],
    },
    [e.RESULT_RETURNED]: {
      [t.DIRECT]: ['The result is back.', 'Execution returned a result.', 'The computation completed.'],
      [t.LIGHTLY_PLAYFUL]: ['Answer delivered.', 'That one came back cleanly.', 'The result made it home.'],
      [t.HARDWARE_SPECIFIC]: ['The return value has reached Envelop.', 'The completed job delivered its result.', 'The reply envelope contains the return value.'],
      [t.MEMORABLE]: ['The machine answered in numbers.', 'The route ends with a returned value.', 'Program in, answer out.'],
    },
    [e.UNKNOWN_TOKEN]: {
      [t.DIRECT]: [
        'I do not know that word yet.',
        'That word is outside what I understand.',
        'I cannot use that word in this calculation.',
        'That token is not part of the compute language.',
        'No meaning is assigned to that word here.',
      ],
      [t.LIGHTLY_PLAYFUL]: [
        'That word is not in my vocabulary yet.',
        'I followed the calculation until that word.',
        'That word and I have not been introduced.',
        'The parser raised an eyebrow at that word.',
        'Cute word. Wrong dialect for Tomato.',
      ],
      [t.HARDWARE_SPECIFIC]: [
        'No supported operation matches that word.',
        'That word is outside the current compute language.',
        'The calculation stopped at an unsupported term.',
        'Bytecode emission never reached that token.',
        'The ABI lexicon has no entry for that term.',
      ],
      [t.MEMORABLE]: [
        'A calculation can only use words with defined meaning.',
        'That word has no place in the expression yet.',
        'I know the path around that word, but not through it.',
        'Undefined words do not become instructions.',
        'The machine refuses to guess at vocabulary.',
      ],
    },
    [e.MALFORMED_EXPRESSION]: {
      [t.DIRECT]: [
        'I think an operand went missing.',
        'That expression seems unfinished.',
        'That does not quite form a complete computation.',
        'The expression structure is incomplete.',
        'Parsing stopped before a full expression emerged.',
      ],
      [t.LIGHTLY_PLAYFUL]: [
        'The arithmetic is almost there. Almost.',
        'There is a loose operator in there.',
        'I can see what you started writing. I cannot see how it ends.',
        'Your expression left the door open.',
        'That calculation trailed off mid-thought.',
      ],
      [t.HARDWARE_SPECIFIC]: [
        'Parsing stopped before an instruction sequence was produced.',
        'The parser could not build a complete expression tree.',
        'No bytecode was emitted for this expression.',
        'The AST never closed; compilation aborted.',
        'Operand binding failed before codegen.',
      ],
      [t.MEMORABLE]: [
        'A calculation needs a path from first token to last.',
        'The expression arrived with a gap in its logic.',
        'I cannot wire an unfinished expression into a program.',
        'Half a formula is not a program.',
        'Open parentheses do not survive the assembler.',
      ],
    },
    [e.UNSUPPORTED_OPERATION]: {
      [t.DIRECT]: [
        'I understand what you mean. Tomato cannot do that yet.',
        'Perfectly sensible request. Not presently a Tomato operation.',
        'Understood. Unsupported.',
        'That operation is recognized, but not available here.',
        'The request is clear; the instruction set is not.',
      ],
      [t.LIGHTLY_PLAYFUL]: [
        'Translation succeeded. Execution will not.',
        'I know exactly what you are asking for. I simply cannot compile it.',
        'That operation is not on Tomato’s current menu.',
        'Great idea. Wrong century of the ISA.',
        'Tomato nodded politely and declined.',
      ],
      [t.HARDWARE_SPECIFIC]: [
        'The current bytecode ABI has no instruction for that operation.',
        'No installed opcode matches that operation.',
        'Compilation stopped because the operation is absent from the ISA subset.',
        'Codegen has no pattern for that operator.',
        'That operator never maps onto Dual-LUT work here.',
      ],
      [t.MEMORABLE]: [
        'A clear request still needs a real instruction behind it.',
        'That operation has no path through the current machine.',
        'I will not invent an instruction Tomato does not have.',
        'Wishful operators do not become silicon.',
        'The wishlist is longer than the opcode table.',
      ],
    },
    [e.INVALID_REGISTER]: {
      [t.DIRECT]: [
        'That register is not available in this compute ABI.',
        'Use one of the ABI’s exposed registers.',
        'I cannot compile that register reference.',
        'That register is outside R0–R7 for this workspace.',
        'The named register is not in the sandbox map.',
      ],
      [t.LIGHTLY_PLAYFUL]: [
        'That register wandered past the end of the ABI map.',
        'The playground has fewer register seats than that.',
        'That register name is one slot too adventurous for this interface.',
        'R-something got a little ambitious.',
        'That register asked for a chair that does not exist.',
      ],
      [t.HARDWARE_SPECIFIC]: [
        'The compute ABI exposes registers R0 through R7.',
        'Register encoding is limited to the eight ABI registers.',
        'The register operand cannot be encoded in this program.',
        'Sandbox register space stops at R7.',
        'Full Tomato has more registers; this interface does not expose them.',
      ],
      [t.MEMORABLE]: [
        'A register that cannot be addressed here cannot hold the answer.',
        'That register exists beyond this program’s map.',
        'The compute interface has a firm edge.',
        'Addresses outside the map stay blank.',
        'The sandbox draws a hard line at eight registers.',
      ],
    },
    [e.OUT_OF_RANGE]: {
      [t.DIRECT]: [
        'That value is outside the allowed range.',
        'The requested value cannot be encoded here.',
        'Use a value within the supported range.',
        'That literal does not fit the field.',
        'The number exceeds what this encoding accepts.',
      ],
      [t.LIGHTLY_PLAYFUL]: [
        'That number does not fit in the available space.',
        'The value overshot its field.',
        'That number needs to come back inside the boundary.',
        'Too wide for the envelope.',
        'The bits ran out before the number did.',
      ],
      [t.HARDWARE_SPECIFIC]: [
        'The value exceeds the field width in the compute ABI.',
        'Encoding stopped at a bounded numeric field.',
        'The operand cannot be represented by the target instruction format.',
        'Immediate encoding exceeded the available bits.',
        '32-bit lanes still have finite immediate fields.',
      ],
      [t.MEMORABLE]: [
        'Every machine value needs somewhere finite to land.',
        'That value crossed the line the encoding can represent.',
        'The number is valid in theory, but not in this field.',
        'Infinity is not an instruction operand.',
        'Finite silicon, finite numbers.',
      ],
    },
    [e.INVALID_INSTRUCTION]: {
      [t.DIRECT]: [
        'That is not valid Tomato syntax.',
        'I cannot assemble that line.',
        'Something is wrong with that instruction.',
        'That line does not assemble cleanly.',
        'Instruction syntax failed validation.',
      ],
      [t.LIGHTLY_PLAYFUL]: [
        'Tomato code, yes. Valid Tomato code, no.',
        'That almost looks like an instruction.',
        'I know what you were going for. The syntax disagrees.',
        'The assembler politely declined.',
        'Close — but the mnemonics are picky.',
      ],
      [t.HARDWARE_SPECIFIC]: [
        'The assembler rejected the instruction before submission.',
        'No valid ABI encoding was produced for that instruction.',
        'Instruction validation failed before Tomato execution.',
        'Operand shape does not match any opcode pattern.',
        'Raw program parsing stopped on a bad line.',
      ],
      [t.MEMORABLE]: [
        'Assembly is exact: one invalid line stops the program.',
        'I will not send Tomato a program I cannot encode.',
        'That instruction never became machine code.',
        'Broken lines do not earn a datapath.',
        'The program ended at the first untranslatable step.',
      ],
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
        'I do not have an answer for that.',
        'That question is outside what I know.',
      ],
      [t.LIGHTLY_PLAYFUL]: [
        'Never heard of that one before.',
        'That made sense right up until the part that did not.',
        'Interesting question. Wrong computer.',
        'You may want the OG chat for that one.',
        'Try a calculation, or ask something Tomato actually knows.',
        'I can run integers. That was… not an integer.',
      ],
      [t.HARDWARE_SPECIFIC]: [
        'That request is outside what I can verify.',
        'Nothing I know matches that request.',
        'I cannot route that to a useful reply.',
        'The facts I have do not settle that question.',
        'No knowledge card or compute path matched the input.',
        'I came up empty on that one.',
      ],
      [t.MEMORABLE]: [
        'A confident answer would need evidence I do not have.',
        'I have nothing on file for that.',
        'I know exactly enough to know that I do not know what you meant.',
        'I would rather leave a blank than invent a fact.',
        'Silence beats a fabricated reply.',
        'Deterministic systems also know when to stop.',
      ],
    },
    [e.BUSY]: {
      [t.DIRECT]: ['One computation at a time.', 'I am still working on the last one.', 'The datapath is occupied.', 'Wait for the current job to finish.'],
      [t.LIGHTLY_PLAYFUL]: ['Hold that thought.', 'Please form an orderly queue.', 'There is already something moving through the machine.', 'One program in the pipe already.'],
      [t.HARDWARE_SPECIFIC]: ['The executor returned a busy status.', 'The compute slot is occupied by another job.', 'Execution did not start because the device is busy.', 'The bridge lease is already running work.'],
      [t.MEMORABLE]: ['Even fast instructions must wait for an open machine.', 'The silicon is occupied; this job stays at the door.', 'One machine, one running program, one short wait.', 'Concurrency is a luxury this datapath declines.'],
    },
    [e.TIMEOUT]: {
      [t.DIRECT]: ['That took longer than it should have.', 'No result came back.', 'Execution took too long.', 'The job timed out without a return value.'],
      [t.LIGHTLY_PLAYFUL]: ['That computation appears to have wandered off.', 'I waited. Nothing returned.', 'That job did not make it home.', 'The clock won; the answer did not show.'],
      [t.HARDWARE_SPECIFIC]: ['Execution exceeded the job time limit.', 'The running program did not return before its deadline.', 'The executor stopped waiting for a return value.', 'The durable job crossed its timeout fence.'],
      [t.MEMORABLE]: ['A program that never returns cannot deliver an answer.', 'The clock finished its work before the program did.', 'The answer remained beyond the execution deadline.', 'Time boxed the machine; the result stayed outside.'],
    },
    [e.EXECUTION_FAULT]: {
      [t.DIRECT]: ['Something went wrong during execution.', 'That job did not complete.', 'Execution halted before a result was produced.', 'The run ended in a fault.'],
      [t.LIGHTLY_PLAYFUL]: ['The datapath and that program have had a disagreement.', 'Something in that program disagreed with the machine.', 'The program and I reached a hard stop.', 'The machine put the program down mid-stride.'],
      [t.HARDWARE_SPECIFIC]: ['The executor returned a nonzero fault status.', 'The running program ended without a valid result.', 'Machine execution stopped on a fault condition.', 'Fault status arrived instead of a return register.'],
      [t.MEMORABLE]: ['The program entered the machine, but no answer came out.', 'Some paths end in a fault instead of a result.', 'The machine stopped where the program could not continue.', 'Faults are answers of a kind — just not the useful kind.'],
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
