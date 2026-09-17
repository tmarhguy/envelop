import {presentation} from './experience.mjs?v=20260917-premium-4';
import {EVENTS, VOICES, selectPersonality} from './personality.mjs?v=20260917-tomato-playground';

export const PHASES = Object.freeze({
  COMPILING: 'compiling',
  QUEUED: 'queued',
  EXECUTING: 'executing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  UNKNOWN: 'unknown',
});

const compileEvents = new Set([
  EVENTS.UNKNOWN_TOKEN,
  EVENTS.MALFORMED_EXPRESSION,
  EVENTS.UNSUPPORTED_OPERATION,
  EVENTS.INVALID_REGISTER,
  EVENTS.OUT_OF_RANGE,
  EVENTS.INVALID_INSTRUCTION,
]);

export function technicalDetail(details = {}) {
  const value = details.token
    ?? details.operation
    ?? details.register
    ?? details.instruction
    ?? details.statusByte
    ?? details.range
    ?? details.reason;
  return value === undefined || value === null ? '' : String(value);
}

export function technicalLine(code, details = {}) {
  const detail = technicalDetail(details);
  return detail ? `${code} · ${detail}` : String(code);
}

export function personalityOutcome(event, key, details = {}) {
  const selected = selectPersonality({event, key});
  const recovered = [
    ...(details.recoveredOperands || []),
    ...(details.recoveredOperators || []),
  ];
  return Object.freeze({
    voice: selected.voice,
    event,
    text: selected.text,
    technical: technicalLine(event, details),
    guidance: details.guidance
      || (recovered.length ? `Recovered so far: ${recovered.join(' ')}.` : null),
  });
}

export function compileOutcome(error, key) {
  if (!error || !compileEvents.has(error.code)) return null;
  const base = personalityOutcome(error.code, key, error.details);
  return Object.freeze({
    ...base,
    guidance: error.details?.guidance || base.guidance || error.message || null,
  });
}

export function fixedOutcome({voice = VOICES.ENVELOP, text, code, details}) {
  return Object.freeze({
    voice,
    text,
    technical: technicalLine(code, details),
  });
}

export function normalizePhase(job = {}) {
  if (Object.values(PHASES).includes(job.phase)) return job.phase;
  if (job.status === 'offer') return PHASES.QUEUED;
  if (job.status === 'running') return PHASES.EXECUTING;
  if (job.status === 'done') return PHASES.SUCCEEDED;
  if (job.status === 'error') return PHASES.FAILED;
  return PHASES.UNKNOWN;
}

function baseStatusView(job = {}) {
  const phase = normalizePhase(job);
  const stableKey = `${job.id || job.body || 'job'}:${phase}`;
  const lifecycle = event => selectPersonality({event, key: stableKey});
  if (phase === PHASES.FAILED) {
    return {...(job.outcome || fixedOutcome({
      text: 'The operation could not be completed.',
      code: 'OPERATION_FAILED',
    })), phase, pending: false, resultFirst: false};
  }
  if (phase === PHASES.SUCCEEDED) {
    const selected = lifecycle(EVENTS.RESULT_RETURNED);
    return {
      phase,
      voice: selected.voice,
      text: job.compute === false ? 'Reply ready.' : selected.text,
      technical: job.target || null,
      pending: false,
      resultFirst: true,
    };
  }
  if (phase === PHASES.COMPILING) {
    const selected = lifecycle(EVENTS.INTERPRETING);
    return {
      phase,
      voice: VOICES.ENVELOP,
      text: selected.text,
      technical: 'COMPILING',
      pending: true,
      resultFirst: false,
    };
  }
  if (phase === PHASES.QUEUED) {
    const event = job.via === 'hardware' ? EVENTS.SENDING_TO_HARDWARE : EVENTS.EXPRESSION_READY;
    const selected = lifecycle(event);
    return {
      phase,
      voice: VOICES.ENVELOP,
      text: selected.text,
      technical: job.via === 'hardware' ? 'QUEUED · HARDWARE' : 'QUEUED · VIRTUAL',
      pending: true,
      resultFirst: false,
    };
  }
  if (phase === PHASES.EXECUTING) {
    const event = job.via === 'hardware' ? EVENTS.PHYSICAL_EXECUTION : EVENTS.VIRTUAL_EXECUTION;
    const selected = lifecycle(event);
    return {
      phase,
      voice: VOICES.ENVELOP,
      text: selected.text,
      technical: job.via === 'hardware' ? 'EXECUTING · HARDWARE' : 'EXECUTING · VIRTUAL',
      pending: true,
      resultFirst: false,
    };
  }
  return {
    phase: PHASES.UNKNOWN,
    voice: VOICES.ENVELOP,
    text: 'The hardware result is still unknown. Virtual execution was not started.',
    technical: 'RESULT_UNKNOWN · REPLAY_BLOCKED',
    pending: false,
    resultFirst: false,
  };
}

export function statusView(job = {}, options = {}) {
  return presentation(job, baseStatusView(job), options);
}
