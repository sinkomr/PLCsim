/* Engine unit tests. Run with:  node tests/run.js */
'use strict';
const path = require('path');
for (const f of ['profiles', 'datatable', 'instructions', 'program', 'engine', 'grader'])
  require(path.join(__dirname, '..', 'js', 'core', f + '.js'));
const PLC = globalThis.PLC;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.log(`✗ ${name}\n    ${e.message}`); }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function throws(fn, re) {
  try { fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error('wrong error: ' + e.message); return; }
  throw new Error('expected an error');
}

// Build an engine from rung text lines.
function make(lines, profileId, extraFiles) {
  const p = PLC.newProject(profileId || 'ML1000-16');
  p.files[0].rungs = PLC.parseRungs(lines.join('\n'), PLC.getProfile(p.profileId));
  for (const [num, ls] of Object.entries(extraFiles || {}))
    p.files.push({ num: +num, name: 'SUB', rungs: PLC.parseRungs(ls.join('\n'), PLC.getProfile(p.profileId)) });
  const e = new PLC.Engine(p);
  return e;
}
function run(e) {
  const r = e.setMode('RUN');
  if (!r.ok) throw new Error('compile failed: ' + r.errors.map((x) => x.msg).join('; '));
  return e;
}
const bit = (e, a) => e.dt.getBit(e.dt.parse(a));
const word = (e, a) => e.dt.getWord(e.dt.parse(a));
const setIn = (e, a, v) => { const r = e.dt.parse(a); if (v) e.inputs[r.word] |= 1 << r.bit; else e.inputs[r.word] &= ~(1 << r.bit); };

// ---------------- addressing ----------------
test('address parsing basics', () => {
  const dt = new PLC.DataTable(PLC.getProfile('ML1000-16'));
  eq(dt.parse('i:0/3').text, 'I:0/3');
  eq(dt.parse('O:0/5').text, 'O:0/5');
  eq(dt.parse('B3/21').text, 'B3:1/5');
  eq(dt.parse('T4:0.DN').text, 'T4:0/DN');
  eq(dt.parse('T4:39.ACC').text, 'T4:39.ACC');
  eq(dt.parse('N7:104').kind, 'word');
  eq(dt.parse('S:1/15').text, 'S:1/15');
  eq(dt.parse('C5:0/OV').bit, 12);
  eq(dt.parse('#N7:10').kind, 'file');
  throws(() => dt.parse('T4:40'), /past the end/);
  throws(() => dt.parse('N7:105'), /past the end/);
  throws(() => dt.parse('I:1/0'), /no input in slot 1/);
  throws(() => dt.parse('F8:0'), /does not exist/);
  throws(() => dt.parse('N7:0/16'), /bit must be 0–15/);
  throws(() => dt.parse('T4:0/XX'), /T elements have/);
});
test('ML1000 32-point uses I:0.1 for inputs 16-19', () => {
  const dt = new PLC.DataTable(PLC.getProfile('ML1000-32'));
  eq(dt.parse('I:0.1/3').word, 1);
  throws(() => dt.parse('I:0.2/0'), /only 2 words/);
  eq(dt.ioText('I', 0, 17), 'I:0.1/1');
});
test('SLC rack addressing', () => {
  const dt = new PLC.DataTable(PLC.getProfile('SLC-503'));
  eq(dt.parse('I:1/15').text, 'I:1/15');
  eq(dt.parse('O:2/0').file, 0);
  eq(dt.parse('F8:3').kind, 'float');
  throws(() => dt.parse('I:0/0'), /no input in slot 0/);
});
test('constants', () => {
  eq(PLC.parseConst('0FFh'), 255);
  eq(PLC.parseConst('&HFFFF'), -1);
  eq(PLC.parseConst('&B1010'), 10);
  eq(PLC.parseConst('-12'), -12);
});

