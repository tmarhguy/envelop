import {EVENTS, VOICES, selectPersonality} from './personality.mjs?v=20260916-bounded-division';

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
  return Object.freeze({
    voice: selected.voice,
    event,
    text: selected.text,
    technical: technicalLine(event, details),
    guidance: details.guidance || null,
  });
}

export function compileOutcome(error, key) {
  if (!error || !compileEvents.has(error.code)) return null;
  if (error.code === EVENTS.UNKNOWN_TOKEN && error.details?.token) {
    return Object.freeze({
      voice: VOICES.ENVELOP,
      event: error.code,
      text: `I can’t help with “${error.details.token}” yet.`,
      technical: null,
      guidance: error.details.guidance || null,
    });
  }
  return personalityOutcome(error.code, key, error.details);
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

export function statusView(job = {}) {
  const phase = normalizePhase(job);
  if (phase === PHASES.FAILED) {
    return {...(job.outcome || fixedOutcome({
      text: 'The operation could not be completed.',
      code: 'OPERATION_FAILED',
    })), phase, pending: false, resultFirst: false};
  }
  if (phase === PHASES.SUCCEEDED) {
    return {
      phase,
      voice: null,
      text: null,
      technical: job.target || null,
      pending: false,
      resultFirst: true,
    };
  }
  if (phase === PHASES.COMPILING) {
    return {
      phase,
      voice: VOICES.ENVELOP,
      text: 'Translating this calculation for Tomato.',
      technical: 'COMPILING',
      pending: true,
      resultFirst: false,
    };
  }
  if (phase === PHASES.QUEUED) {
    return {
      phase,
      voice: VOICES.ENVELOP,
      text: job.via === 'hardware'
        ? 'The durable job is queued for physical Tomato.'
        : 'Preparing Virtual Tomato.',
      technical: job.via === 'hardware' ? 'QUEUED · PHYSICAL' : 'QUEUED · VIRTUAL',
      pending: true,
      resultFirst: false,
    };
  }
  if (phase === PHASES.EXECUTING) {
    return {
      phase,
      voice: VOICES.ENVELOP,
      text: job.via === 'hardware'
        ? 'Physical Tomato is executing the job.'
        : 'Virtual Tomato is executing the job.',
      technical: job.via === 'hardware' ? 'EXECUTING · PHYSICAL' : 'EXECUTING · VIRTUAL',
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
