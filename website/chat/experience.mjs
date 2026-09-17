// Product rules only: no generated replies, inferred intent, or computed answers.
export const DEFAULT_MODE = 'virtual';
export const executionMode = value => value === 'physical' ? 'physical' : DEFAULT_MODE;
export const executionTarget = mode => executionMode(mode) === 'physical' ? 'hardware' : 'virtual';
export function modeDescription(mode, online) {
  if (executionMode(mode) === 'virtual') return 'Runs here in your browser. Available even when physical Tomato is off.';
  return online ? 'Runs on the physical computer. Each result confirms its source.'
    : 'Saved requests wait for Tomato to reconnect. You can cancel a queued calculation.';
}

export function conversationReply(value) {
  const text = String(value || '').trim().toLowerCase().replace(/[’']/g, "'").replace(/[.!?]+$/, '').trim();
  if (/^(?:what'?s good|what'?s up|sup|how are you|how'?s it going|how are things)$/.test(text))
    return 'Ready to explore. Try a calculation, ask about Tomato, or open the examples below.';
  if (/^(?:ok|okay|okey|alright|got it|makes sense|cool|nice|sure|thanks|thank you)$/.test(text))
    return "Whenever you're ready. You can run another calculation or explore what Tomato can do.";
  if (/^(?:confused|i'?m confused|i am confused|what is happening|what'?s happening|what is this|what'?s this|i don'?t understand|help me)$/.test(text))
    return 'Start with 23 + 19. Virtual mode runs it here; Physical mode sends it to Tomato and waits if the machine is off. Open “View execution” to see the instructions.';
  return null;
}

export function guidanceFor(code, detail = {}) {
  const known = {
    UNANSWERED_REQUEST: ['Let’s try a different way', 'I don’t have a matching answer for that yet. Try a calculation or a question about Tomato.'],
    UNKNOWN_TOKEN: ['A word I don’t recognize yet', 'Use numbers and supported operators, or choose an example below.'],
    MALFORMED_EXPRESSION: ['A little more detail', 'This expression needs an adjustment before it can run.'],
    UNSUPPORTED_OPERATION: ['Try another operation', 'That operation isn’t available in this compute interface yet.'],
    INVALID_REGISTER: ['Choose a supported register', 'This workspace has registers R0–R7.'],
    OUT_OF_RANGE: ['A smaller request will fit', 'This request exceeds a limit of the compute workspace.'],
    INVALID_INSTRUCTION: ['Let’s adjust the program', 'Check the instruction and its operands, then try again.'],
  };
  const entry = known[code];
  if (!entry) return null;
  return {title: entry[0], text: entry[1], guidance: detail.guidance || null};
}

export function presentation(job, view) {
  const code = view.event || String(view.technical || '').split(' · ')[0];
  const guide = guidanceFor(code);
  if (guide) return {...view, ...guide, guidance: view.guidance || guide.guidance, tone: 'guidance', pending: false, voice: 'envelop'};
  if (view.phase === 'succeeded') {
    // Keep provenance; drop random catalog lines that competed with the actual result.
    if (!job.compute) return {...view, title: null, text: null, tone: 'success'};
    return {...view, title: 'Result ready', text: null, tone: 'success'};
  }
  if (view.phase === 'unknown') return {...view, title: 'Waiting for confirmation', tone: 'waiting', text: 'The connection paused before we could confirm the hardware result. Check its status before trying this job again.'};
  if (view.phase === 'queued' && job.via === 'hardware') return {...view, title: job.backendId ? 'Saved for physical Tomato' : 'Saving your request', tone: 'waiting', text: job.backendId ? 'Your calculation is safely queued. It will run when Tomato and its bridge are available.' : 'Adding this calculation to the hardware queue.', pending: !job.backendId};
  if (code === 'HARDWARE_CANCELLED') return {...view, title: 'Run cancelled', tone: 'waiting', text: null};
  if (view.phase === 'failed') return {...view, title: 'Couldn’t finish this run', tone: 'problem', text: job.via === 'virtual' ? 'Virtual Tomato couldn’t complete this run. Your expression is still available to edit or retry.' : view.text};
  // In-flight: one stable title, no rotating phrases underneath.
  if (view.phase === 'compiling') return {...view, title: 'Reading your request', text: null, tone: 'working'};
  if (view.phase === 'queued') return {...view, title: job.via === 'hardware' ? 'Waiting for physical Tomato' : 'Queued in Virtual Tomato', text: null, tone: 'working'};
  if (view.phase === 'executing') return {...view, title: job.via === 'hardware' ? 'Running on physical Tomato' : 'Running in Virtual Tomato', text: null, tone: 'working'};
  return {...view, title: job.via === 'hardware' ? 'Running on physical Tomato' : 'Running in Virtual Tomato', text: null, tone: 'working'};
}