// ---------------- text format ----------------
test('rung text round trip', () => {
  const prof = PLC.getProfile('ML1000-16');
  const src = 'SOR BST XIC I:0/0 NXB XIC O:0/0 BND XIO I:0/1 OTE O:0/0 EOR';
  eq(PLC.rungText(PLC.parseRung(src, prof)), src);
  const t = 'SOR XIC I:0/2 TON T4:0 1.0 5 0 EOR';
  eq(PLC.rungText(PLC.parseRung(t, prof)), t);
  throws(() => PLC.parseRung('XIC I:0/0 BST XIC I:0/1 OTE O:0/0', prof), /BND/);
  throws(() => PLC.parseRung('XIC', prof), /needs 1 operand/);
  throws(() => PLC.parseRung('FOO I:0/0', prof), /Unknown/);
  eq(PLC.parseRungs('XIC I:0/0 OTE O:0/0\nXIC I:0/1 OTE O:0/1', prof).length, 2);
});

// ---------------- compile checks ----------------
test('compile catches bad addresses and output order', () => {
  const e = make(['XIC I:0/0 OTE O:0/0 XIC I:0/1']);
  const c = e.compile();
  eq(c.ok, false);
  if (!c.errors.some((x) => /to the left of the outputs/.test(x.msg))) throw new Error('missing order error');
  const e2 = make(['XIC N7:0 OTE O:0/0']);
  if (!e2.compile().errors.some((x) => /needs a bit/.test(x.msg))) throw new Error('missing bit error');
  const e3 = make(['XIC I:0/0 TON T4:0 0.001 10 0']);
  if (!e3.compile().errors.some((x) => /Time base/.test(x.msg))) throw new Error('missing time base error');
  const e4 = make(['XIC I:0/0 JMP Q2:5']);
  if (!e4.compile().errors.some((x) => /no LBL/.test(x.msg))) throw new Error('missing label error');
});

// ---------------- bit logic ----------------
test('seal-in start/stop', () => {
  const e = run(make(['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 OTE O:0/0']));
  setIn(e, 'I:0/1', 1); // NC stop closed
  e.scan(); eq(bit(e, 'O:0/0'), 0);
  setIn(e, 'I:0/0', 1); e.scan(); eq(bit(e, 'O:0/0'), 1, 'start');
  eq(e.getOutput(0, 0), 1, 'physical output');
  setIn(e, 'I:0/0', 0); e.scan(); eq(bit(e, 'O:0/0'), 1, 'sealed');
  setIn(e, 'I:0/1', 0); e.scan(); eq(bit(e, 'O:0/0'), 0, 'stopped');
  setIn(e, 'I:0/1', 1); e.scan(); eq(bit(e, 'O:0/0'), 0, 'stays stopped');
});
test('OTL/OTU and OTE false execution', () => {
  const e = run(make(['XIC I:0/0 OTL B3:0/0', 'XIC I:0/1 OTU B3:0/0', 'XIC I:0/2 OTE B3:0/1']));
  setIn(e, 'I:0/0', 1); setIn(e, 'I:0/2', 1); e.scan();
  eq(bit(e, 'B3:0/0'), 1); eq(bit(e, 'B3:0/1'), 1);
  setIn(e, 'I:0/0', 0); setIn(e, 'I:0/2', 0); e.scan();
  eq(bit(e, 'B3:0/0'), 1, 'latched'); eq(bit(e, 'B3:0/1'), 0, 'OTE off');
  setIn(e, 'I:0/1', 1); e.scan(); eq(bit(e, 'B3:0/0'), 0, 'unlatched');
});
test('OSR true for exactly one scan', () => {
  const e = run(make(['XIC I:0/0 OSR B3:0/0 CTU C5:0 100 0', 'XIC I:0/0 OSR B3:0/1 OTE B3:0/2']));
  setIn(e, 'I:0/0', 1);
  e.scan(); eq(bit(e, 'B3:0/2'), 1);
  e.scan(); eq(bit(e, 'B3:0/2'), 0);
  e.scan(); eq(word(e, 'C5:0.ACC'), 1);
  setIn(e, 'I:0/0', 0); e.scan(); setIn(e, 'I:0/0', 1); e.scan();
  eq(word(e, 'C5:0.ACC'), 2);
});
test('ML-style OSR (output with storage + output bit)', () => {
  const e = run(make(['XIC I:0/0 OSR B3:0/0 B3:0/1'], 'ML1100'));
  setIn(e, 'I:0/0', 1);
  e.scan(); eq(bit(e, 'B3:0/1'), 1);
  e.scan(); eq(bit(e, 'B3:0/1'), 0);
});
test('scan order: later rung sees earlier rung result in the same scan', () => {
  const e = run(make(['XIC B3:0/0 OTE B3:0/2', 'XIC I:0/0 OTE B3:0/0', 'XIC B3:0/0 OTE B3:0/1']));
  setIn(e, 'I:0/0', 1); e.scan();
  eq(bit(e, 'B3:0/1'), 1, 'below');
  eq(bit(e, 'B3:0/2'), 0, 'above waits one scan');
  e.scan(); eq(bit(e, 'B3:0/2'), 1);
});
test('inputs are read once per scan (input image)', () => {
  const e = run(make(['XIC I:0/0 OTE O:0/0']));
  setIn(e, 'I:0/0', 1);
  eq(bit(e, 'I:0/0'), 0, 'not yet scanned');
  e.scan(); eq(bit(e, 'I:0/0'), 1);
});

