// Compile-level acceptance for the controlled natural language.
// Consumes tomato/tools/nl_fixtures.json (sibling checkout) so the browser
// compiler stays byte-identical to tomato/tools/remote_compile.py.
// Skips gracefully when the sibling checkout is absent (e.g. static deploy).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CompileError, compile } from './compiler.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(here, '../../../../tomato/tools/nl_fixtures.json'),
  ...['TOMATO_CHECKOUT', 'TOMATO_DIR'].map(k => process.env[k] ? resolve(process.env[k], 'tools/nl_fixtures.json') : null).filter(Boolean),
];
const found = candidates.find(p => { try { return existsSync(p); } catch { return false; } });

test('nl_fixtures: controlled language, understood, fail-closed errors', { skip: !found && 'sibling tomato checkout absent' }, () => {
  const fix = JSON.parse(readFileSync(found, 'utf8'));
  assert.equal(fix.version, 7);
  for (const c of fix.compute) {
    const r = compile(c.input, {fuse: false});
    assert.ok(r, `${c.input}: expected compute, got chat`);
    assert.equal(r.understood, c.understood, `${c.input}: understood`);
    assert.equal(r.canonical, c.canonical, `${c.input}: canonical`);
  }
  for (const c of fix.chat) assert.equal(compile(c.input), null, `${c.input}: expected chat`);
  const browserPromotions = new Set([
    '5 * 3',
    'product of 2 and 3',
    'what is 10 / 2?',
    'ohj yea, you are so good, ok what is 34 - 2345',
    'i can teype gibveradklaeira adkn adihe adn adraioerh 345 + nand(2345, 3534, 235)',
    'whqa it xor of 5 and 3',
  ]);
  for (const c of fix.errors) {
    if (browserPromotions.has(c.input)) continue;
    assert.throws(() => compile(c.input), e => e.message.includes(c.js_error), `${c.input}: expected /${c.js_error}/`);
  }
});

function compileError(input) {
  try {
    compile(input);
    assert.fail(`expected compile error for ${JSON.stringify(input)}`);
  } catch (error) {
    assert.ok(error instanceof CompileError);
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'CompileError');
    assert.equal(typeof error.code, 'string');
    assert.ok(Object.isFrozen(error.details));
    return error;
  }
}

test('structured expression errors retain human-readable messages and safe details', () => {
  const unknown = compileError('/calc 2 squared');
  assert.equal(unknown.code, 'UNKNOWN_TOKEN');
  assert.deepEqual(unknown.details, {
    token: 'squared',
    guidance: 'Try numbers, operators like + - * / & | ^ ~, or /help.',
  });
  assert.match(unknown.message, /Unknown word 'squared'/);

  const malformed = compileError('/calc and(1)');
  assert.equal(malformed.code, 'MALFORMED_EXPRESSION');
  assert.deepEqual(malformed.details, {
    reason: 'wrong-argument-count',
    operation: 'and',
    min: 2,
    max: 8,
    actual: 1,
    recoveredOperands: ['1'],
    recoveredOperators: ['and'],
  });
  assert.match(malformed.message, /two arguments or more/);

  for (const operation of ['%']) {
    const unsupported = compileError(`/calc 7 ${operation} 3`);
    assert.equal(unsupported.code, 'UNSUPPORTED_OPERATION');
    assert.deepEqual(unsupported.details, { operation });
    assert.match(unsupported.message, /is not installed/);
  }
});

test('structured raw /run errors distinguish registers, ranges, and instructions', () => {
  const register = compileError('/run\nR8=1\nRETURN R0');
  assert.equal(register.code, 'INVALID_REGISTER');
  assert.deepEqual(register.details, { register: 'R8', min: 0, max: 7 });
  assert.match(register.message, /R0–R7/);

  const literal = compileError('/run\nR0=4294967296\nRETURN R0');
  assert.equal(literal.code, 'OUT_OF_RANGE');
  assert.deepEqual(literal.details, {
    range: 'literal',
    value: '4294967296',
    min: -2147483648,
    max: 4294967295,
  });
  assert.match(literal.message, /outside 32-bit range/);

  const instruction = compileError('/run\nDIV R0,R1,R2\nRETURN R0');
  assert.equal(instruction.code, 'INVALID_INSTRUCTION');
  assert.deepEqual(instruction.details, {
    instruction: 'DIV',
    reason: 'unsupported',
  });
  assert.match(instruction.message, /Unsupported instruction: DIV/);
});

