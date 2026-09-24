/* Content tests: lessons, examples, challenges, reference. Run with:  node tests/content.js */
'use strict';
const path = require('path');
const fs = require('fs');
for (const f of ['profiles', 'datatable', 'instructions', 'program', 'engine', 'grader'])
  require(path.join(__dirname, '..', 'js', 'core', f + '.js'));
const contentDir = path.join(__dirname, '..', 'js', 'content');
for (const f of fs.readdirSync(contentDir).filter((f) => f.endsWith('.js')).sort())
  require(path.join(contentDir, f));
const PLC = globalThis.PLC;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.log(`✗ ${name}\n    ${e.message.split('\n').join('\n    ')}`); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

const ML = 'ML1000-16';
const SLC = 'SLC-503';

// Compile a content spec ({rungs, subs}) on a profile; returns error messages.
function compileErrors(spec, profileId) {
  const p = PLC.buildContentProject(spec, profileId);
  const e = new PLC.Engine(p);
  const c = e.compile();
  return c.errors.map((x) => `file ${x.file} rung ${x.rung}: ${x.msg}`);
}

function gradeSpec(spec, testObj, profileId) {
  const prof = PLC.getProfile(profileId);
  const p = PLC.buildContentProject(spec, profileId);
  const e = new PLC.Engine(p);
  const t = profileId === ML ? testObj : PLC.remapTest(testObj, prof);
  return PLC.grade(p, e.dt, t);
}
function failures(r) {
  if (r.error) return r.error;
  return r.steps.filter((s) => !s.ok).slice(0, 3)
    .map((s) => `step "${s.desc}" @${(s.t / 1000).toFixed(2)}s: ` + s.checks.filter((c) => !c.ok).map((c) => c.msg).join('; ')).join('\n');
}

const LESSONS = PLC.LESSONS || [];
const CHALLENGES = PLC.CHALLENGES || [];
const REF = PLC.REFERENCE || {};
const lessonIds = new Set(LESSONS.map((l) => l.id));
const challengeIds = new Set(CHALLENGES.map((c) => c.id));
const exampleIds = new Set();
const sceneIds = new Set(PLC.SCENE_DEFS.map((s) => s.id));

test('content loaded', () => {
  assert(LESSONS.length >= 15, 'expected lessons');
  assert(CHALLENGES.length >= 18, 'expected challenges');
  assert(Object.keys(REF).length >= 40, 'expected reference entries');
});

test('ids are unique', () => {
  const dup = (arr) => arr.filter((x, i) => arr.indexOf(x) !== i);
  assert(!dup(LESSONS.map((l) => l.id)).length, 'duplicate lesson ids ' + dup(LESSONS.map((l) => l.id)));
  assert(!dup(CHALLENGES.map((c) => c.id)).length, 'duplicate challenge ids');
  const ex = LESSONS.flatMap((l) => (l.examples || []).map((e) => e.id));
  assert(!dup(ex).length, 'duplicate example ids ' + dup(ex));
  ex.forEach((x) => exampleIds.add(x));
});

// ---------------- lessons ----------------
for (const L of LESSONS) {
  test(`lesson ${L.id}: fields`, () => {
    for (const k of ['id', 'unit', 'title', 'minutes', 'body']) assert(L[k], `missing ${k}`);
    assert(Array.isArray(L.quiz) && L.quiz.length >= 3 && L.quiz.length <= 5, 'quiz must have 3–5 questions');
    L.quiz.forEach((q, i) => {
      assert(q.q && Array.isArray(q.choices) && q.choices.length >= 2, `quiz ${i} malformed`);
      assert(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length, `quiz ${i} answer index out of range`);
      assert(q.why, `quiz ${i} has no explanation`);
    });
    for (const cid of L.challenges || []) assert(challengeIds.has(cid), `unknown challenge ${cid}`);
  });

  for (const ex of L.examples || []) {
    test(`lesson ${L.id}: example ${ex.id} compiles on ${ML}`, () => {
      assert(sceneIds.has(ex.scene), `unknown scene ${ex.scene}`);
      assert(Array.isArray(ex.rungs) && ex.rungs.length, 'no rungs');
      if (ex.comments) assert(ex.comments.length <= ex.rungs.length, 'more comments than rungs');
      const errs = compileErrors(ex, ML);
      assert(!errs.length, errs.join('\n'));
      const errs2 = compileErrors(ex, SLC);
      assert(!errs2.length, 'on SLC-503: ' + errs2.join('\n'));
    });
  }

  test(`lesson ${L.id}: body ladders, buttons`, () => {
    const body = L.body;
    const re = /<div class="ladder"([^>]*)>/g;
    let m, n = 0;
    while ((m = re.exec(body))) {
      n++;
      const attrs = m[1];
      const rm = /data-rungs="([^"]*)"/.exec(attrs);
      assert(rm, `ladder block ${n} has no data-rungs`);
      const rungs = rm[1].split('|').map((s) => s.trim()).filter(Boolean);
      const dm = /data-desc='([^']*)'/.exec(attrs);
      if (dm) { try { JSON.parse(dm[1]); } catch (e) { throw new Error(`ladder block ${n}: bad data-desc JSON: ${e.message}`); } }
      const prof = PLC.getProfile(ML);
      for (const r of rungs) {
        try { PLC.parseRung(r, prof); } catch (e) { throw new Error(`ladder block ${n}: "${r}" does not parse: ${e.message}`); }
      }
      if (/data-invalid="1"/.test(attrs)) continue;
      // Give JSR targets an empty subroutine file so the block compiles on its own.
      const subs = {};
      for (const r of rungs) for (const j of r.matchAll(/JSR U:(\d+)/g)) subs[j[1]] = [];
      const errs = compileErrors({ rungs, subs }, ML);
      assert(!errs.length, `ladder block ${n} (${rungs.join(' | ')}): ${errs.join('; ')}`);
    }
    for (const b of body.matchAll(/data-example="([^"]+)"/g)) assert(exampleIds.has(b[1]), `unknown example ${b[1]}`);
    for (const b of body.matchAll(/data-challenge="([^"]+)"/g)) assert(challengeIds.has(b[1]), `unknown challenge ${b[1]}`);
    // Cheap HTML sanity: balanced divs
    const open = (body.match(/<div\b/g) || []).length, close = (body.match(/<\/div>/g) || []).length;
    assert(open === close, `unbalanced <div> (${open} open, ${close} close)`);
  });
}