// ---------------- timers ----------------
test('TON 1.0 s base', () => {
  const e = run(make(['XIC I:0/0 TON T4:0 1.0 5 0']));
  setIn(e, 'I:0/0', 1);
  e.advance(4990);
  eq(bit(e, 'T4:0/DN'), 0); eq(bit(e, 'T4:0/TT'), 1); eq(bit(e, 'T4:0/EN'), 1); eq(word(e, 'T4:0.ACC'), 4);
  e.advance(10);
  eq(bit(e, 'T4:0/DN'), 1); eq(bit(e, 'T4:0/TT'), 0); eq(word(e, 'T4:0.ACC'), 5);
  e.advance(3000); eq(word(e, 'T4:0.ACC'), 5, 'stops at PRE');
  setIn(e, 'I:0/0', 0); e.scan();
  eq(word(e, 'T4:0.ACC'), 0); eq(bit(e, 'T4:0/DN'), 0); eq(bit(e, 'T4:0/EN'), 0);
});
test('TON 0.01 base', () => {
  const e = run(make(['XIC I:0/0 TON T4:1 0.01 150 0']));
  setIn(e, 'I:0/0', 1);
  e.advance(1490); eq(bit(e, 'T4:1/DN'), 0);
  e.advance(10); eq(bit(e, 'T4:1/DN'), 1);
});
test('TOF', () => {
  const e = run(make(['XIC I:0/0 TOF T4:0 1.0 2 0']));
  e.scan(); eq(bit(e, 'T4:0/DN'), 0, 'idle');
  setIn(e, 'I:0/0', 1); e.scan(); eq(bit(e, 'T4:0/DN'), 1);
  setIn(e, 'I:0/0', 0); e.advance(1990); eq(bit(e, 'T4:0/DN'), 1); eq(bit(e, 'T4:0/TT'), 1);
  e.advance(20); eq(bit(e, 'T4:0/DN'), 0); eq(bit(e, 'T4:0/TT'), 0);
});
test('RTO keeps ACC; RES clears', () => {
  const e = run(make(['XIC I:0/0 RTO T4:0 1.0 5 0', 'XIC I:0/1 RES T4:0']));
  setIn(e, 'I:0/0', 1); e.advance(3000);
  setIn(e, 'I:0/0', 0); e.advance(5000); eq(word(e, 'T4:0.ACC'), 3);
  setIn(e, 'I:0/0', 1); e.advance(2000); eq(bit(e, 'T4:0/DN'), 1);
  setIn(e, 'I:0/0', 0); e.advance(100); eq(bit(e, 'T4:0/DN'), 1, 'DN retained');
  setIn(e, 'I:0/1', 1); e.scan(); eq(word(e, 'T4:0.ACC'), 0); eq(bit(e, 'T4:0/DN'), 0);
});
test('negative preset faults 0034h', () => {
  const e = run(make(['XIC I:0/0 TON T4:0 1.0 -1 0']));
  setIn(e, 'I:0/0', 1); e.scan();
  eq(e.mode, 'FAULT'); eq(e.fault.code, 0x34); eq(word(e, 'S:6'), 0x34);
});

