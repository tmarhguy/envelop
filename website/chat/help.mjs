const freezeTree = value => {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) freezeTree(child);
  }
  return value;
};

export const HELP_GUIDE = freezeTree({
  title: 'What Envelop can ask Tomato to do',
  intro: 'Choose any reviewed action to run it immediately. Compute keeps the same Physical or Virtual Tomato labels as the Send button.',
  groups: [
    {
      title: 'Arithmetic',
      options: [
        {label: 'Addition', prompt: '23 + 19'},
        {label: 'Constant multiplication', prompt: '34 * 3'},
        {label: 'Bounded constant division', prompt: '345 / 345'},
      ],
    },
    {
      title: 'Logic',
      options: [
        {label: 'Named XOR', prompt: 'What is xor of 5 and 3?'},
        {label: 'Bitwise NOT', prompt: 'not(0x0000000F)'},
        {label: 'NAND', prompt: 'nand(0xF0, 0xAA)'},
      ],
    },
    {
      title: 'Composed logic',
      options: [
        {label: 'Dual-LUT XOR then AND', prompt: 'xorand(0xF0, 0xAA, 0x0F)'},
        {label: 'Mask then add', prompt: 'maskadd(0xFF, 7, 9)'},
        {label: 'AND-not', prompt: 'andn(0xFF, 0x0F)'},
      ],
    },
    {
      title: 'Precedence',
      options: [
        {label: 'Parentheses first', prompt: '(57 + 19) & 0x3F'},
        {label: 'Compare precedence', prompt: '57 + 19 & 0x3F'},
        {label: 'Nested named form', prompt: 'xor(5, and(7, 3))'},
      ],
    },
    {
      title: '32-bit experiments',
      options: [
        {label: 'Two’s complement', prompt: '-1 & 0xFF'},
        {label: 'Unsigned overflow', prompt: '4294967295 + 1'},
        {label: 'Full-width inversion', prompt: '~0'},
      ],
    },
    {
      title: 'Malformed-input experiments',
      options: [
        {label: 'Missing operand', prompt: '23 +'},
        {label: 'Unsupported operation', prompt: '23 % 5'},
        {label: 'Try to confuse me', prompt: 'and(5,)'},
      ],
    },
    {
      title: 'Raw programs',
      options: [
        {label: 'Add and return', prompt: '/run; R0=23; R1=19; ADD R0,R0,R1; RETURN R0'},
        {label: 'Load, XOR, return', prompt: '/run; R0=0xF0; R1=0xAA; XOR R0,R0,R1; RETURN R0'},
      ],
    },
    {
      title: 'Questions about Tomato',
      options: [
        {label: 'Capabilities', prompt: 'What can Tomato do?'},
        {label: 'Hardware provenance', prompt: 'Is Tomato real hardware?'},
        {label: 'Compute registers', prompt: 'How many registers can I use here?'},
        {label: 'Screen access', prompt: 'Can I see Tomato’s screen?'},
      ],
    },
    {
      title: 'Tomato OS and programs',
      options: [
        {label: 'All 14 programs', prompt: 'What programs are on Tomato?'},
        {label: 'Snake', prompt: 'What is Snake on Tomato?'},
        {label: 'ALU Studio', prompt: 'What is ALU Studio?'},
        {label: 'Compiler app', prompt: 'What does the Compiler program on Tomato do?'},
      ],
    },
    {
      title: 'Numbers and boundaries',
      options: [
        {label: 'Integer representation', prompt: 'How are integers represented?'},
        {label: 'Negative values', prompt: 'How do negative numbers work?'},
        {label: 'Masks and composed work', prompt: 'What are masks and composed operations?'},
        {label: 'Why % is unsupported', prompt: 'Does Envelop support modulo percent?'},
      ],
    },
    {
      title: 'People, provenance, and source',
      options: [
        {label: 'Who is Tyrone?', prompt: 'Who is Tyrone Marhguy?'},
        {label: 'Physical or Virtual?', prompt: 'What is the difference between Physical and Virtual Tomato?'},
        {label: 'How answers are routed', prompt: 'How does this deterministic chat work?'},
        {label: 'No AI or black boxes', prompt: 'Does Envelop use AI?'},
      ],
    },
  ],
});