test('unit 2+ lessons have examples and challenges', () => {
  const units = [...new Set(LESSONS.map((l) => l.unit))];
  for (const L of LESSONS) {
    if (units.indexOf(L.unit) === 0) continue;
    assert((L.examples || []).length, `${L.id} has no examples`);
    assert((L.challenges || []).length, `${L.id} has no challenges`);
    assert(/data-challenge=/.test(L.body), `${L.id} body does not link a challenge`);
  }
});

// ---------------- challenges ----------------
for (const C of CHALLENGES) {
  test(`challenge ${C.id}: fields`, () => {
    for (const k of ['id', 'title', 'level', 'lesson', 'scene', 'brief', 'io', 'hints', 'starter', 'solution', 'test']) assert(C[k] !== undefined, `missing ${k}`);
    assert([1, 2, 3].includes(C.level), 'level must be 1–3');
    assert(lessonIds.has(C.lesson), `unknown lesson ${C.lesson}`);
    assert(sceneIds.has(C.scene), `unknown scene ${C.scene}`);
    assert(C.hints.length >= 2 && C.hints.length <= 4, 'need 2–4 hints');
    const L = LESSONS.find((l) => l.id === C.lesson);
    assert(L && (L.challenges || []).includes(C.id), `lesson ${C.lesson} does not list this challenge`);
    // io addresses must parse
    const dt = new PLC.DataTable(PLC.getProfile(ML));
    for (const a of Object.keys(C.io)) dt.parse(a);
    // scene labels: every scene I/O used should exist on the scene (trainer excepted)
    const sc = PLC.getSceneDef(C.scene);
    if (C.scene !== 'trainer') for (const a of Object.keys(C.io)) if (/^[IO]:/.test(a)) assert((sc.inputs[a] || sc.outputs[a]), `${a} is not wired on scene ${C.scene}`);
  });
  const sol = { rungs: C.solution, subs: C.solutionSubs };
  test(`challenge ${C.id}: solution passes on ${ML}`, () => {
    const r = gradeSpec(sol, C.test, ML);
    assert(r.pass, failures(r));
  });
  test(`challenge ${C.id}: solution passes on ${SLC} (remapped I/O)`, () => {
    const r = gradeSpec(sol, C.test, SLC);
    assert(r.pass, failures(r));
  });
  test(`challenge ${C.id}: starter and empty program fail`, () => {
    const st = { rungs: C.starter, subs: C.starterSubs || C.solutionSubs && Object.fromEntries(Object.keys(C.solutionSubs).map((k) => [k, []])) };
    const errs = compileErrors(st, ML);
    assert(!errs.length, 'starter does not compile: ' + errs.join('; '));
    assert(!gradeSpec(st, C.test, ML).pass, 'starter passes the test');
    assert(!gradeSpec({ rungs: [] }, C.test, ML).pass, 'an empty program passes the test');
  });
}

// ---------------- reference ----------------
test('reference covers every ML1000 instruction plus ONS/OSF', () => {
  const need = PLC.getProfile(ML).instructions.concat(['ONS', 'OSF']);
  const missing = need.filter((m) => !REF[m]);
  assert(!missing.length, 'missing: ' + missing.join(', '));
});
for (const [mn, R] of Object.entries(REF)) {
  test(`reference ${mn}`, () => {
    assert(R.summary && R.details, 'needs summary and details');
    assert(Array.isArray(R.pitfalls), 'pitfalls must be an array');
    assert(Array.isArray(R.example) && R.example.length, 'needs an example');
    const prof = ['ONS', 'OSF'].includes(mn) ? 'ML1100' : ML;
    const subs = Object.assign({}, R.exampleSubs);
    for (const r of R.example) for (const j of r.matchAll(/JSR U:(\d+)/g)) if (!subs[j[1]]) subs[j[1]] = [];
    const errs = compileErrors({ rungs: R.example, subs }, prof);
    assert(!errs.length, errs.join('; '));
    const all = R.example.concat(...Object.values(R.exampleSubs || {}));
    assert(all.some((r) => new RegExp(`\\b${mn}\\b`).test(r)), `example does not use ${mn}`);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