// ---------------- counters ----------------
test('CTU/CTD with DN and wrap', () => {
  const e = run(make(['XIC I:0/0 CTU C5:0 3 0', 'XIC I:0/1 CTD C5:0 3 0', 'XIC I:0/2 RES C5:0']));
  const pulse = (a) => { setIn(e, a, 1); e.scan(); setIn(e, a, 0); e.scan(); };
  pulse('I:0/0'); pulse('I:0/0'); eq(word(e, 'C5:0.ACC'), 2); eq(bit(e, 'C5:0/DN'), 0);
  pulse('I:0/0'); eq(bit(e, 'C5:0/DN'), 1);
  pulse('I:0/1'); eq(word(e, 'C5:0.ACC'), 2); eq(bit(e, 'C5:0/DN'), 0);
  setIn(e, 'I:0/0', 1); e.advance(500); eq(word(e, 'C5:0.ACC'), 3, 'held input counts once');
  setIn(e, 'I:0/0', 0); pulse('I:0/2'); eq(word(e, 'C5:0.ACC'), 0);
  e.dt.setWord(e.dt.parse('C5:0.ACC'), 32767);
  pulse('I:0/0'); eq(word(e, 'C5:0.ACC'), -32768); eq(bit(e, 'C5:0/OV'), 1);
  eq(e.mode, 'RUN', 'counter overflow does not fault');
});

// ---------------- math ----------------
test('ADD/SUB/MUL/DIV and flags', () => {
  const e = run(make(['MOV 7 N7:0', 'ADD N7:0 5 N7:1', 'SUB 3 N7:0 N7:2', 'MUL N7:0 3 N7:3', 'DIV N7:0 2 N7:4', 'DIV -7 2 N7:5', 'DIV 5 3 N7:6']));
  e.scan();
  eq(word(e, 'N7:1'), 12); eq(word(e, 'N7:2'), -4); eq(word(e, 'N7:3'), 21);
  eq(word(e, 'N7:4'), 4, '7/2 rounds to 4'); eq(word(e, 'N7:5'), -4); eq(word(e, 'N7:6'), 2);
});
test('overflow clamps and faults 0020h at end of scan', () => {
  const e = run(make(['ADD 32000 1000 N7:0']));
  e.scan();
  eq(word(e, 'N7:0'), 32767); eq(e.mode, 'FAULT'); eq(e.fault.code, 0x20);
  eq(bit(e, 'S:0/1'), 1, 'V flag');
  e.clearFault(); eq(e.mode, 'PROGRAM'); eq(bit(e, 'S:5/0'), 0);
});
test('unlatching S:5/0 on the last rung prevents the fault', () => {
  const e = run(make(['ADD 32000 1000 N7:0', 'OTU S:5/0']));
  e.scan(); eq(e.mode, 'RUN');
});
test('divide by zero', () => {
  const e = run(make(['DIV 5 0 N7:0', 'OTU S:5/0']));
  e.scan(); eq(word(e, 'N7:0'), 32767); eq(bit(e, 'S:0/1'), 1);
});
test('compare instructions', () => {
  const e = run(make(['MOV 10 N7:0', 'LIM 5 N7:0 15 OTE B3:0/0', 'LIM 15 N7:0 5 OTE B3:0/1', 'GEQ N7:0 10 OTE B3:0/2', 'MEQ N7:0 0Fh 26 OTE B3:0/3']));
  e.scan();
  eq(bit(e, 'B3:0/0'), 1); eq(bit(e, 'B3:0/1'), 0); eq(bit(e, 'B3:0/2'), 1); eq(bit(e, 'B3:0/3'), 1);
});
test('MVM / logic', () => {
  const e = run(make(['MOV &HFF00 N7:0', 'MVM 00FFh 0F0Fh N7:0', 'AND 12 10 N7:1', 'OR 12 10 N7:2', 'XOR 12 10 N7:3', 'NOT 0 N7:4']));
  e.scan();
  eq(word(e, 'N7:0') & 0xFFFF, 0xF00F); eq(word(e, 'N7:1'), 8); eq(word(e, 'N7:2'), 14); eq(word(e, 'N7:3'), 6); eq(word(e, 'N7:4'), -1);
});

