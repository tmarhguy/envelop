// Nested Boolean forms → one Dual-LUT f-LUT (g=0, cin=0).
// Index: idx = 4*C + 2*B + A. Companion: tomato docs/isa/lut-nested-fuse.csv.

export const BOOL3 = Object.freeze({
  // and/or/xor × and/or/xor
  XORBC: {f: 'A ^ (B & C)', g: '0', cin: 0, lutA: 0x6A, lutB: 0, outer: 'XOR', inner: 'AND'},
  XORBO: {f: 'A ^ (B | C)', g: '0', cin: 0, lutA: 0x56, lutB: 0, outer: 'XOR', inner: 'OR'},
  XORBX: {f: 'A ^ (B ^ C)', g: '0', cin: 0, lutA: 0x96, lutB: 0, outer: 'XOR', inner: 'XOR'},
  ANDBO: {f: 'A & (B | C)', g: '0', cin: 0, lutA: 0xA8, lutB: 0, outer: 'AND', inner: 'OR'},
  ANDBX: {f: 'A & (B ^ C)', g: '0', cin: 0, lutA: 0x28, lutB: 0, outer: 'AND', inner: 'XOR'},
  ANDBC: {f: 'A & (B & C)', g: '0', cin: 0, lutA: 0x80, lutB: 0, outer: 'AND', inner: 'AND'},
  ORBC:  {f: 'A | (B & C)', g: '0', cin: 0, lutA: 0xEA, lutB: 0, outer: 'OR', inner: 'AND'},
  ORBO:  {f: 'A | (B | C)', g: '0', cin: 0, lutA: 0xFE, lutB: 0, outer: 'OR', inner: 'OR'},
  ORBX:  {f: 'A | (B ^ C)', g: '0', cin: 0, lutA: 0xBE, lutB: 0, outer: 'OR', inner: 'XOR'},
  // nand/nor × and/or/xor/nand/nor/xnor
  NANDAND:  {f: '~(A & (B & C))', g: '0', cin: 0, lutA: 0x7F, lutB: 0, outer: 'NAND', inner: 'AND'},
  NANDOR:   {f: '~(A & (B | C))', g: '0', cin: 0, lutA: 0x57, lutB: 0, outer: 'NAND', inner: 'OR'},
  NANDXOR:  {f: '~(A & (B ^ C))', g: '0', cin: 0, lutA: 0xD7, lutB: 0, outer: 'NAND', inner: 'XOR'},
  NANDNAND: {f: '~(A & ~(B & C))', g: '0', cin: 0, lutA: 0xD5, lutB: 0, outer: 'NAND', inner: 'NAND'},
  NANDNOR:  {f: '~(A & ~(B | C))', g: '0', cin: 0, lutA: 0xFD, lutB: 0, outer: 'NAND', inner: 'NOR'},
  NANDXNOR: {f: '~(A & ~(B ^ C))', g: '0', cin: 0, lutA: 0x7D, lutB: 0, outer: 'NAND', inner: 'XNOR'},
  NORAND:   {f: '~(A | (B & C))', g: '0', cin: 0, lutA: 0x15, lutB: 0, outer: 'NOR', inner: 'AND'},
  NOROR:    {f: '~(A | (B | C))', g: '0', cin: 0, lutA: 0x01, lutB: 0, outer: 'NOR', inner: 'OR'},
  NORXOR:   {f: '~(A | (B ^ C))', g: '0', cin: 0, lutA: 0x41, lutB: 0, outer: 'NOR', inner: 'XOR'},
  NORNAND:  {f: '~(A | ~(B & C))', g: '0', cin: 0, lutA: 0x40, lutB: 0, outer: 'NOR', inner: 'NAND'},
  NORNOR:   {f: '~(A | ~(B | C))', g: '0', cin: 0, lutA: 0x54, lutB: 0, outer: 'NOR', inner: 'NOR'},
  NORXNOR:  {f: '~(A | ~(B ^ C))', g: '0', cin: 0, lutA: 0x14, lutB: 0, outer: 'NOR', inner: 'XNOR'},
  // and/or/xor × nand/nor/xnor
  ANDNAND:  {f: 'A & ~(B & C)', g: '0', cin: 0, lutA: 0x2A, lutB: 0, outer: 'AND', inner: 'NAND'},
  ANDNOR:   {f: 'A & ~(B | C)', g: '0', cin: 0, lutA: 0x02, lutB: 0, outer: 'AND', inner: 'NOR'},
  ANDXNOR:  {f: 'A & ~(B ^ C)', g: '0', cin: 0, lutA: 0x82, lutB: 0, outer: 'AND', inner: 'XNOR'},
  ORNAND:   {f: 'A | ~(B & C)', g: '0', cin: 0, lutA: 0xBF, lutB: 0, outer: 'OR', inner: 'NAND'},
  ORNOR:    {f: 'A | ~(B | C)', g: '0', cin: 0, lutA: 0xAB, lutB: 0, outer: 'OR', inner: 'NOR'},
  ORXNOR:   {f: 'A | ~(B ^ C)', g: '0', cin: 0, lutA: 0xEB, lutB: 0, outer: 'OR', inner: 'XNOR'},
  XORNAND:  {f: 'A ^ ~(B & C)', g: '0', cin: 0, lutA: 0x95, lutB: 0, outer: 'XOR', inner: 'NAND'},
  XORNOR:   {f: 'A ^ ~(B | C)', g: '0', cin: 0, lutA: 0xA9, lutB: 0, outer: 'XOR', inner: 'NOR'},
  XORXNOR:  {f: 'A ^ ~(B ^ C)', g: '0', cin: 0, lutA: 0x69, lutB: 0, outer: 'XOR', inner: 'XNOR'},
});

