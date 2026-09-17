const freezeTree = value => {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) freezeTree(child);
  }
  return value;
};

export const HELP_GUIDE = freezeTree({
  title: 'What Envelop can ask Tomato to do',
  intro: 'Choose a form below. Envelop translates controlled expressions; Tomato executes the resulting program.',
  groups: [
    {
      title: 'Chat',
      options: [
        {label: 'Say hello', example: 'Hello, Tomato.'},
        {label: 'Show this guide', example: '/help'},
      ],
    },
    {
      title: 'Controlled compute',
      options: [
        {label: 'Arithmetic and bitwise expressions', example: 'What is (57 + 19) AND 0x3F?'},
        {label: 'Operators', example: '+  -  *  /  &  |  ^  ~'},
        {label: 'Named forms', example: 'plus, minus, product, times, and, or, xor, nand, nor, xnor, not'},
        {label: 'Constant multiplication', example: '34 * 3 · lowered to an ADD graph for Tomato'},
        {label: 'Bounded constant division', example: '345 / 345 · non-negative constants with a quotient up to 13'},
        {label: 'Dual-LUT forms', example: 'maskadd, xorand, andadd, oradd, xoradd, andn, orn'},
      ],
    },
    {
      title: 'Raw Tomato program',
      options: [
        {label: 'Begin with', example: '/run'},
        {label: 'Instructions', example: 'LOAD, STORE, ADD, SUB, AND, OR, XOR, MASKADD, XORAND, ANDADD, ORADD, XORADD, ANDN, ORN, RETURN'},
        {label: 'Aliases', example: 'LI, LD, ST, MOV, CLR'},
      ],
    },
    {
      title: 'Limits',
      options: [
        {label: 'Program', example: '32 instructions maximum'},
        {label: 'Registers', example: 'R0–R7'},
        {label: 'Values', example: '32-bit literals'},
        {label: 'Memory offsets', example: '0–255'},
        {label: 'Not installed', example: '%'},
      ],
    },
    {
      title: 'Where it runs',
      options: [
        {label: 'Physical Tomato', example: 'Only a completed backend hardware result receives this label'},
        {label: 'Virtual Tomato', example: 'Browser execution is explicit, local, and always labeled virtual'},
      ],
    },
  ],
});

export const LEGACY_UNANSWERED_REPLY = 'Try /help. I run bounded integer jobs.';

export function isHelpRequest(value) {
  const text = String(value || '').trim();
  return /^\/help[?.!]*$/i.test(text) || /^(?:help|what can you do)[?.!]*$/i.test(text);
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