// ---------------- program control ----------------
test('JMP/LBL skips rungs (outputs freeze)', () => {
  const e = run(make(['XIC I:0/0 JMP Q2:1', 'XIC I:0/1 OTE O:0/0', 'LBL Q2:1 XIC I:0/2 OTE O:0/1']));
  setIn(e, 'I:0/1', 1); e.scan(); eq(bit(e, 'O:0/0'), 1);
  setIn(e, 'I:0/0', 1); setIn(e, 'I:0/1', 0); setIn(e, 'I:0/2', 1); e.scan();
  eq(bit(e, 'O:0/0'), 1, 'skipped rung keeps its output'); eq(bit(e, 'O:0/1'), 1);
});
test('backward JMP loop trips the watchdog', () => {
  const e = run(make(['LBL Q2:0 XIC I:0/0 JMP Q2:0']));
  setIn(e, 'I:0/0', 1); e.scan(); eq(e.mode, 'FAULT'); eq(e.fault.code, 0x22);
});
test('JSR/SBR/RET', () => {
  const e = run(make(['XIC I:0/0 JSR U:3'], 'ML1000-16', { 3: ['SBR', 'XIC I:0/1 RET', 'OTE B3:0/0'] }));
  setIn(e, 'I:0/0', 1); e.scan(); eq(bit(e, 'B3:0/0'), 1);
  setIn(e, 'I:0/1', 1); e.dt.setBit(e.dt.parse('B3:0/0'), 0); e.scan(); eq(bit(e, 'B3:0/0'), 0, 'returned early');
});
test('MCR zone turns OTEs off', () => {
  const e = run(make(['XIC I:0/0 MCR', 'OTE O:0/0', 'MCR', 'OTE O:0/1']));
  e.scan(); eq(bit(e, 'O:0/0'), 0); eq(bit(e, 'O:0/1'), 1);
  setIn(e, 'I:0/0', 1); e.scan(); eq(bit(e, 'O:0/0'), 1);
});
test('first pass bit', () => {
  const e = run(make(['XIC S:1/15 MOV 42 N7:0', 'XIC S:1/15 CTU C5:0 10 0']));
  e.scan(); e.scan(); e.scan();
  eq(word(e, 'N7:0'), 42); eq(word(e, 'C5:0.ACC'), 1);
});