test('compiled expressions include a safe trace tree while raw programs do not', () => {
  const expression = compile('(23 + 19) & 0x3F');
  assert.deepEqual(expression.ast, {
    type: 'binary',
    operator: 'AND',
    left: {
      type: 'binary',
      operator: 'ADD',
      left: {type: 'literal', value: 23, source: '23'},
      right: {type: 'literal', value: 19, source: '19'},
    },
    right: {type: 'literal', value: 63, source: '0x3F'},
  });
  assert.equal(compile('/run; R0=1; RETURN R0').ast, null);
});

test('partial expressions report safely recovered operands and operators', () => {
  const trailing = compileError('23 +');
  assert.equal(trailing.code, 'MALFORMED_EXPRESSION');
  assert.deepEqual(trailing.details.recoveredOperands, ['23']);
  assert.deepEqual(trailing.details.recoveredOperators, ['+']);

  const call = compileError('and(5,)');
  assert.deepEqual(call.details.recoveredOperands, ['5']);
  assert.deepEqual(call.details.recoveredOperators, ['and']);
});

test('successful output and ordinary-chat classification remain stable', () => {
  assert.deepEqual(compile('23 + 19'), {
    canonical: '/run\nR0=23\nR1=19\nADD R0,R0,R1\nRETURN R0',
    bytes: [1, 1, 0, 0, 0, 0, 23, 1, 1, 0, 0, 0, 19, 2, 0, 0, 1, 0, 48, 0],
    version: 1,
    understood: '23 + 19',
    ast: {
      type: 'binary',
      operator: 'ADD',
      left: {type: 'literal', value: 23, source: '23'},
      right: {type: 'literal', value: 19, source: '19'},
    },
  });
  for (const message of ['Hello Tomato', 'tomatoes are red', 'meet me after lunch']) {
    assert.equal(compile(message), null);
  }
});

test('clear calculations survive harmless conversational filler', () => {
  for (const input of [
    'so, cos so 78 + 34',
    'so what is 78 + 34 equal to?',
    'well, 78 + 34 and all',
    'okay then, actually 78 plus 34 please',
  ]) {
    const result = compile(input);
    assert.equal(result.understood, '78 + 34', input);
    assert.match(result.canonical, /ADD R0,R0,R1\nRETURN R0$/);
  }

  const unknown = compileError('/calc 2 plux 3');
  assert.equal(unknown.details.token, 'plux');
  assert.equal(unknown.details.guidance, 'Closest supported operator: plus.');
  assert.equal(compileError('so what is 8 + equal to?').code, 'MALFORMED_EXPRESSION');
  assert.equal(compileError('/calc 2 squared + 3').details.token, 'squared');
  assert.equal(compileError('xorr of 5 and 3').details.guidance, 'Closest supported operator: xor.');
  const noise = compileError('What about his Henson heheh +* 233');
  assert.doesNotMatch(noise.details.guidance, /Recognized calculation/);
  assert.equal(compile('so what is the weather equal to?'), null);
  assert.equal(compile('cosine is useful'), null);
});

test('complete semantic spans execute without confirmation', () => {
  const subtraction = compile('ohj yea, you are so good, ok what is 34 - 2345');
  assert.equal(subtraction.understood, '34 - 2345');
  assert.match(subtraction.canonical, /SUB R0,R0,R1\nRETURN R0$/);

  const nested = compile('i can teype gibveradklaeira adkn adihe adn adraioerh 345 + nand(2345, 3534, 235)');
  assert.equal(nested.understood, '345 + ~(((2345 & 3534) & 235))');
  assert.match(nested.canonical, /ADD R0,R0,R1\nRETURN R0$/);

  const prefix = compile('What is or 56, 23, 12');
  assert.equal(prefix.understood, '(56 | 23) | 12');
  assert.match(prefix.canonical, /OR R0,R0,R1\nR1=12\nOR R0,R0,R1\nRETURN R0$/);
});

test('constant multiplication lowers to an ADD graph executed by Tomato', () => {
  const result = compile('34 * 3');
  assert.equal(result.understood, '34 * 3');
  assert.equal(result.canonical, [
    '/run',
    'R0=34',
    'OR R1,R0,R0',
    'ADD R1,R1,R1',
    'ADD R1,R1,R0',
    'RETURN R1',
  ].join('\n'));

  assert.equal(compile('product of 2 and 3').understood, '2 * 3');
  assert.equal(compile('times(7, 4)').understood, '7 * 4');

  const dynamic = compileError('/calc R1 * R2');
  assert.equal(dynamic.code, 'UNSUPPORTED_OPERATION');
  assert.deepEqual(dynamic.details, {
    operation: '*',
    reason: 'constant-factor-required',
  });
});