const OUTER_INNER = Object.freeze(Object.fromEntries(
  Object.entries(BOOL3).map(([op, spec]) => [`${spec.outer}:${spec.inner}`, op]),
));

const COMMUTE = new Set(['XOR', 'AND', 'OR', 'NAND', 'NOR', 'XNOR']);

/** Fuse A ⊗ (B ⊕ C) or (B ⊕ C) ⊗ A into one BOOL3 op when possible. */
function nestArgs(side) {
  if (side?.k === 'bin') return [side.op, side.l, side.r];
  // ~(B | C) counts as NOR(B,C) for Dual-LUT nest spelling after expand.
  if (side?.k === 'not' && side.a?.k === 'bin') {
    const op = {AND: 'NAND', OR: 'NOR', XOR: 'XNOR'}[side.a.op];
    if (op) return [op, side.a.l, side.a.r];
  }
  return null;
}

export function fuseBoolNest(outerOp, left, right) {
  const rightNest = nestArgs(right);
  if (rightNest) {
    const name = OUTER_INNER[`${outerOp}:${rightNest[0]}`];
    if (name) return {k: 'tri', op: name, fn: name.toLowerCase(), args: [left, rightNest[1], rightNest[2]]};
  }
  if (COMMUTE.has(outerOp)) {
    const leftNest = nestArgs(left);
    if (leftNest) {
      const name = OUTER_INNER[`${outerOp}:${leftNest[0]}`];
      if (name) return {k: 'tri', op: name, fn: name.toLowerCase(), args: [right, leftNest[1], leftNest[2]]};
    }
  }
  return null;
}

/** Collapse ~(and/or/xor …) nests that expand from nand/nor/xnor spelling. */
export function fuseNotNest(node) {
  if (!node || node.k !== 'not' || !node.a || node.a.k !== 'bin') return null;
  const inner = node.a;
  const map = {AND: 'NAND', OR: 'NOR', XOR: 'XNOR'};
  const outer = map[inner.op];
  if (!outer) return null;
  const nest = fuseBoolNest(outer, inner.l, inner.r);
  if (nest) return nest;
  // ~(A & B) with plain leaves stays a lowered NOT; no BOOL3 without a nest.
  return null;
}

export const BOOL3_OPS = Object.freeze(Object.keys(BOOL3));
export const NEG_BIN = Object.freeze({NAND: 'AND', NOR: 'OR', XNOR: 'XOR'});