// ---------------- shift / sequencer ----------------
test('BSL shifts on transitions', () => {
  const e = run(make(['XIC I:0/0 BSL #B3:1 R6:0 I:0/1 5']));
  const pulse = () => { setIn(e, 'I:0/0', 1); e.scan(); setIn(e, 'I:0/0', 0); e.scan(); };
  setIn(e, 'I:0/1', 1); pulse(); setIn(e, 'I:0/1', 0); pulse(); pulse();
  eq(word(e, 'B3:1'), 0b100);
  pulse(); pulse(); pulse(); eq(bit(e, 'R6:0/UL'), 1, 'shifted out'); eq(word(e, 'B3:1'), 0);
});
test('SQO steps and wraps', () => {
  const e = run(make(['MOV 1 N7:1', 'MOV 2 N7:2', 'MOV 4 N7:3', 'XIC I:0/0 SQO #N7:0 0007h O:0.0 R6:0 3 0']));
  const pulse = () => { setIn(e, 'I:0/0', 1); e.scan(); setIn(e, 'I:0/0', 0); e.scan(); };
  pulse(); eq(word(e, 'O:0') & 7, 1);
  pulse(); eq(word(e, 'O:0') & 7, 2);
  pulse(); eq(word(e, 'O:0') & 7, 4); eq(bit(e, 'R6:0/DN'), 1);
  pulse(); eq(word(e, 'O:0') & 7, 1, 'wrapped'); eq(word(e, 'R6:0.POS'), 1);
});

// ---------------- forces ----------------
test('forces override inputs and outputs', () => {
  const e = run(make(['XIC I:0/0 OTE O:0/0']));
  e.setForce('I:0/0', 1); e.scan(); eq(bit(e, 'O:0/0'), 1);
  e.setForce('O:0/1', 1); e.scan(); eq(e.getOutput(0, 1), 1); eq(bit(e, 'S:1/6'), 1);
});

// ---------------- grader ----------------
const START_STOP = {
  init: { 'I:0/1': 1 },
  watch: ['I:0/0', 'I:0/1', 'O:0/0'],
  steps: [
    { desc: 'idle', wait: 100, expect: { 'O:0/0': 0 } },
    { desc: 'press start', set: { 'I:0/0': 1 }, wait: 100, expect: { 'O:0/0': 1 } },
    { desc: 'release start', set: { 'I:0/0': 0 }, wait: 500, during: { 'O:0/0': 1 } },
    { desc: 'press stop', set: { 'I:0/1': 0 }, wait: 100, expect: { 'O:0/0': 0 } },
  ],
};
test('grader passes a correct program', () => {
  const e = make(['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 OTE O:0/0']);
  const r = PLC.grade(e.project, e.dt, START_STOP);
  eq(r.error, null); eq(r.pass, true, JSON.stringify(r.steps.filter((s) => !s.ok)));
  if (r.trace.samples.length < 5) throw new Error('no trace');
});
test('grader fails a program without seal-in', () => {
  const e = make(['XIC I:0/0 XIC I:0/1 OTE O:0/0']);
  const r = PLC.grade(e.project, e.dt, START_STOP);
  eq(r.pass, false); eq(r.steps[2].ok, false);
});
test('grader reports compile errors', () => {
  const e = make(['XIC I:9/0 OTE O:0/0']);
  const r = PLC.grade(e.project, e.dt, START_STOP);
  if (!/errors/.test(r.error || '')) throw new Error('expected error');
});

// ---------------- verify / lint ----------------
require(path.join(__dirname, '..', 'js', 'core', 'lint.js'));
test('lint warns about double coils, stray latches, shared one-shots, unwired I/O', () => {
  const e = make(['XIC I:0/0 OTE O:0/0', 'XIC I:0/1 OTE O:0/0', 'XIC I:0/2 OTL B3:0/0', 'XIC I:0/3 OSR B3:1/0 OTE B3:1/0', 'XIC I:0/12 OTE O:0/1']);
  const msgs = PLC.lint(e.project, e.dt, e.profile).issues.map((i) => i.msg).join('\n');
  for (const re of [/double coil/, /never unlatched/, /One-shot storage bit/, /I:0\/12 is not wired/])
    if (!re.test(msgs)) throw new Error('missing warning ' + re + '\n' + msgs);
});
test('lint is quiet on a clean program', () => {
  const e = make(['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 OTE O:0/0']);
  eq(PLC.lint(e.project, e.dt, e.profile).issues.length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
