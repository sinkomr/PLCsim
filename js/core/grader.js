/*
 * Challenge grader. Runs the student's program in a private copy of the
 * engine, drives inputs step by step, and checks outputs / data values.
 *
 * test = {
 *   init:  { 'I:0/1': 1 },             // input states before RUN (e.g. NC stop button closed)
 *   watch: ['I:0/0', 'O:0/0', ...],     // signals for the timing chart (default: all used)
 *   steps: [
 *     { desc: 'Press Start', set: {'I:0/0':1}, wait: 100,
 *       expect: {'O:0/0': 1},            // checked at the end of the wait
 *       during: {'O:0/1': 0} },          // must hold on every scan of the wait
 *   ]
 * }
 * Expected values may be a number or {min, max}.
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  // Start the graded run from a clean machine: keep presets and integer
  // setpoints, clear I/O, bits, and timer/counter/control state.
  function cleanData(dt) {
    for (const f of dt.files.values()) {
      if (['I', 'O', 'B'].includes(f.type)) f.data.fill(0);
      if (['T', 'C', 'R'].includes(f.type))
        for (let e = 0; e < f.len; e++) { f.data[e * 3] = 0; f.data[e * 3 + 2] = 0; }
      if (f.type === 'S') {
        f.data[0] = 0; f.data[5] = 0; f.data[6] = 0; f.data[1] &= ~(1 << 13);
      }
    }
  }

  function readValue(eng, ref) {
    if (ref.kind === 'bit') return eng.dt.getBit(ref);
    return eng.dt.getWord(ref);
  }
  function matches(v, exp) {
    if (exp !== null && typeof exp === 'object') {
      if (exp.min !== undefined && v < exp.min) return false;
      if (exp.max !== undefined && v > exp.max) return false;
      return true;
    }
    return v === exp;
  }
  function fmtExp(exp) {
    if (exp !== null && typeof exp === 'object') {
      if (exp.min !== undefined && exp.max !== undefined) return `${exp.min}–${exp.max}`;
      if (exp.min !== undefined) return `≥ ${exp.min}`;
      return `≤ ${exp.max}`;
    }
    return String(exp);
  }

  function grade(project, liveDt, test, labels) {
    const proj = PLC.clone(project);
    const eng = new PLC.Engine(Object.assign(proj, { data: null }));
    if (liveDt) eng.dt.restore(liveDt.snapshot());
    cleanData(eng.dt);
    eng.forces.clear();

    const result = { pass: false, steps: [], trace: { signals: [], samples: [] }, error: null };
    const refOf = (a) => eng.dt.parse(a);

    // Signals for the timing chart
    const watch = (test.watch || []).map((a) => ({ addr: a, ref: refOf(a), label: (labels && labels[a]) || '' }));
    result.trace.signals = watch.map((w) => ({ addr: w.ref.text, label: w.label, bit: w.ref.kind === 'bit' }));
    const sample = (t) => result.trace.samples.push({ t, v: watch.map((w) => readValue(eng, w.ref)) });

    const setInputs = (obj) => {
      for (const [a, v] of Object.entries(obj || {})) {
        const r = refOf(a);
        if (r.file !== 1 || r.kind !== 'bit') throw new Error(`Test error: ${a} is not an input bit`);
        const w = r.word;
        if (v) eng.inputs[w] |= 1 << r.bit; else eng.inputs[w] &= ~(1 << r.bit);
      }
    };

    try {
      setInputs(test.init);
      const m = eng.setMode('RUN');
      if (!m.ok) {
        result.error = 'Your program has errors — fix them (see Verify) before testing:\n' + m.errors.slice(0, 5).map((e) => '• ' + e.msg).join('\n');
        return result;
      }
      let t = 0;
      eng.scan(); t += eng.scanMs; sample(t);
      let allPass = true;
      for (const step of test.steps) {
        setInputs(step.set);
        const wait = step.wait == null ? 50 : step.wait;
        const scans = Math.max(1, Math.round(wait / eng.scanMs));
        const duringFail = [];
        const during = Object.entries(step.during || {}).map(([a, e]) => [refOf(a), e, a]);
        for (let k = 0; k < scans; k++) {
          eng.scan(); t += eng.scanMs;
          if (k % Math.max(1, Math.round(scans / 60)) === 0 || k === scans - 1) sample(t);
          if (eng.fault) break;
          for (const [r, e, a] of during) {
            const v = readValue(eng, r);
            if (!matches(v, e) && !duringFail.find((d) => d.a === a))
              duringFail.push({ a: r.text, v, e, at: t });
          }
        }
        const checks = [];
        if (eng.fault) {
          checks.push({ ok: false, msg: `Processor faulted (${eng.fault.code.toString(16).toUpperCase().padStart(4, '0')}h): ${eng.fault.msg}` });
        } else {
          for (const [a, e] of Object.entries(step.expect || {})) {
            const r = refOf(a);
            const v = readValue(eng, r);
            checks.push({ ok: matches(v, e), msg: `${r.text}${labels && labels[a] ? ' (' + labels[a] + ')' : ''} should be ${fmtExp(e)} — it is ${v}` });
          }
          for (const d of duringFail)
            checks.push({ ok: false, msg: `${d.a}${labels && labels[d.a] ? ' (' + labels[d.a] + ')' : ''} must stay ${fmtExp(d.e)} the whole time, but it was ${d.v} at ${(d.at / 1000).toFixed(2)} s` });
          for (const [r, e, a] of during)
            if (!duringFail.find((d) => d.a === r.text))
              checks.push({ ok: true, msg: `${r.text}${labels && labels[a] ? ' (' + labels[a] + ')' : ''} stayed ${fmtExp(e)}` });
        }
        const ok = checks.every((c) => c.ok);
        allPass = allPass && ok;
        result.steps.push({ desc: step.desc || '', ok, checks, t });
        if (eng.fault) break;
      }
      result.pass = allPass && result.steps.length === test.steps.length;
    } catch (e) {
      result.error = e.message;
    }
    return result;
  }

  PLC.grade = grade;
})(typeof window !== 'undefined' ? window : globalThis);
