import {CARDS, MATCHERS, programIntentFor} from './knowledge.mjs?v=20260917-premium-1';

const freezeTree = value => {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) freezeTree(child);
  }
  return value;
};

export function isCalculationBearing(value) {
  const text = String(value || '').trim();
  if (/^\/(?:run|calc)\b/i.test(text)) return true;
  if (!/\d/.test(text)) return false;
  if (/[+*/%&|^~]|\s-\s/.test(text)) return true;
  if (/\b(?:plus|minus|times|product|and|or|xor|nand|nor|xnor|not|maskadd|xorand|andadd|oradd|xoradd|andn|orn|xorbc|xorbo|xorbx|andbo|andbx|andbc|orbc|orbo|orbx)\s*\(/i.test(text)) return true;
  const numbers = text.match(/-?(?:0x[\da-f]+|0b[01]+|\d+)/gi) || [];
  return numbers.length >= 2
    && /\b(?:plus|minus|times|product|and|or|xor|nand|nor|xnor)\b/i.test(text);
}

export function recognizeTomatoIntent(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text || isCalculationBearing(text) || /^\/help\b/i.test(text)) return null;
  const program = programIntentFor(text);
  if (program) return program;
  for (const [id, pattern] of MATCHERS) {
    if (pattern.test(text)) return id;
  }
  if (/^who (?:is|was) [A-Z][\p{L}'’-]*(?:\s+[A-Z][\p{L}'’-]*)*[?.!]*$/iu.test(text)
    && !/\b(?:tyrone|tomato|envelop)\b/i.test(text)) return 'unknownPerson';
  const asksAboutTomato = /\b(?:tomato|envelop)\b/i.test(text)
    && /^(?:who|what|where|when|why|how|is|are|does|do|can|tell me)\b/i.test(text);
  return asksAboutTomato ? 'clarification' : null;
}

export function localAnswerFor(value) {
  const id = recognizeTomatoIntent(value);
  if (!id) return null;
  return freezeTree({
    id,
    provenance: {...CARDS[id].provenance},
    answer: CARDS[id].answer,
    actions: CARDS[id].actions.map(action => ({...action})),
  });
}