export const SUGGESTION_CATALOG = freezeTree([
  {category: 'help', label: 'Help', prompt: '/help'},
  {category: 'greeting', label: 'Hello', prompt: 'Hello Tomato'},
  {category: 'basic', label: 'Add', prompt: '23 + 19'},
  {category: 'multiply', label: 'Multiply', prompt: '34 * 3'},
  {category: 'divide', label: 'Divide', prompt: '345 / 345'},
  {category: 'bitwise', label: 'XOR', prompt: 'What is xor of 5 and 3?'},
  {category: 'not', label: 'NOT', prompt: 'not(0x0000000F)'},
  {category: 'nand', label: 'NAND', prompt: 'nand(0xF0, 0xAA)'},
  {category: 'nor', label: 'NOR', prompt: 'nor(0xF0, 0xAA)'},
  {category: 'xnor', label: 'XNOR', prompt: 'xnor(5, 3)'},
  {category: 'dual-lut', label: 'XORAND', prompt: 'xorand(0xF0, 0xAA, 0x0F)'},
  {category: 'mask', label: 'MASKADD', prompt: 'maskadd(0xFF, 7, 9)'},
  {category: 'xoradd', label: 'XORADD', prompt: 'xoradd(0xF0, 0xAA, 7)'},
  {category: 'andadd', label: 'ANDADD', prompt: 'andadd(0xF0, 0xAA, 7)'},
  {category: 'oradd', label: 'ORADD', prompt: 'oradd(0xF0, 0xAA, 7)'},
  {category: 'andn', label: 'ANDN', prompt: 'andn(0xFF, 0x0F)'},
  {category: 'orn', label: 'ORN', prompt: 'orn(0xF0, 0x0F)'},
  {category: 'mixed-xnor', label: '+ XNOR', prompt: '23 + xnor(5, 3)'},
  {category: 'nested', label: 'Nested', prompt: 'xor(5, and(7, 3))'},
  {category: 'negative', label: 'Negative', prompt: '-1 & 0xFF'},
  {category: 'overflow', label: 'Overflow', prompt: '4294967295 + 1'},
]);

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function selectSuggestions({session = '', day = '', input = '', round = 0, started = false, count = 5} = {}) {
  const limit = Math.max(0, Math.min(count, SUGGESTION_CATALOG.length));
  if (!limit) return freezeTree([]);
  const help = SUGGESTION_CATALOG[0];
  const hello = SUGGESTION_CATALOG[1];
  const operations = SUGGESTION_CATALOG.slice(2);
  const seed = `${String(input).trim().toLowerCase() || `${session}\u001f${day}`}\u001f${round}`;
  const start = stableHash(seed) % operations.length;
  const selected = started ? [help] : [help, hello].slice(0, limit);
  for (let index = 0; selected.length < limit; index += 1) {
    selected.push(operations[(start + index * (operations.length - 1)) % operations.length]);
  }
  return freezeTree(selected);
}

export const LEGACY_UNANSWERED_REPLY = 'Try /help. I run bounded integer jobs.';

export function isHelpRequest(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (/^\/help[?.!]*$/i.test(text) || /^(?:help|what can you do)[?.!]*$/i.test(text)) return true;
  const lead = /^(?:(?:hmm|okay|ok|well|so|i mean)[,.]?\s*)*/i;
  const core = text.replace(lead, '');
  if (/^what (?:else|more) can\b/i.test(core)) return true;
  if (/^can (?:you|u|tomato) do (?:anything|any|and)?\s*more\b/i.test(core)) return true;

  // Questions about combining named operators are requests for capability
  // guidance, not expressions to leave waiting on physical Tomato.
  const operations = text.match(/\b(?:and|or|xor|nand|nor|xnor|not|plus|minus|times|product)\b/gi) || [];
  return !/\d/.test(text)
    && operations.length >= 2
    && /\b(?:what|if|happens?|sentence|together|same)\b/i.test(text);
}

export function isLegacyUnansweredReply(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
    === LEGACY_UNANSWERED_REPLY.toLowerCase();
}

export function legacyUnansweredDetails(value) {
  if (!isLegacyUnansweredReply(value)) return null;
  return Object.freeze({
    event: 'UNANSWERED_REQUEST',
    rawReply: String(value),
  });
}