test('bounded constant division lowers to repeated Tomato subtraction', () => {
  const equal = compile('345 / 345');
  assert.equal(equal.understood, '345 / 345');
  assert.equal(equal.canonical, [
    '/run',
    'R0=345',
    'R1=345',
    'R2=0',
    'R3=1',
    'SUB R0,R0,R1',
    'ADD R2,R2,R3',
    'RETURN R2',
  ].join('\n'));

  const floor = compile('7 / 3');
  assert.equal(floor.understood, '7 / 3');
  assert.equal(floor.canonical.match(/^SUB /gm).length, 2);
  assert.equal(floor.canonical.match(/^ADD /gm).length, 2);

  const zero = compileError('1 / 0');
  assert.equal(zero.code, 'MALFORMED_EXPRESSION');
  assert.deepEqual(zero.details, {operation: '/', reason: 'divide-by-zero'});

  const dynamic = compileError('/calc R1 / 2');
  assert.equal(dynamic.code, 'UNSUPPORTED_OPERATION');
  assert.deepEqual(dynamic.details, {
    operation: '/',
    reason: 'non-negative-constants-required',
  });

  const tooLarge = compileError('100 / 2');
  assert.equal(tooLarge.code, 'OUT_OF_RANGE');
  assert.deepEqual(tooLarge.details, {
    range: 'division-quotient',
    value: 50,
    min: 0,
    max: 13,
  });
});

test('32-bit literal boundaries preserve modulo-2^32 machine encoding', () => {
  const min = compile('/run\nR0=-2147483648\nRETURN R0');
  assert.deepEqual(min.bytes, [1, 1, 0, 128, 0, 0, 0, 48, 0]);

  const max = compile('/run\nR0=4294967295\nRETURN R0');
  assert.deepEqual(max.bytes, [1, 1, 0, 255, 255, 255, 255, 48, 0]);

  const wrappingAdd = compile('4294967295 + 1');
  assert.equal(wrappingAdd.canonical, '/run\nR0=4294967295\nR1=1\nADD R0,R0,R1\nRETURN R0');
  assert.deepEqual(wrappingAdd.bytes.slice(0, 13), [1, 1, 0, 255, 255, 255, 255, 1, 1, 0, 0, 0, 1]);

  for (const value of ['-2147483649', '4294967296']) {
    const error = compileError(`/run\nR0=${value}\nRETURN R0`);
    assert.equal(error.code, 'OUT_OF_RANGE');
    assert.equal(error.details.value, value);
  }
});

test('instruction count boundary is deterministic and never skipped', () => {
  const atLimit = `/run\n${Array.from({ length: 31 }, () => 'CLR R0').join('\n')}\nRETURN R0`;
  assert.equal(compile(atLimit).bytes.length, 31 * 6 + 3);

  const overLimit = `/run\n${Array.from({ length: 32 }, () => 'CLR R0').join('\n')}\nRETURN R0`;
  const error = compileError(overLimit);
  assert.equal(error.code, 'OUT_OF_RANGE');
  assert.deepEqual(error.details, {
    range: 'instruction-count',
    value: 33,
    min: 1,
    max: 32,
  });
  assert.match(error.message, /Maximum 32 instructions/);
});

test('source and memory limits report exact safe boundaries', () => {
  assert.equal(compile('x'.repeat(2048)), null);
  const source = compileError('x'.repeat(2049));
  assert.equal(source.code, 'OUT_OF_RANGE');
  assert.deepEqual(source.details, {
    range: 'source-length',
    value: 2049,
    min: 0,
    max: 2048,
  });

  const memory = compile('/run\nLOAD R0,[255]\nRETURN R0');
  assert.deepEqual(memory.bytes, [1, 32, 0, 255, 48, 0]);

  const offset = compileError('/run\nLOAD R0,[256]\nRETURN R0');
  assert.equal(offset.code, 'OUT_OF_RANGE');
  assert.deepEqual(offset.details, {
    range: 'memory-offset',
    value: 256,
    min: 0,
    max: 255,
  });
  assert.match(offset.message, /Memory offsets are 0–255/);
});
