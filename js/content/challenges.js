/*
 * Challenges: customer-style specs graded by PLC.grade().
 *
 * Challenge fields:
 *   id, title, level (1 easy … 3 hard), lesson (lesson id), scene (scene id)
 *   brief     HTML task description
 *   io        {address: label} for every address the student should use
 *   hints     progressive hints (HTML strings)
 *   starter   rung strings preloaded into LAD 2 (MAIN)
 *   solution  reference rung strings for LAD 2 (MAIN)
 *   starterSubs / solutionSubs  optional {fileNumber: [rung strings]} for
 *             subroutine files (LAD 3, LAD 4 …)
 *   test      grader test (see js/core/grader.js)
 *
 * All addresses are written for the MicroLogix 1000. Use
 * PLC.buildContentProject(…, profileId) and PLC.remapTest(test, profile) to
 * move them to another controller's I/O slots.
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  // ---------------- helpers shared by lessons, challenges and the UI ----------------

  // Build a project from content rung text.
  //   spec = { name, rungs:[text], comments:[text], subs:{3:[text]}, subNames:{3:'AUTO'}, desc:{addr:label} }
  PLC.buildContentProject = function (spec, profileId) {
    const profile = PLC.getProfile(profileId || PLC.DEFAULT_PROFILE);
    const remap = (t) => PLC.remapText(t, profile);
    const mk = (list, comments) =>
      (list && list.length ? list : ['']).map((t, i) =>
        Object.assign(PLC.parseRung(remap(t), profile), { comment: (comments && comments[i]) || '' }));
    const p = PLC.newProject(profile.id);
    p.name = spec.name || spec.title || 'Untitled';
    p.files[0].rungs = mk(spec.rungs, spec.comments);
    for (const [num, list] of Object.entries(spec.subs || {}))
      p.files.push({ num: +num, name: (spec.subNames && spec.subNames[num]) || 'SUB' + num, rungs: mk(list) });
    p.files.sort((a, b) => a.num - b.num);
    p.desc = PLC.remapKeys(spec.desc || spec.io || {}, profile);
    return p;
  };

  // Copy a grader test with every ML1000 I/O address moved to the profile's slots.
  PLC.remapTest = function (test, profile) {
    const t = JSON.parse(JSON.stringify(test));
    t.init = PLC.remapKeys(t.init, profile);
    if (t.watch) t.watch = t.watch.map((a) => PLC.remapIO(a, profile));
    t.steps = t.steps.map((s) => Object.assign(s, {
      set: PLC.remapKeys(s.set, profile),
      expect: PLC.remapKeys(s.expect, profile),
      during: PLC.remapKeys(s.during, profile),
    }));
    return t;
  };

  PLC.getChallenge = (id) => (PLC.CHALLENGES || []).find((c) => c.id === id) || null;

  // ---------------- test-building shortcuts ----------------
  // A momentary press: button on for `on` ms, then released for `off` ms.
  function press(desc, addr, opts) {
    const o = Object.assign({ on: 100, off: 200, released: 0 }, opts || {});
    return [
      { desc, set: { [addr]: o.released ? 0 : 1 }, wait: o.on, expect: o.expectPressed, during: o.duringPressed },
      { desc: o.releaseDesc || 'Release the button', set: { [addr]: o.released ? 1 : 0 }, wait: o.off, expect: o.expect, during: o.during },
    ];
  }
  // n pulses of a sensor; `each(k)` may return extra fields for pulse k (1-based)
  function pulses(desc, addr, n, on, off, last) {
    const out = [];
    for (let k = 1; k <= n; k++) {
      out.push({ desc: `${desc} (${k} of ${n}) — beam blocked`, set: { [addr]: 1 }, wait: on });
      out.push(Object.assign({ desc: `${desc} (${k} of ${n}) — beam clear`, set: { [addr]: 0 }, wait: off }, k === n ? last || {} : {}));
    }
    return out;
  }

  // Common I/O label sets (copied from scene-defs.js)
  const MOTOR_IO = {
    'I:0/0': 'START push button (NO)',
    'I:0/1': 'STOP push button (NC)',
    'I:0/2': 'Overload relay contact (NC — 1 when healthy)',
    'I:0/3': 'JOG push button (NO)',
    'O:0/0': 'Motor starter M1',
    'O:0/1': 'RUNNING light',
    'O:0/2': 'STOPPED light',
    'O:0/3': 'OVERLOAD light',
  };
  const TRAFFIC_IO = {
    'I:0/0': 'System ON switch',
    'O:0/0': 'N–S RED',
    'O:0/1': 'N–S YELLOW',
    'O:0/2': 'N–S GREEN',
    'O:0/3': 'E–W RED',
    'O:0/4': 'E–W YELLOW',
    'O:0/5': 'E–W GREEN',
  };
  const TRAFFIC_WATCH = ['I:0/0', 'O:0/0', 'O:0/1', 'O:0/2', 'O:0/3', 'O:0/4', 'O:0/5'];
  const NS_GREEN = { 'O:0/0': 0, 'O:0/1': 0, 'O:0/2': 1, 'O:0/3': 1, 'O:0/4': 0, 'O:0/5': 0 };
  const NS_YELLOW = { 'O:0/0': 0, 'O:0/1': 1, 'O:0/2': 0, 'O:0/3': 1, 'O:0/4': 0, 'O:0/5': 0 };
  const EW_GREEN = { 'O:0/0': 1, 'O:0/1': 0, 'O:0/2': 0, 'O:0/3': 0, 'O:0/4': 0, 'O:0/5': 1 };
  const EW_YELLOW = { 'O:0/0': 1, 'O:0/1': 0, 'O:0/2': 0, 'O:0/3': 0, 'O:0/4': 1, 'O:0/5': 0 };
  const ALL_RED = { 'O:0/0': 1, 'O:0/1': 0, 'O:0/2': 0, 'O:0/3': 1, 'O:0/4': 0, 'O:0/5': 0 };

  // 3-wire start/stop test used by two challenges
  const START_STOP_TEST = {
    init: { 'I:0/1': 1, 'I:0/2': 1 },
    watch: ['I:0/0', 'I:0/1', 'I:0/2', 'O:0/0', 'O:0/1', 'O:0/2', 'O:0/3'],
    steps: [
      { desc: 'Power up with nothing pressed — the motor must be off and the STOPPED light on', wait: 200,
        expect: { 'O:0/0': 0, 'O:0/1': 0, 'O:0/2': 1, 'O:0/3': 0 } },
      { desc: 'Press START — the motor starts and the RUNNING light comes on', set: { 'I:0/0': 1 }, wait: 100,
        expect: { 'O:0/0': 1, 'O:0/1': 1, 'O:0/2': 0 } },
      { desc: 'Release START — the motor must keep running (seal-in)', set: { 'I:0/0': 0 }, wait: 1000,
        during: { 'O:0/0': 1 } },
      { desc: 'Press STOP — the motor stops and the STOPPED light comes on', set: { 'I:0/1': 0 }, wait: 100,
        expect: { 'O:0/0': 0, 'O:0/1': 0, 'O:0/2': 1 } },
      { desc: 'Release STOP — the motor must stay stopped', set: { 'I:0/1': 1 }, wait: 500, during: { 'O:0/0': 0 } },
      { desc: 'Press START again', set: { 'I:0/0': 1 }, wait: 100, expect: { 'O:0/0': 1 } },
      { desc: 'Release START', set: { 'I:0/0': 0 }, wait: 200, expect: { 'O:0/0': 1 } },
      { desc: 'The overload trips (its contact opens) — the motor stops and the OVERLOAD light comes on', set: { 'I:0/2': 0 }, wait: 100,
        expect: { 'O:0/0': 0, 'O:0/1': 0, 'O:0/3': 1 } },
      { desc: 'The overload is reset — the motor must NOT restart by itself', set: { 'I:0/2': 1 }, wait: 500,
        during: { 'O:0/0': 0 }, expect: { 'O:0/3': 0 } },
      { desc: 'Hold START and STOP at the same time — STOP must win', set: { 'I:0/0': 1, 'I:0/1': 0 }, wait: 300,
        during: { 'O:0/0': 0 } },
      { desc: 'Release both buttons — still stopped', set: { 'I:0/0': 0, 'I:0/1': 1 }, wait: 300, during: { 'O:0/0': 0 } },
    ],
  };
  const START_STOP_SOLUTION = [
    'BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIC I:0/2 OTE O:0/0',
    'XIC O:0/0 OTE O:0/1',
    'XIO O:0/0 OTE O:0/2',
    'XIO I:0/2 OTE O:0/3',
  ];

  // BSL reject tracking pattern (1 = bad part inspected on that index pulse)
  const BAD = [0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0];

  PLC.CHALLENGES = [
    // ================= Unit 2: basic logic =================
    {
      id: 'c-light-switch',
      title: 'Pilot lights on a selector switch',
      level: 1,
      lesson: 'xic-xio-ote',
      scene: 'trainer',
      brief: `<p>A machine has a two-position selector switch and two pilot lights on its panel.</p>
<ul>
<li>When the selector switch <code>I:0/0</code> is <strong>ON</strong>, the green RUN light <code>O:0/0</code> must be on.</li>
<li>When the selector switch is <strong>OFF</strong>, the red OFF light <code>O:0/1</code> must be on instead.</li>
<li>Exactly one light is on at any time.</li>
</ul>`,
      io: { 'I:0/0': 'Selector switch', 'O:0/0': 'RUN light (green)', 'O:0/1': 'OFF light (red)' },
      hints: [
        'You need two rungs — one for each light.',
        'An <code>XIC</code> is true when its bit is 1; an <code>XIO</code> is true when its bit is 0.',
        'Rung 0: <code>XIC I:0/0 OTE O:0/0</code>. What instruction examines the same switch for the OFF light?',
      ],
      starter: [],
      solution: ['XIC I:0/0 OTE O:0/0', 'XIO I:0/0 OTE O:0/1'],
      test: {
        watch: ['I:0/0', 'O:0/0', 'O:0/1'],
        steps: [
          { desc: 'Switch OFF — only the red OFF light is on', wait: 200, expect: { 'O:0/0': 0, 'O:0/1': 1 } },
          { desc: 'Turn the switch ON — only the green RUN light is on', set: { 'I:0/0': 1 }, wait: 200, expect: { 'O:0/0': 1, 'O:0/1': 0 } },
          { desc: 'Turn the switch OFF again', set: { 'I:0/0': 0 }, wait: 200, expect: { 'O:0/0': 0, 'O:0/1': 1 } },
        ],
      },
    },
    {
      id: 'c-nc-stop',
      title: 'Jog with a normally-closed STOP',
      level: 1,
      lesson: 'nc-stop',
      scene: 'motor',
      brief: `<p>The maintenance crew wants to inch a conveyor with the JOG button. The STOP button is a <strong>normally-closed</strong> push button, so its input is 1 when nobody touches it.</p>
<ul>
<li>The motor <code>O:0/0</code> runs only while JOG <code>I:0/3</code> is held down <em>and</em> STOP is not pressed.</li>
<li>Pressing STOP stops the motor immediately, even if JOG is still held.</li>
<li>If the STOP button's wire breaks (input reads 0), the motor must not run at all.</li>
<li>The STOPPED light <code>O:0/2</code> is on whenever the motor is not running.</li>
</ul>`,
      io: { 'I:0/1': MOTOR_IO['I:0/1'], 'I:0/3': MOTOR_IO['I:0/3'], 'O:0/0': MOTOR_IO['O:0/0'], 'O:0/2': MOTOR_IO['O:0/2'] },
      hints: [
        'Look at the input light for <code>I:0/1</code> while nobody touches STOP: it is ON, because the contact is closed.',
        'You want the rung to be true while <code>I:0/1</code> is 1 (not pressed). Which instruction is true when the bit is 1?',
        'Motor rung: <code>XIC I:0/3 XIC I:0/1 OTE O:0/0</code>. The STOPPED light examines the motor bit.',
      ],
      starter: ['XIC I:0/3 XIO I:0/1 OTE O:0/0'],
      solution: ['XIC I:0/3 XIC I:0/1 OTE O:0/0', 'XIO O:0/0 OTE O:0/2'],
      test: {
        init: { 'I:0/1': 1, 'I:0/2': 1 },
        watch: ['I:0/3', 'I:0/1', 'O:0/0', 'O:0/2'],
        steps: [
          { desc: 'Nothing pressed — motor off, STOPPED light on', wait: 200, expect: { 'O:0/0': 0, 'O:0/2': 1 } },
          { desc: 'Hold JOG — the motor runs', set: { 'I:0/3': 1 }, wait: 300, expect: { 'O:0/0': 1, 'O:0/2': 0 } },
          { desc: 'Press STOP while still holding JOG — the motor stops at once', set: { 'I:0/1': 0 }, wait: 300, during: { 'O:0/0': 0 }, expect: { 'O:0/2': 1 } },
          { desc: 'Release STOP (JOG still held) — the motor runs again', set: { 'I:0/1': 1 }, wait: 300, expect: { 'O:0/0': 1 } },
          { desc: 'Release JOG — the motor stops', set: { 'I:0/3': 0 }, wait: 300, expect: { 'O:0/0': 0, 'O:0/2': 1 } },
          { desc: 'The STOP wire breaks (input goes to 0) and someone holds JOG — the motor must not run', set: { 'I:0/1': 0, 'I:0/3': 1 }, wait: 500, during: { 'O:0/0': 0 } },
        ],
      },
    },
    {
      id: 'c-logic-gates',
      title: 'Build the logic gates',
      level: 2,
      lesson: 'logic',
      scene: 'trainer',
      brief: `<p>Use the trainer's switches as logic inputs A = <code>I:0/0</code>, B = <code>I:0/1</code> and C = <code>I:0/2</code>, and build four gates:</p>
<table class="tbl"><tr><th>Output</th><th>Function</th></tr>
<tr><td><code>O:0/0</code></td><td>A AND B</td></tr>
<tr><td><code>O:0/1</code></td><td>A OR B</td></tr>
<tr><td><code>O:0/2</code></td><td>NOT C</td></tr>
<tr><td><code>O:0/3</code></td><td>A XOR B (on when exactly one of A, B is on)</td></tr></table>`,
      io: { 'I:0/0': 'Switch A', 'I:0/1': 'Switch B', 'I:0/2': 'Switch C', 'O:0/0': 'A AND B', 'O:0/1': 'A OR B', 'O:0/2': 'NOT C', 'O:0/3': 'A XOR B' },
      hints: [
        'AND = contacts in series. OR = contacts in parallel (a branch: <code>BST … NXB … BND</code>). NOT = an <code>XIO</code>.',
        'XOR means "A and not B" OR "not A and B" — two series paths in parallel.',
        'XOR rung: <code>BST XIC I:0/0 XIO I:0/1 NXB XIO I:0/0 XIC I:0/1 BND OTE O:0/3</code>',
      ],
      starter: [],
      solution: [
        'XIC I:0/0 XIC I:0/1 OTE O:0/0',
        'BST XIC I:0/0 NXB XIC I:0/1 BND OTE O:0/1',
        'XIO I:0/2 OTE O:0/2',
        'BST XIC I:0/0 XIO I:0/1 NXB XIO I:0/0 XIC I:0/1 BND OTE O:0/3',
      ],
      test: {
        watch: ['I:0/0', 'I:0/1', 'I:0/2', 'O:0/0', 'O:0/1', 'O:0/2', 'O:0/3'],
        steps: [
          { desc: 'A=0 B=0 C=0', set: { 'I:0/0': 0, 'I:0/1': 0, 'I:0/2': 0 }, wait: 100, expect: { 'O:0/0': 0, 'O:0/1': 0, 'O:0/2': 1, 'O:0/3': 0 } },
          { desc: 'A=1 B=0 C=0', set: { 'I:0/0': 1 }, wait: 100, expect: { 'O:0/0': 0, 'O:0/1': 1, 'O:0/2': 1, 'O:0/3': 1 } },
          { desc: 'A=0 B=1 C=1', set: { 'I:0/0': 0, 'I:0/1': 1, 'I:0/2': 1 }, wait: 100, expect: { 'O:0/0': 0, 'O:0/1': 1, 'O:0/2': 0, 'O:0/3': 1 } },
          { desc: 'A=1 B=1 C=1', set: { 'I:0/0': 1 }, wait: 100, expect: { 'O:0/0': 1, 'O:0/1': 1, 'O:0/2': 0, 'O:0/3': 0 } },
          { desc: 'A=1 B=1 C=0', set: { 'I:0/2': 0 }, wait: 100, expect: { 'O:0/0': 1, 'O:0/1': 1, 'O:0/2': 1, 'O:0/3': 0 } },
        ],
      },
    },
    {
      id: 'c-start-stop',
      title: '3-wire start/stop with overload',
      level: 2,
      lesson: 'seal-in',
      scene: 'motor',
      brief: `<p>Program the classic 3-wire motor control for conveyor motor M1.</p>
<ul>
<li>Pressing the momentary START button starts the motor, and it keeps running after START is released.</li>
<li>Pressing STOP (a normally-closed button) stops it. STOP must win if both buttons are held.</li>
<li>If the overload relay trips (its NC contact <code>I:0/2</code> opens → 0), the motor stops, and it must <strong>not</strong> restart by itself when the overload is reset.</li>
<li>RUNNING light on while the motor runs; STOPPED light on while it doesn't; OVERLOAD light on while the overload contact is open.</li>
</ul>`,
      io: { 'I:0/0': MOTOR_IO['I:0/0'], 'I:0/1': MOTOR_IO['I:0/1'], 'I:0/2': MOTOR_IO['I:0/2'], 'O:0/0': MOTOR_IO['O:0/0'], 'O:0/1': MOTOR_IO['O:0/1'], 'O:0/2': MOTOR_IO['O:0/2'], 'O:0/3': MOTOR_IO['O:0/3'] },
      hints: [
        'The starter rung runs the motor only while START is held. It needs a <em>seal-in</em> branch around START.',
        'Put <code>XIC O:0/0</code> in parallel with <code>XIC I:0/0</code>. STOP and the overload go in series, to the right of the branch.',
        'Both STOP and the overload are NC devices — examine them with <code>XIC</code>.',
        'Lights: <code>XIC O:0/0 OTE O:0/1</code>, <code>XIO O:0/0 OTE O:0/2</code>, <code>XIO I:0/2 OTE O:0/3</code>.',
      ],
      starter: ['XIC I:0/0 OTE O:0/0'],
      solution: START_STOP_SOLUTION,
      test: START_STOP_TEST,
    },
    {
      id: 'c-jog',
      title: 'Run and jog',
      level: 2,
      lesson: 'seal-in',
      scene: 'motor',
      brief: `<p>Add a JOG function to the start/stop station.</p>
<ul>
<li>START / STOP / overload work as in a normal 3-wire circuit: START starts M1 and it stays running.</li>
<li>Holding JOG <code>I:0/3</code> runs M1 <strong>only while JOG is held</strong>. Releasing JOG stops the motor (if it was not already running from START) — jog must never seal in.</li>
<li>STOP and the overload stop the motor in both modes; jog does nothing while STOP is pressed or the overload is tripped.</li>
</ul>`,
      io: { 'I:0/0': MOTOR_IO['I:0/0'], 'I:0/1': MOTOR_IO['I:0/1'], 'I:0/2': MOTOR_IO['I:0/2'], 'I:0/3': MOTOR_IO['I:0/3'], 'O:0/0': MOTOR_IO['O:0/0'], 'B3:0/0': 'RUN latch (internal bit)' },
      hints: [
        'The starter program has the jog button in parallel with the seal-in contact. Load it and try: once JOG is pressed, the motor seals in!',
        'The trick: seal in an <em>internal bit</em> (<code>B3:0/0</code>) instead of the motor output. The seal contact then cannot be closed by jogging.',
        'Rung 0: <code>BST XIC I:0/0 NXB XIC B3:0/0 BND XIC I:0/1 XIC I:0/2 OTE B3:0/0</code>. Rung 1 runs the motor from <code>B3:0/0</code> OR JOG, in series with STOP and the overload.',
      ],
      starter: ['BST XIC I:0/0 NXB XIC O:0/0 NXB XIC I:0/3 BND XIC I:0/1 XIC I:0/2 OTE O:0/0'],
      solution: [
        'BST XIC I:0/0 NXB XIC B3:0/0 BND XIC I:0/1 XIC I:0/2 OTE B3:0/0',
        'BST XIC B3:0/0 NXB XIC I:0/3 BND XIC I:0/1 XIC I:0/2 OTE O:0/0',
      ],
      test: {
        init: { 'I:0/1': 1, 'I:0/2': 1 },
        watch: ['I:0/0', 'I:0/1', 'I:0/3', 'O:0/0'],
        steps: [
          { desc: 'Nothing pressed — motor off', wait: 200, expect: { 'O:0/0': 0 } },
          { desc: 'Hold JOG — the motor runs', set: { 'I:0/3': 1 }, wait: 500, expect: { 'O:0/0': 1 } },
          { desc: 'Release JOG — the motor must stop and stay stopped', set: { 'I:0/3': 0 }, wait: 800, during: { 'O:0/0': 0 } },
          { desc: 'Press START — the motor runs', set: { 'I:0/0': 1 }, wait: 100, expect: { 'O:0/0': 1 } },
          { desc: 'Release START — the motor keeps running', set: { 'I:0/0': 0 }, wait: 500, during: { 'O:0/0': 1 } },
          { desc: 'Press STOP — the motor stops', set: { 'I:0/1': 0 }, wait: 100, expect: { 'O:0/0': 0 } },
          { desc: 'Release STOP', set: { 'I:0/1': 1 }, wait: 300, during: { 'O:0/0': 0 } },
          { desc: 'Hold JOG while STOP is pressed — nothing runs', set: { 'I:0/1': 0, 'I:0/3': 1 }, wait: 300, during: { 'O:0/0': 0 } },
          { desc: 'Release both', set: { 'I:0/1': 1, 'I:0/3': 0 }, wait: 300, during: { 'O:0/0': 0 } },
          { desc: 'Trip the overload and hold JOG — nothing runs', set: { 'I:0/2': 0, 'I:0/3': 1 }, wait: 300, during: { 'O:0/0': 0 } },
          { desc: 'Reset the overload, release JOG', set: { 'I:0/2': 1, 'I:0/3': 0 }, wait: 300, during: { 'O:0/0': 0 } },
          { desc: 'Jog once more — it still works', set: { 'I:0/3': 1 }, wait: 300, expect: { 'O:0/0': 1 } },
          { desc: 'Release JOG', set: { 'I:0/3': 0 }, wait: 300, expect: { 'O:0/0': 0 } },
        ],
      },
    },
    {
      id: 'c-alarm-latch',
      title: 'Latched high-temperature alarm',
      level: 1,
      lesson: 'latch-oneshot',
      scene: 'trainer',
      brief: `<p>An oven has a high-temperature switch. Operators often miss short over-temperature events, so the alarm must be <strong>latched</strong>.</p>
<ul>
<li>The HOT NOW light <code>O:0/1</code> simply follows the temperature switch <code>I:0/0</code>.</li>
<li>The ALARM light <code>O:0/0</code> turns on as soon as the switch turns on, and <strong>stays on</strong> after the temperature returns to normal.</li>
<li>Pressing RESET <code>I:0/1</code> turns the ALARM light off — but only if the temperature is back to normal. While it is still hot, RESET does nothing.</li>
</ul>`,
      io: { 'I:0/0': 'High-temperature switch (1 = too hot)', 'I:0/1': 'RESET push button', 'O:0/0': 'ALARM light (latched)', 'O:0/1': 'HOT NOW light' },
      hints: [
        'Use <code>OTL O:0/0</code> to turn the alarm on and <code>OTU O:0/0</code> to turn it off.',
        'The unlatch rung needs RESET pressed <em>and</em> the temperature switch off.',
        'Unlatch rung: <code>XIC I:0/1 XIO I:0/0 OTU O:0/0</code>',
      ],
      starter: [],
      solution: ['XIC I:0/0 OTL O:0/0', 'XIC I:0/1 XIO I:0/0 OTU O:0/0', 'XIC I:0/0 OTE O:0/1'],
      test: {
        watch: ['I:0/0', 'I:0/1', 'O:0/0', 'O:0/1'],
        steps: [
          { desc: 'Normal temperature — no alarm', wait: 200, expect: { 'O:0/0': 0, 'O:0/1': 0 } },
          { desc: 'Temperature goes high — ALARM and HOT NOW light', set: { 'I:0/0': 1 }, wait: 200, expect: { 'O:0/0': 1, 'O:0/1': 1 } },
          { desc: 'Temperature back to normal — ALARM must stay on', set: { 'I:0/0': 0 }, wait: 1000, during: { 'O:0/0': 1 }, expect: { 'O:0/1': 0 } },
          ...press('Press RESET — the alarm clears', 'I:0/1', { expectPressed: { 'O:0/0': 0 }, during: { 'O:0/0': 0 }, off: 500, releaseDesc: 'Release RESET — the alarm stays off' }),
          { desc: 'Temperature goes high again', set: { 'I:0/0': 1 }, wait: 200, expect: { 'O:0/0': 1 } },
          { desc: 'Press RESET while it is still hot — the alarm must stay on', set: { 'I:0/1': 1 }, wait: 300, during: { 'O:0/0': 1 } },
          { desc: 'Release RESET', set: { 'I:0/1': 0 }, wait: 200, expect: { 'O:0/0': 1 } },
          { desc: 'Temperature normal again — alarm still latched', set: { 'I:0/0': 0 }, wait: 300, during: { 'O:0/0': 1 } },
          { desc: 'Press RESET — now it clears', set: { 'I:0/1': 1 }, wait: 200, expect: { 'O:0/0': 0 } },
        ],
      },
    },
    {
      id: 'c-toggle',
      title: 'Push-on / push-off with one button',
      level: 2,
      lesson: 'latch-oneshot',
      scene: 'trainer',
      brief: `<p>The customer wants a single push button to work like a light switch in a stairwell:</p>
<ul>
<li>Press <code>I:0/0</code> once — the light <code>O:0/0</code> turns on and stays on.</li>
<li>Press it again — the light turns off and stays off.</li>
<li>Holding the button down for a long time must <strong>not</strong> make the light flicker or change again.</li>
</ul>`,
      io: { 'I:0/0': 'Push button (NO)', 'O:0/0': 'Light', 'B3:0/0': 'OSR storage bit', 'B3:0/1': 'One-scan "pressed" pulse' },
      hints: [
        'Without a one-shot, the toggle logic flips the light every scan while the button is held (100 times a second).',
        'The starter rung makes <code>B3:0/1</code> true for exactly one scan per press. Use it as the "flip now" signal.',
        'Toggle rung: light = (pulse AND light off) OR (no pulse AND light on). <code>BST XIC B3:0/1 XIO O:0/0 NXB XIO B3:0/1 XIC O:0/0 BND OTE O:0/0</code>',
      ],
      starter: ['XIC I:0/0 OSR B3:0/0 OTE B3:0/1'],
      solution: ['XIC I:0/0 OSR B3:0/0 OTE B3:0/1', 'BST XIC B3:0/1 XIO O:0/0 NXB XIO B3:0/1 XIC O:0/0 BND OTE O:0/0'],
      test: {
        watch: ['I:0/0', 'O:0/0'],
        steps: [
          { desc: 'Light starts off', wait: 200, expect: { 'O:0/0': 0 } },
          { desc: 'Press the button — the light turns on', set: { 'I:0/0': 1 }, wait: 100, expect: { 'O:0/0': 1 } },
          { desc: 'Keep holding the button — no flicker', wait: 1000, during: { 'O:0/0': 1 } },
          { desc: 'Release — the light stays on', set: { 'I:0/0': 0 }, wait: 500, during: { 'O:0/0': 1 } },
          { desc: 'Press again — the light turns off', set: { 'I:0/0': 1 }, wait: 100, expect: { 'O:0/0': 0 } },
          { desc: 'Keep holding — stays off', wait: 1000, during: { 'O:0/0': 0 } },
          { desc: 'Release — stays off', set: { 'I:0/0': 0 }, wait: 500, during: { 'O:0/0': 0 } },
          { desc: 'A quick tap — on again', set: { 'I:0/0': 1 }, wait: 50 },
          { desc: 'Release', set: { 'I:0/0': 0 }, wait: 300, during: { 'O:0/0': 1 } },
        ],
      },
    },
    {
      id: 'c-fwd-rev',
      title: 'Forward/reverse with interlocks',
      level: 2,
      lesson: 'interlocks',
      scene: 'fwdrev',
      brief: `<p>A reversing starter has two contactors. If both close at once they short two phases of the supply — so this must never happen.</p>
<ul>
<li>FORWARD <code>I:0/1</code> starts the motor forward; REVERSE <code>I:0/2</code> starts it in reverse. Each seals in.</li>
<li>STOP (NC, <code>I:0/0</code>) or an overload trip (NC contact <code>I:0/3</code> opens) stops the motor.</li>
<li>The motor must be <strong>stopped before it can change direction</strong>: pressing the other direction's button while running is ignored — the motor keeps running the way it was going.</li>
<li>The FORWARD and REVERSE lights follow their contactors.</li>
</ul>`,
      io: {
        'I:0/0': 'STOP push button (NC)', 'I:0/1': 'FORWARD push button', 'I:0/2': 'REVERSE push button', 'I:0/3': 'Overload relay contact (NC)',
        'O:0/0': 'FORWARD contactor', 'O:0/1': 'REVERSE contactor', 'O:0/2': 'FORWARD light', 'O:0/3': 'REVERSE light',
      },
      hints: [
        'Start with two ordinary seal-in rungs, one per direction.',
        'Add a software interlock: the FORWARD rung may only be true if the REVERSE contactor is off (<code>XIO O:0/1</code>), and vice versa.',
        'FORWARD rung: <code>BST XIC I:0/1 NXB XIC O:0/0 BND XIC I:0/0 XIC I:0/3 XIO O:0/1 OTE O:0/0</code>',
        'On real equipment you would <em>also</em> wire the contactors\' auxiliary NC contacts as a hardwired interlock.',
      ],
      starter: [
        'BST XIC I:0/1 NXB XIC O:0/0 BND XIC I:0/0 XIC I:0/3 OTE O:0/0',
        'BST XIC I:0/2 NXB XIC O:0/1 BND XIC I:0/0 XIC I:0/3 OTE O:0/1',
      ],
      solution: [
        'BST XIC I:0/1 NXB XIC O:0/0 BND XIC I:0/0 XIC I:0/3 XIO O:0/1 OTE O:0/0',
        'BST XIC I:0/2 NXB XIC O:0/1 BND XIC I:0/0 XIC I:0/3 XIO O:0/0 OTE O:0/1',
        'XIC O:0/0 OTE O:0/2',
        'XIC O:0/1 OTE O:0/3',
      ],
      test: {
        init: { 'I:0/0': 1, 'I:0/3': 1 },
        watch: ['I:0/0', 'I:0/1', 'I:0/2', 'I:0/3', 'O:0/0', 'O:0/1'],
        steps: [
          { desc: 'Idle — both contactors off', wait: 200, expect: { 'O:0/0': 0, 'O:0/1': 0, 'O:0/2': 0, 'O:0/3': 0 } },
          { desc: 'Press FORWARD — runs forward', set: { 'I:0/1': 1 }, wait: 100, expect: { 'O:0/0': 1, 'O:0/1': 0, 'O:0/2': 1 } },
          { desc: 'Release FORWARD — keeps running forward', set: { 'I:0/1': 0 }, wait: 500, during: { 'O:0/0': 1, 'O:0/1': 0 } },
          { desc: 'Press REVERSE while running forward — must be ignored', set: { 'I:0/2': 1 }, wait: 300, during: { 'O:0/0': 1, 'O:0/1': 0 } },
          { desc: 'Release REVERSE — still forward', set: { 'I:0/2': 0 }, wait: 300, during: { 'O:0/0': 1, 'O:0/1': 0 } },
          { desc: 'Press STOP — everything off', set: { 'I:0/0': 0 }, wait: 100, expect: { 'O:0/0': 0, 'O:0/1': 0, 'O:0/2': 0 } },
          { desc: 'Release STOP', set: { 'I:0/0': 1 }, wait: 200, during: { 'O:0/0': 0, 'O:0/1': 0 } },
          { desc: 'Press REVERSE — runs in reverse', set: { 'I:0/2': 1 }, wait: 100, expect: { 'O:0/0': 0, 'O:0/1': 1, 'O:0/3': 1 } },
          { desc: 'Release REVERSE — keeps running in reverse', set: { 'I:0/2': 0 }, wait: 500, during: { 'O:0/0': 0, 'O:0/1': 1 } },
          { desc: 'Press FORWARD while in reverse — must be ignored', set: { 'I:0/1': 1 }, wait: 300, during: { 'O:0/0': 0, 'O:0/1': 1 } },
          { desc: 'Release FORWARD', set: { 'I:0/1': 0 }, wait: 200, during: { 'O:0/0': 0 } },
          { desc: 'The overload trips — both contactors off', set: { 'I:0/3': 0 }, wait: 100, expect: { 'O:0/0': 0, 'O:0/1': 0 } },
          { desc: 'Overload reset — nothing restarts by itself', set: { 'I:0/3': 1 }, wait: 500, during: { 'O:0/0': 0, 'O:0/1': 0 } },
        ],
      },
    },

    // ================= Unit 3: timers =================
    {
      id: 'c-delayed-start',
      title: 'Conveyor start-up warning',
      level: 2,
      lesson: 'ton',
      scene: 'motor',
      brief: `<p>Safety rules say a long conveyor must warn people before it moves.</p>
<ul>
<li>Pressing START (momentary) begins a start-up: the RUNNING light <code>O:0/1</code> comes on at once as a warning.</li>
<li><strong>5 seconds</strong> after START was pressed, the motor <code>O:0/0</code> starts. The light stays on while the motor runs.</li>
<li>STOP (NC) or an overload trip cancels everything immediately — during the warning or while running. The next start needs a fresh START press and a fresh 5 s warning.</li>
</ul>`,
      io: { 'I:0/0': MOTOR_IO['I:0/0'], 'I:0/1': MOTOR_IO['I:0/1'], 'I:0/2': MOTOR_IO['I:0/2'], 'O:0/0': MOTOR_IO['O:0/0'], 'O:0/1': 'RUNNING / warning light', 'B3:0/0': 'Start request (sealed)', 'T4:0': 'Start-up delay timer' },
      hints: [
        'The starter rung already seals in a "start request" bit <code>B3:0/0</code>. Use it to run a TON.',
        '<code>XIC B3:0/0 TON T4:0 1.0 5 0</code> — the timer\'s DN bit turns on 5 s after the request.',
        'Motor: <code>XIC T4:0/DN OTE O:0/0</code>. Light: <code>XIC B3:0/0 OTE O:0/1</code>. STOP drops <code>B3:0/0</code>, which resets the timer.',
      ],
      starter: ['BST XIC I:0/0 NXB XIC B3:0/0 BND XIC I:0/1 XIC I:0/2 OTE B3:0/0'],
      solution: [
        'BST XIC I:0/0 NXB XIC B3:0/0 BND XIC I:0/1 XIC I:0/2 OTE B3:0/0',
        'XIC B3:0/0 TON T4:0 1.0 5 0',
        'XIC T4:0/DN OTE O:0/0',
        'XIC B3:0/0 OTE O:0/1',
      ],
      test: {
        init: { 'I:0/1': 1, 'I:0/2': 1 },
        watch: ['I:0/0', 'I:0/1', 'I:0/2', 'O:0/0', 'O:0/1'],
        steps: [
          { desc: 'Idle — motor and light off', wait: 200, expect: { 'O:0/0': 0, 'O:0/1': 0 } },
          { desc: 'Press START — the warning light comes on, the motor waits', set: { 'I:0/0': 1 }, wait: 100, expect: { 'O:0/1': 1, 'O:0/0': 0 } },
          { desc: 'Release START — during the first 4.8 s the motor stays off', set: { 'I:0/0': 0 }, wait: 4700, during: { 'O:0/0': 0, 'O:0/1': 1 } },
          { desc: 'At about 5 s the motor starts', wait: 500, expect: { 'O:0/0': 1, 'O:0/1': 1 } },
          { desc: 'It keeps running', wait: 1000, during: { 'O:0/0': 1 } },
          { desc: 'Press STOP — motor and light off', set: { 'I:0/1': 0 }, wait: 100, expect: { 'O:0/0': 0, 'O:0/1': 0 } },
          { desc: 'Release STOP', set: { 'I:0/1': 1 }, wait: 300, during: { 'O:0/0': 0 } },
          { desc: 'Press START again', set: { 'I:0/0': 1 }, wait: 100, expect: { 'O:0/1': 1 } },
          { desc: 'Release START and wait 2 s', set: { 'I:0/0': 0 }, wait: 2000, during: { 'O:0/0': 0 } },
          { desc: 'Press STOP during the warning — cancelled', set: { 'I:0/1': 0 }, wait: 100, expect: { 'O:0/1': 0, 'O:0/0': 0 } },
          { desc: 'Release STOP — the motor must never start', set: { 'I:0/1': 1 }, wait: 5000, during: { 'O:0/0': 0 } },
          { desc: 'Press START once more', set: { 'I:0/0': 1 }, wait: 100 },
          { desc: 'Release and wait for the motor to start', set: { 'I:0/0': 0 }, wait: 5300, expect: { 'O:0/0': 1 } },
          { desc: 'The overload trips — everything stops', set: { 'I:0/2': 0 }, wait: 100, expect: { 'O:0/0': 0, 'O:0/1': 0 } },
          { desc: 'Overload reset — no restart without START', set: { 'I:0/2': 1 }, wait: 6000, during: { 'O:0/0': 0 } },
        ],
      },
    },
    {
      id: 'c-cooling-fan',
      title: 'Cooling fan run-on',
      level: 1,
      lesson: 'tof-rto',
      scene: 'trainer',
      brief: `<p>A motor gets hot and its cooling fan must keep running for a while after the motor stops.</p>
<ul>
<li>The motor <code>O:0/0</code> runs while the RUN switch <code>I:0/0</code> is on.</li>
<li>The cooling fan <code>O:0/1</code> comes on as soon as the motor starts, and keeps running for <strong>10 seconds</strong> after the motor stops.</li>
<li>If the motor restarts during those 10 s, the fan just keeps running, and the 10 s start over at the next stop.</li>
</ul>`,
      io: { 'I:0/0': 'Motor RUN switch', 'O:0/0': 'Motor', 'O:0/1': 'Cooling fan', 'T4:0': 'Fan run-on timer' },
      hints: [
        'This is exactly what an off-delay timer (TOF) does: DN is on while the rung is true, and for PRE after it goes false.',
        '<code>XIC I:0/0 TOF T4:0 1.0 10 0</code>',
        'Drive the fan from <code>T4:0/DN</code>.',
      ],
      starter: ['XIC I:0/0 OTE O:0/0'],
      solution: ['XIC I:0/0 OTE O:0/0', 'XIC I:0/0 TOF T4:0 1.0 10 0', 'XIC T4:0/DN OTE O:0/1'],
      test: {
        watch: ['I:0/0', 'O:0/0', 'O:0/1'],
        steps: [
          { desc: 'Idle — motor and fan off', wait: 300, expect: { 'O:0/0': 0, 'O:0/1': 0 } },
          { desc: 'Turn the motor on — the fan starts with it', set: { 'I:0/0': 1 }, wait: 500, expect: { 'O:0/0': 1, 'O:0/1': 1 } },
          { desc: 'Turn the motor off — the fan keeps running for 10 s', set: { 'I:0/0': 0 }, wait: 9700, during: { 'O:0/1': 1, 'O:0/0': 0 } },
          { desc: 'After 10 s the fan stops', wait: 600, expect: { 'O:0/1': 0 } },
          { desc: 'Run the motor again', set: { 'I:0/0': 1 }, wait: 1000, expect: { 'O:0/1': 1 } },
          { desc: 'Stop it for 3 s', set: { 'I:0/0': 0 }, wait: 3000, during: { 'O:0/1': 1 } },
          { desc: 'Restart it', set: { 'I:0/0': 1 }, wait: 500, during: { 'O:0/1': 1 } },
          { desc: 'Stop — the fan gets a full 10 s again', set: { 'I:0/0': 0 }, wait: 9700, during: { 'O:0/1': 1 } },
          { desc: 'Fan off', wait: 600, expect: { 'O:0/1': 0 } },
        ],
      },
    },
    {
      id: 'c-run-hours',
      title: 'Service-due run-time meter',
      level: 2,
      lesson: 'tof-rto',
      scene: 'trainer',
      brief: `<p>A pump needs service after a certain amount of <em>total</em> running time. (Real pumps count hundreds of hours; ours uses <strong>20 seconds</strong> so you can test it.)</p>
<ul>
<li>The pump <code>O:0/0</code> runs while the RUN switch <code>I:0/0</code> is on.</li>
<li>Total run time adds up across every start and stop. When it reaches 20 s, the SERVICE DUE light <code>O:0/1</code> comes on and stays on, even when the pump stops.</li>
<li>After servicing, the technician presses RESET <code>I:0/1</code>: the light goes off and the total starts again from zero.</li>
</ul>`,
      io: { 'I:0/0': 'Pump RUN switch', 'I:0/1': 'Service RESET push button', 'O:0/0': 'Pump', 'O:0/1': 'SERVICE DUE light', 'T4:0': 'Run-time accumulator' },
      hints: [
        'A TON forgets its time every time the pump stops. You need a timer that <em>remembers</em>.',
        'The retentive timer RTO keeps ACC when its rung goes false. Only a RES instruction clears it.',
        '<code>XIC I:0/0 RTO T4:0 1.0 20 0</code>, <code>XIC T4:0/DN OTE O:0/1</code>, <code>XIC I:0/1 RES T4:0</code>',
      ],
      starter: ['XIC I:0/0 OTE O:0/0'],
      solution: ['XIC I:0/0 OTE O:0/0', 'XIC I:0/0 RTO T4:0 1.0 20 0', 'XIC T4:0/DN OTE O:0/1', 'XIC I:0/1 RES T4:0'],
      test: {
        watch: ['I:0/0', 'I:0/1', 'O:0/0', 'O:0/1', 'T4:0.ACC'],
        steps: [
          { desc: 'Idle', wait: 200, expect: { 'O:0/1': 0 } },
          { desc: 'Pump runs for 12 s', set: { 'I:0/0': 1 }, wait: 12000, during: { 'O:0/1': 0 }, expect: { 'O:0/0': 1 } },
          { desc: 'Pump stops for 5 s', set: { 'I:0/0': 0 }, wait: 5000, during: { 'O:0/1': 0 } },
          { desc: 'Pump runs 7.5 s more (19.5 s total) — not due yet', set: { 'I:0/0': 1 }, wait: 7500, during: { 'O:0/1': 0 } },
          { desc: 'Running past 20 s total — SERVICE DUE comes on', wait: 800, expect: { 'O:0/1': 1 } },
          { desc: 'Pump stops — the light stays on', set: { 'I:0/0': 0 }, wait: 2000, during: { 'O:0/1': 1 } },
          { desc: 'Press RESET — the light goes off', set: { 'I:0/1': 1 }, wait: 100, expect: { 'O:0/1': 0 } },
          { desc: 'Release RESET, run 5 s — the count started over', set: { 'I:0/1': 0, 'I:0/0': 1 }, wait: 5000, during: { 'O:0/1': 0 } },
        ],
      },
    },
    {
      id: 'c-flasher',
      title: 'Warning beacon flasher',
      level: 1,
      lesson: 'timer-circuits',
      scene: 'trainer',
      brief: `<p>Make a warning beacon flash.</p>
<ul>
<li>While the ENABLE switch <code>I:0/0</code> is on, the beacon <code>O:0/0</code> flashes: <strong>1 second on, 1 second off</strong>, repeating.</li>
<li>It must start with the ON part: the beacon lights immediately when the switch is turned on.</li>
<li>When the switch is off, the beacon is off.</li>
</ul>`,
      io: { 'I:0/0': 'ENABLE switch', 'O:0/0': 'Beacon', 'T4:0': 'ON-time timer', 'T4:1': 'OFF-time timer' },
      hints: [
        'Use two TONs that reset each other: T4:0 times the ON part, T4:1 times the OFF part.',
        'T4:0 runs while enabled and T4:1 is not done: <code>XIC I:0/0 XIO T4:1/DN TON T4:0 1.0 1 0</code>. T4:1 runs once T4:0 is done.',
        'The beacon is on while enabled and T4:0 is <em>not</em> done yet.',
      ],
      starter: [],
      solution: ['XIC I:0/0 XIO T4:1/DN TON T4:0 1.0 1 0', 'XIC T4:0/DN TON T4:1 1.0 1 0', 'XIC I:0/0 XIO T4:0/DN OTE O:0/0'],
      test: {
        watch: ['I:0/0', 'O:0/0'],
        steps: [
          { desc: 'Switch off — beacon off', wait: 300, expect: { 'O:0/0': 0 } },
          { desc: 'Switch on — beacon on for the first second', set: { 'I:0/0': 1 }, wait: 900, during: { 'O:0/0': 1 } },
          { desc: '(changing)', wait: 200 },
          { desc: 'Second 1–2: beacon off', wait: 700, during: { 'O:0/0': 0 } },
          { desc: '(changing)', wait: 300 },
          { desc: 'Second 2–3: beacon on', wait: 600, during: { 'O:0/0': 1 } },
          { desc: '(changing)', wait: 400 },
          { desc: 'Second 3–4: beacon off', wait: 600, during: { 'O:0/0': 0 } },
          { desc: '(changing)', wait: 400 },
          { desc: 'Second 4–5: beacon on', wait: 500, during: { 'O:0/0': 1 } },
          { desc: 'Switch off', set: { 'I:0/0': 0 }, wait: 100 },
          { desc: 'Beacon stays off', wait: 2500, during: { 'O:0/0': 0 } },
        ],
      },
    },
    {
      id: 'c-traffic',
      title: 'Traffic light with timers',
      level: 2,
      lesson: 'timer-circuits',
      scene: 'traffic',
      brief: `<p>Program a fixed-time traffic light for a four-way intersection.</p>
<table class="tbl"><tr><th>Phase</th><th>Time</th><th>North–South</th><th>East–West</th></tr>
<tr><td>1</td><td>5 s</td><td>GREEN</td><td>RED</td></tr>
<tr><td>2</td><td>2 s</td><td>YELLOW</td><td>RED</td></tr>
<tr><td>3</td><td>5 s</td><td>RED</td><td>GREEN</td></tr>
<tr><td>4</td><td>2 s</td><td>RED</td><td>YELLOW</td></tr></table>
<ul>
<li>The cycle (14 s) repeats while the System ON switch <code>I:0/0</code> is on, always starting with phase 1 when switched on.</li>
<li>When the switch is off, both directions show RED only.</li>
<li>Each direction shows exactly one colour at a time. Never two greens!</li>
</ul>`,
      io: Object.assign({}, TRAFFIC_IO, { 'T4:0': 'Phase 1 timer', 'T4:1': 'Phase 2 timer', 'T4:2': 'Phase 3 timer', 'T4:3': 'Phase 4 timer' }),
      hints: [
        'Cascade four TONs: each one starts when the previous one is done. The last one resets the first.',
        '<code>XIC I:0/0 XIO T4:3/DN TON T4:0 1.0 5 0</code>, then <code>XIC T4:0/DN TON T4:1 1.0 2 0</code>, and so on.',
        'N–S GREEN is on while T4:0 is timing (enabled, not done). N–S YELLOW: <code>XIC T4:0/DN XIO T4:1/DN</code>.',
        'Reds are easiest as "not green and not yellow": <code>XIO O:0/2 XIO O:0/1 OTE O:0/0</code>.',
      ],
      starter: [],
      solution: [
        'XIC I:0/0 XIO T4:3/DN TON T4:0 1.0 5 0',
        'XIC T4:0/DN TON T4:1 1.0 2 0',
        'XIC T4:1/DN TON T4:2 1.0 5 0',
        'XIC T4:2/DN TON T4:3 1.0 2 0',
        'XIC I:0/0 XIO T4:0/DN OTE O:0/2',
        'XIC T4:0/DN XIO T4:1/DN OTE O:0/1',
        'XIO O:0/2 XIO O:0/1 OTE O:0/0',
        'XIC T4:1/DN XIO T4:2/DN OTE O:0/5',
        'XIC T4:2/DN XIO T4:3/DN OTE O:0/4',
        'XIO O:0/5 XIO O:0/4 OTE O:0/3',
      ],
      test: {
        watch: TRAFFIC_WATCH,
        steps: [
          { desc: 'Switch off — both directions RED', wait: 300, expect: ALL_RED },
          { desc: 'Switch on — phase 1: N–S GREEN, E–W RED (0–5 s)', set: { 'I:0/0': 1 }, wait: 4800, during: NS_GREEN },
          { desc: '(changing)', wait: 400 },
          { desc: 'Phase 2: N–S YELLOW, E–W RED (5–7 s)', wait: 1400, during: NS_YELLOW },
          { desc: '(changing)', wait: 600 },
          { desc: 'Phase 3: N–S RED, E–W GREEN (7–12 s)', wait: 4600, during: EW_GREEN },
          { desc: '(changing)', wait: 400 },
          { desc: 'Phase 4: N–S RED, E–W YELLOW (12–14 s)', wait: 1400, during: EW_YELLOW },
          { desc: '(changing)', wait: 600 },
          { desc: 'The cycle repeats: N–S GREEN again (14–19 s)', wait: 4400, during: NS_GREEN },
          { desc: 'Switch off — both RED', set: { 'I:0/0': 0 }, wait: 300, expect: ALL_RED },
          { desc: 'Switch on again — starts at phase 1', set: { 'I:0/0': 1 }, wait: 4700, during: NS_GREEN },
        ],
      },
    },
    {
      id: 'c-tank',
      title: 'Tank fill, mix and drain',
      level: 3,
      lesson: 'timer-circuits',
      scene: 'tank',
      brief: `<p>Automate a batch mixing tank. The float switches are: LOW <code>I:0/2</code> = 1 when liquid is above the 20% mark, HIGH <code>I:0/3</code> = 1 when it is at or above 80%.</p>
<ol>
<li>START (NO) and STOP (NC) turn the automatic cycle on and off (3-wire control). STOP closes both valves and stops the mixer immediately; after STOP nothing happens until START is pressed again.</li>
<li><strong>Fill:</strong> when the cycle is on and the level is below LOW, open the FILL valve <code>O:0/0</code>. Keep filling until HIGH turns on.</li>
<li><strong>Mix:</strong> when HIGH turns on, close FILL and run the MIXER <code>O:0/2</code> for <strong>5 seconds</strong>.</li>
<li><strong>Drain:</strong> after mixing, open the DRAIN valve <code>O:0/1</code> and keep it open until the level falls below LOW. Do not re-fill or re-mix while draining.</li>
<li>Then the cycle repeats from step 2.</li>
<li>The TANK FULL light <code>O:0/3</code> is on whenever HIGH is on.</li>
</ol>`,
      io: {
        'I:0/0': 'START push button (NO)', 'I:0/1': 'STOP push button (NC)', 'I:0/2': 'LOW level switch (1 = above 20%)', 'I:0/3': 'HIGH level switch (1 = at/above 80%)',
        'O:0/0': 'FILL valve', 'O:0/1': 'DRAIN valve', 'O:0/2': 'MIXER motor', 'O:0/3': 'TANK FULL light',
        'B3:0/0': 'Cycle on (sealed)', 'B3:0/2': 'Draining (sealed)', 'T4:0': 'Mix timer',
      },
      hints: [
        'Break it into pieces: a sealed "cycle on" bit, a sealed "filling" rung, a mix timer, and a sealed "draining" bit.',
        'Fill: <code>XIC B3:0/0 BST XIO I:0/2 NXB XIC O:0/0 BND XIO I:0/3 XIO B3:0/2 OTE O:0/0</code> — it starts when LOW is off and seals until HIGH.',
        'Mix timer runs while full and not draining: <code>XIC B3:0/0 XIC I:0/3 XIO B3:0/2 TON T4:0 1.0 5 0</code>. The mixer runs while <code>T4:0/TT</code> is on.',
        'Draining starts on <code>T4:0/DN</code> and seals in until LOW goes off: <code>XIC B3:0/0 BST XIC T4:0/DN NXB XIC B3:0/2 BND XIC I:0/2 OTE B3:0/2</code>.',
      ],
      starter: ['BST XIC I:0/0 NXB XIC B3:0/0 BND XIC I:0/1 OTE B3:0/0'],
      solution: [
        'BST XIC I:0/0 NXB XIC B3:0/0 BND XIC I:0/1 OTE B3:0/0',
        'XIC B3:0/0 BST XIO I:0/2 NXB XIC O:0/0 BND XIO I:0/3 XIO B3:0/2 OTE O:0/0',
        'XIC B3:0/0 XIC I:0/3 XIO B3:0/2 TON T4:0 1.0 5 0',
        'XIC B3:0/0 XIC T4:0/TT OTE O:0/2',
        'XIC B3:0/0 BST XIC T4:0/DN NXB XIC B3:0/2 BND XIC I:0/2 OTE B3:0/2',
        'XIC B3:0/2 OTE O:0/1',
        'XIC I:0/3 OTE O:0/3',
      ],
      test: {
        init: { 'I:0/1': 1 },
        watch: ['I:0/0', 'I:0/1', 'I:0/2', 'I:0/3', 'O:0/0', 'O:0/1', 'O:0/2', 'O:0/3'],
        steps: [
          { desc: 'Empty tank, cycle off — everything off', wait: 300, expect: { 'O:0/0': 0, 'O:0/1': 0, 'O:0/2': 0 } },
          { desc: 'Press START — the FILL valve opens', set: { 'I:0/0': 1 }, wait: 100, expect: { 'O:0/0': 1 } },
          { desc: 'Release START — keeps filling', set: { 'I:0/0': 0 }, wait: 500, during: { 'O:0/0': 1, 'O:0/1': 0, 'O:0/2': 0 } },
          { desc: 'Level rises past LOW — keeps filling', set: { 'I:0/2': 1 }, wait: 1000, during: { 'O:0/0': 1, 'O:0/1': 0, 'O:0/2': 0 } },
          { desc: 'Level reaches HIGH — FILL closes, MIXER starts, TANK FULL on', set: { 'I:0/3': 1 }, wait: 100, expect: { 'O:0/0': 0, 'O:0/2': 1, 'O:0/3': 1 } },
          { desc: 'Mixing for 5 s — no filling or draining', wait: 4600, during: { 'O:0/0': 0, 'O:0/1': 0, 'O:0/2': 1 } },
          { desc: 'After 5 s: MIXER stops, DRAIN opens', wait: 600, expect: { 'O:0/2': 0, 'O:0/1': 1, 'O:0/0': 0 } },
          { desc: 'Level falls below HIGH — keep draining, no fill, no mix', set: { 'I:0/3': 0 }, wait: 1500, during: { 'O:0/1': 1, 'O:0/0': 0, 'O:0/2': 0 }, expect: { 'O:0/3': 0 } },
          { desc: 'Level falls below LOW — DRAIN closes and the next fill starts', set: { 'I:0/2': 0 }, wait: 200, expect: { 'O:0/1': 0, 'O:0/0': 1 } },
          { desc: 'Press STOP — everything off', set: { 'I:0/1': 0 }, wait: 100, expect: { 'O:0/0': 0, 'O:0/1': 0, 'O:0/2': 0 } },
          { desc: 'Release STOP — stays off until START', set: { 'I:0/1': 1 }, wait: 1000, during: { 'O:0/0': 0, 'O:0/1': 0, 'O:0/2': 0 } },
        ],
      },
    },

    // ================= Unit 4: counters & data =================
    {
      id: 'c-parking',
      title: 'Parking garage FULL sign',
      level: 2,
      lesson: 'counters',
      scene: 'parking',
      brief: `<p>A garage has <strong>10 spaces</strong>. Photo-eyes pulse once for each car that enters or leaves.</p>
<ul>
<li>Keep the number of cars in the garage in counter <code>C5:0</code> (count up on ENTRY <code>I:0/0</code>, down on EXIT <code>I:0/1</code>).</li>
<li>When 10 or more cars are inside, light FULL <code>O:0/0</code> and lower the entry gate (<code>O:0/2</code> off).</li>
<li>Otherwise light SPACES AVAILABLE <code>O:0/1</code> and keep the gate raised (<code>O:0/2</code> on).</li>
<li>The RESET key switch <code>I:0/2</code> sets the count back to zero.</li>
</ul>`,
      io: { 'I:0/0': 'ENTRY photo-eye', 'I:0/1': 'EXIT photo-eye', 'I:0/2': 'RESET key switch', 'O:0/0': 'FULL sign', 'O:0/1': 'SPACES AVAILABLE sign', 'O:0/2': 'Entry gate (1 = raised)', 'C5:0': 'Cars in garage' },
      hints: [
        'A CTU and a CTD can share the <em>same</em> counter address — one adds, the other subtracts.',
        '<code>XIC I:0/0 CTU C5:0 10 0</code> and <code>XIC I:0/1 CTD C5:0 10 0</code> (same preset in both).',
        '<code>C5:0/DN</code> is on while ACC ≥ PRE — that is your FULL condition.',
      ],
      starter: ['XIC I:0/0 CTU C5:0 10 0'],
      solution: ['XIC I:0/0 CTU C5:0 10 0', 'XIC I:0/1 CTD C5:0 10 0', 'XIC I:0/2 RES C5:0', 'XIC C5:0/DN OTE O:0/0', 'XIO C5:0/DN OTE O:0/1', 'XIO C5:0/DN OTE O:0/2'],
      test: {
        watch: ['I:0/0', 'I:0/1', 'I:0/2', 'O:0/0', 'O:0/1', 'O:0/2', 'C5:0.ACC'],
        steps: [
          { desc: 'Empty garage — SPACES AVAILABLE, gate up', wait: 200, expect: { 'O:0/0': 0, 'O:0/1': 1, 'O:0/2': 1, 'C5:0.ACC': 0 } },
          ...pulses('A car enters', 'I:0/0', 9, 200, 200, { expect: { 'C5:0.ACC': 9, 'O:0/0': 0, 'O:0/1': 1 } }),
          ...pulses('The 10th car enters', 'I:0/0', 1, 200, 200, { expect: { 'C5:0.ACC': 10, 'O:0/0': 1, 'O:0/1': 0, 'O:0/2': 0 } }),
          ...pulses('A car leaves', 'I:0/1', 1, 200, 200, { expect: { 'C5:0.ACC': 9, 'O:0/0': 0, 'O:0/1': 1, 'O:0/2': 1 } }),
          { desc: 'A slow car blocks the entry eye for 2 s — it counts only once', set: { 'I:0/0': 1 }, wait: 2000 },
          { desc: 'The slow car clears the eye — garage FULL', set: { 'I:0/0': 0 }, wait: 200, expect: { 'C5:0.ACC': 10, 'O:0/0': 1 } },
          { desc: 'Turn the RESET key', set: { 'I:0/2': 1 }, wait: 200, expect: { 'C5:0.ACC': 0 } },
          { desc: 'Release the key — empty again', set: { 'I:0/2': 0 }, wait: 200, expect: { 'O:0/0': 0, 'O:0/1': 1 } },
        ],
      },
    },
    {
      id: 'c-batch',
      title: 'Batch counter on a conveyor',
      level: 2,
      lesson: 'counters',
      scene: 'conveyor',
      brief: `<p>Boxes ride a conveyor into a shipping carton that holds <strong>5 boxes</strong>.</p>
<ul>
<li>START (NO) / STOP (NC) run the conveyor <code>O:0/0</code> with a normal seal-in.</li>
<li>Count each box that passes the END photo-eye <code>I:0/2</code> in counter <code>C5:0</code>.</li>
<li>When the 5th box has passed, stop the conveyor and turn on BATCH COMPLETE <code>O:0/2</code>.</li>
<li>Pressing START again resets the count to zero, turns the light off and restarts the conveyor.</li>
</ul>`,
      io: { 'I:0/0': 'START push button (NO)', 'I:0/1': 'STOP push button (NC)', 'I:0/2': 'END photo-eye', 'O:0/0': 'CONVEYOR motor', 'O:0/2': 'BATCH COMPLETE light', 'C5:0': 'Box counter' },
      hints: [
        'Count with <code>XIC I:0/2 CTU C5:0 5 0</code>.',
        'Add <code>XIO C5:0/DN</code> in series in the conveyor rung so a full batch drops the seal-in.',
        'Put <code>XIC I:0/0 RES C5:0</code> <em>above</em> the conveyor rung, so the count is already cleared when the conveyor rung is solved.',
      ],
      starter: ['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 OTE O:0/0'],
      solution: ['XIC I:0/0 RES C5:0', 'BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIO C5:0/DN OTE O:0/0', 'XIC I:0/2 CTU C5:0 5 0', 'XIC C5:0/DN OTE O:0/2'],
      test: {
        init: { 'I:0/1': 1 },
        watch: ['I:0/0', 'I:0/1', 'I:0/2', 'O:0/0', 'O:0/2', 'C5:0.ACC'],
        steps: [
          { desc: 'Idle — conveyor off', wait: 200, expect: { 'O:0/0': 0, 'O:0/2': 0 } },
          ...press('Press START — the conveyor runs', 'I:0/0', { expectPressed: { 'O:0/0': 1 }, expect: { 'O:0/0': 1 } }),
          ...pulses('A box passes the end eye', 'I:0/2', 4, 300, 300, { expect: { 'O:0/0': 1, 'O:0/2': 0, 'C5:0.ACC': 4 } }),
          ...pulses('The 5th box passes', 'I:0/2', 1, 300, 100, { expect: { 'O:0/0': 0, 'O:0/2': 1 } }),
          { desc: 'The conveyor stays stopped', wait: 1000, during: { 'O:0/0': 0, 'O:0/2': 1 } },
          { desc: 'Press START — count reset, light off, conveyor runs', set: { 'I:0/0': 1 }, wait: 100, expect: { 'O:0/0': 1, 'O:0/2': 0, 'C5:0.ACC': 0 } },
          { desc: 'Release START', set: { 'I:0/0': 0 }, wait: 300, during: { 'O:0/0': 1 } },
          ...pulses('Another box passes', 'I:0/2', 2, 300, 300, { expect: { 'O:0/0': 1, 'C5:0.ACC': 2 } }),
          { desc: 'Press STOP — the conveyor stops', set: { 'I:0/1': 0 }, wait: 100, expect: { 'O:0/0': 0 } },
          { desc: 'Release STOP', set: { 'I:0/1': 1 }, wait: 300, during: { 'O:0/0': 0 } },
        ],
      },
    },
    {
      id: 'c-traffic-lim',
      title: 'Traffic light with one timer and LIM',
      level: 3,
      lesson: 'compare',
      scene: 'traffic',
      brief: `<p>Rewrite the traffic light using <strong>one</strong> timer and compare instructions.</p>
<ul>
<li>Use a single self-resetting TON <code>T4:0</code>, time base <strong>1.0</strong>, preset <strong>14</strong>, that runs while the System ON switch <code>I:0/0</code> is on.</li>
<li>Decode <code>T4:0.ACC</code> with LIM (or other compares) to light the lamps:</li>
</ul>
<table class="tbl"><tr><th>T4:0.ACC</th><th>North–South</th><th>East–West</th></tr>
<tr><td>0–4</td><td>GREEN</td><td>RED</td></tr>
<tr><td>5–6</td><td>YELLOW</td><td>RED</td></tr>
<tr><td>7–11</td><td>RED</td><td>GREEN</td></tr>
<tr><td>12–13</td><td>RED</td><td>YELLOW</td></tr></table>
<p>When the switch is off, both directions show RED only.</p>`,
      io: Object.assign({}, TRAFFIC_IO, { 'T4:0': 'Cycle timer (1.0 s base, PRE 14)' }),
      hints: [
        'Timer rung: <code>XIC I:0/0 XIO T4:0/DN TON T4:0 1.0 14 0</code> — the DN bit resets it every 14 s.',
        '<code>LIM 0 T4:0.ACC 4</code> is true while ACC is 0, 1, 2, 3 or 4. Put <code>XIC I:0/0</code> in front — when the system is off, ACC is 0 too!',
        'Reds: <code>XIO O:0/2 XIO O:0/1 OTE O:0/0</code> (and the same for E–W).',
      ],
      starter: ['XIC I:0/0 XIO T4:0/DN TON T4:0 1.0 14 0'],
      solution: [
        'XIC I:0/0 XIO T4:0/DN TON T4:0 1.0 14 0',
        'XIC I:0/0 LIM 0 T4:0.ACC 4 OTE O:0/2',
        'XIC I:0/0 LIM 5 T4:0.ACC 6 OTE O:0/1',
        'XIO O:0/2 XIO O:0/1 OTE O:0/0',
        'XIC I:0/0 LIM 7 T4:0.ACC 11 OTE O:0/5',
        'XIC I:0/0 LIM 12 T4:0.ACC 13 OTE O:0/4',
        'XIO O:0/5 XIO O:0/4 OTE O:0/3',
      ],
      test: {
        watch: TRAFFIC_WATCH.concat(['T4:0.ACC']),
        steps: [
          { desc: 'Switch off — both directions RED', wait: 300, expect: ALL_RED },
          { desc: 'Switch on — N–S GREEN for 0–3.5 s', set: { 'I:0/0': 1 }, wait: 3500, during: NS_GREEN, expect: { 'T4:0.ACC': 3 } },
          { desc: 'N–S GREEN until 5 s', wait: 1300, during: NS_GREEN },
          { desc: '(changing)', wait: 400 },
          { desc: 'N–S YELLOW (5–7 s)', wait: 1400, during: NS_YELLOW },
          { desc: '(changing)', wait: 600 },
          { desc: 'E–W GREEN (7–12 s)', wait: 4600, during: EW_GREEN },
          { desc: '(changing)', wait: 400 },
          { desc: 'E–W YELLOW (12–14 s)', wait: 1400, during: EW_YELLOW },
          { desc: '(timer resets)', wait: 700 },
          { desc: 'Cycle repeats — N–S GREEN and T4:0 restarted', wait: 500, during: NS_GREEN, expect: { 'T4:0.ACC': { min: 0, max: 1 } } },
          { desc: 'Switch off — both RED', set: { 'I:0/0': 0 }, wait: 300, expect: ALL_RED },
        ],
      },
    },
    {
      id: 'c-spaces-left',
      title: 'Spaces-left display (math)',
      level: 2,
      lesson: 'math',
      scene: 'parking',
      brief: `<p>The garage owner wants numbers for two displays. The counting rungs are already written (<code>C5:0</code> = cars inside, 10 spaces total).</p>
<ul>
<li><code>N7:0</code> = spaces left = 10 − cars inside.</li>
<li><code>N7:1</code> = percent full = cars inside × 100 ÷ 10.</li>
<li>FULL <code>O:0/0</code> is on when no spaces are left; SPACES AVAILABLE <code>O:0/1</code> when there is at least one.</li>
</ul>
<p>Both numbers must be correct at all times (update them every scan).</p>`,
      io: { 'I:0/0': 'ENTRY photo-eye', 'I:0/1': 'EXIT photo-eye', 'I:0/2': 'RESET key switch', 'O:0/0': 'FULL sign', 'O:0/1': 'SPACES AVAILABLE sign', 'C5:0': 'Cars in garage', 'N7:0': 'Spaces left', 'N7:1': 'Percent full', 'N7:2': 'Scratch word (optional)' },
      hints: [
        'Math instructions are outputs. With nothing in front of them, they run every scan.',
        '<code>SUB 10 C5:0.ACC N7:0</code> — Source A minus Source B, into Dest.',
        'Percent: <code>MUL C5:0.ACC 100 N7:2</code> then <code>DIV N7:2 10 N7:1</code>. Signs: <code>LEQ N7:0 0 OTE O:0/0</code>, <code>GRT N7:0 0 OTE O:0/1</code>.',
      ],
      starter: ['XIC I:0/0 CTU C5:0 10 0', 'XIC I:0/1 CTD C5:0 10 0', 'XIC I:0/2 RES C5:0'],
      solution: [
        'XIC I:0/0 CTU C5:0 10 0', 'XIC I:0/1 CTD C5:0 10 0', 'XIC I:0/2 RES C5:0',
        'SUB 10 C5:0.ACC N7:0',
        'MUL C5:0.ACC 100 N7:2',
        'DIV N7:2 10 N7:1',
        'LEQ N7:0 0 OTE O:0/0',
        'GRT N7:0 0 OTE O:0/1',
      ],
      test: {
        watch: ['I:0/0', 'I:0/1', 'O:0/0', 'O:0/1', 'C5:0.ACC', 'N7:0', 'N7:1'],
        steps: [
          { desc: 'Empty garage: 10 spaces left, 0% full', wait: 200, expect: { 'N7:0': 10, 'N7:1': 0, 'O:0/0': 0, 'O:0/1': 1 } },
          ...pulses('A car enters', 'I:0/0', 3, 200, 200, { expect: { 'N7:0': 7, 'N7:1': 30 } }),
          ...pulses('A car enters', 'I:0/0', 7, 200, 200, { expect: { 'N7:0': 0, 'N7:1': 100, 'O:0/0': 1, 'O:0/1': 0 } }),
          ...pulses('A car leaves', 'I:0/1', 1, 200, 200, { expect: { 'N7:0': 1, 'N7:1': 90, 'O:0/0': 0, 'O:0/1': 1 } }),
          { desc: 'Turn the RESET key', set: { 'I:0/2': 1 }, wait: 200 },
          { desc: 'Release — back to 10 spaces, 0%', set: { 'I:0/2': 0 }, wait: 200, expect: { 'N7:0': 10, 'N7:1': 0 } },
        ],
      },
    },
    {
      id: 'c-first-scan',
      title: 'Setpoint with first-scan initialise',
      level: 2,
      lesson: 'math',
      scene: 'trainer',
      brief: `<p>An operator adjusts a speed setpoint stored in <code>N7:0</code> with two push buttons.</p>
<ul>
<li>At power-up (the first scan after going to RUN), <code>N7:0</code> must be loaded with <strong>25</strong>.</li>
<li>Each press of UP <code>I:0/0</code> adds 5; each press of DOWN <code>I:0/1</code> subtracts 5. Holding a button counts as <strong>one</strong> press.</li>
<li>The setpoint must never go above <strong>50</strong> or below <strong>5</strong>.</li>
<li>MAX light <code>O:0/0</code> is on when <code>N7:0</code> = 50; MIN light <code>O:0/1</code> when it is 5.</li>
</ul>`,
      io: { 'I:0/0': 'UP push button', 'I:0/1': 'DOWN push button', 'O:0/0': 'MAX light', 'O:0/1': 'MIN light', 'N7:0': 'Speed setpoint', 'B3:0/0': 'OSR storage (UP)', 'B3:0/1': 'OSR storage (DOWN)', 'S:1/15': 'First-pass bit' },
      hints: [
        'The status bit <code>S:1/15</code> is on only during the first scan. <code>XIC S:1/15 MOV 25 N7:0</code>.',
        'Without a one-shot, holding UP would add 5 every scan (100 times a second). Use <code>OSR</code> with its own storage bit for each button.',
        'Limit with a compare before the math: <code>XIC I:0/0 LES N7:0 50 OSR B3:0/0 ADD N7:0 5 N7:0</code>.',
      ],
      starter: [],
      solution: [
        'XIC S:1/15 MOV 25 N7:0',
        'XIC I:0/0 LES N7:0 50 OSR B3:0/0 ADD N7:0 5 N7:0',
        'XIC I:0/1 GRT N7:0 5 OSR B3:0/1 SUB N7:0 5 N7:0',
        'EQU N7:0 50 OTE O:0/0',
        'EQU N7:0 5 OTE O:0/1',
      ],
      test: {
        watch: ['I:0/0', 'I:0/1', 'O:0/0', 'O:0/1', 'N7:0'],
        steps: [
          { desc: 'After power-up the setpoint is 25', wait: 100, expect: { 'N7:0': 25, 'O:0/0': 0, 'O:0/1': 0 } },
          ...press('Press UP', 'I:0/0', { expect: { 'N7:0': 30 } }),
          ...press('Press UP', 'I:0/0', { expect: { 'N7:0': 35 } }),
          { desc: 'Hold UP for 1 s — counts as one press', set: { 'I:0/0': 1 }, wait: 1000, expect: { 'N7:0': 40 } },
          { desc: 'Release UP', set: { 'I:0/0': 0 }, wait: 200, expect: { 'N7:0': 40 } },
          ...press('Press UP', 'I:0/0', { expect: { 'N7:0': 45 } }),
          ...press('Press UP', 'I:0/0', { expect: { 'N7:0': 50, 'O:0/0': 1 } }),
          ...press('Press UP at the maximum — stays at 50', 'I:0/0', { expect: { 'N7:0': 50, 'O:0/0': 1 } }),
          ...[45, 40, 35, 30, 25, 20, 15, 10, 5].flatMap((v) => press('Press DOWN', 'I:0/1', { expect: { 'N7:0': v } })),
          ...press('Press DOWN at the minimum — stays at 5', 'I:0/1', { expect: { 'N7:0': 5, 'O:0/1': 1, 'O:0/0': 0 } }),
        ],
      },
    },

    // ================= Unit 5: structure & troubleshooting =================
    {
      id: 'c-subroutine',
      title: 'Auto/manual with subroutines',
      level: 3,
      lesson: 'program-control',
      scene: 'trainer',
      brief: `<p>A clamping station has an AUTO/MANUAL selector. Organise the program in subroutines:</p>
<ul>
<li>LAD 2 (MAIN) calls <strong>LAD 3</strong> (AUTO) when the selector <code>I:0/0</code> is on, and <strong>LAD 4</strong> (MANUAL) when it is off. It also drives the AUTO light <code>O:0/1</code> and MANUAL light <code>O:0/2</code>.</li>
<li>AUTO (LAD 3): the CLAMP <code>O:0/0</code> closes while the PART PRESENT sensor <code>I:0/1</code> is on.</li>
<li>MANUAL (LAD 4): the conveyor JOG motor <code>O:0/3</code> runs while the JOG button <code>I:0/2</code> is held.</li>
<li><strong>Safety:</strong> when the machine leaves AUTO the clamp must open, and when it leaves MANUAL the jog motor must stop — even if the sensor or button is still on.</li>
</ul>`,
      io: { 'I:0/0': 'AUTO/MANUAL selector (1 = AUTO)', 'I:0/1': 'PART PRESENT sensor', 'I:0/2': 'JOG push button', 'O:0/0': 'CLAMP solenoid', 'O:0/1': 'AUTO light', 'O:0/2': 'MANUAL light', 'O:0/3': 'Conveyor JOG motor' },
      hints: [
        'MAIN: <code>XIC I:0/0 JSR U:3</code> and <code>XIO I:0/0 JSR U:4</code>. LAD 3: <code>XIC I:0/1 OTE O:0/0</code>. LAD 4: <code>XIC I:0/2 OTE O:0/3</code>.',
        'Now test switching from AUTO to MANUAL with a part present. The clamp stays closed! A subroutine that is not called is not scanned, so its OTEs keep their last state.',
        'Fix it in MAIN: when not in AUTO, clear the clamp — <code>XIO I:0/0 OTU O:0/0</code> — and do the same for the jog motor when in AUTO.',
      ],
      starter: ['XIC I:0/0 JSR U:3', 'XIO I:0/0 JSR U:4'],
      starterSubs: { 3: [], 4: [] },
      solution: ['XIC I:0/0 JSR U:3', 'XIO I:0/0 JSR U:4', 'XIC I:0/0 OTE O:0/1', 'XIO I:0/0 OTE O:0/2', 'XIO I:0/0 OTU O:0/0', 'XIC I:0/0 OTU O:0/3'],
      solutionSubs: { 3: ['XIC I:0/1 OTE O:0/0'], 4: ['XIC I:0/2 OTE O:0/3'] },
      test: {
        watch: ['I:0/0', 'I:0/1', 'I:0/2', 'O:0/0', 'O:0/1', 'O:0/2', 'O:0/3'],
        steps: [
          { desc: 'MANUAL, nothing on — MANUAL light on', wait: 200, expect: { 'O:0/0': 0, 'O:0/1': 0, 'O:0/2': 1, 'O:0/3': 0 } },
          { desc: 'Hold JOG in MANUAL — the jog motor runs', set: { 'I:0/2': 1 }, wait: 300, expect: { 'O:0/3': 1 } },
          { desc: 'Release JOG', set: { 'I:0/2': 0 }, wait: 300, expect: { 'O:0/3': 0 } },
          { desc: 'A part arrives in MANUAL — the clamp must not close', set: { 'I:0/1': 1 }, wait: 300, during: { 'O:0/0': 0 } },
          { desc: 'Switch to AUTO — AUTO light on, the clamp closes', set: { 'I:0/0': 1 }, wait: 200, expect: { 'O:0/0': 1, 'O:0/1': 1, 'O:0/2': 0 } },
          { desc: 'Press JOG in AUTO — ignored', set: { 'I:0/2': 1 }, wait: 300, during: { 'O:0/3': 0 } },
          { desc: 'Release JOG; the part leaves — the clamp opens', set: { 'I:0/2': 0, 'I:0/1': 0 }, wait: 200, expect: { 'O:0/0': 0 } },
          { desc: 'Another part arrives — the clamp closes', set: { 'I:0/1': 1 }, wait: 200, expect: { 'O:0/0': 1 } },
          { desc: 'Switch to MANUAL with the part still there — the clamp must open', set: { 'I:0/0': 0 }, wait: 200, expect: { 'O:0/0': 0, 'O:0/2': 1 } },
          { desc: 'Stay in MANUAL — clamp stays open', wait: 500, during: { 'O:0/0': 0 } },
          { desc: 'Hold JOG in MANUAL', set: { 'I:0/1': 0, 'I:0/2': 1 }, wait: 200, expect: { 'O:0/3': 1 } },
          { desc: 'Switch to AUTO while JOG is still held — the jog motor must stop', set: { 'I:0/0': 1 }, wait: 300, expect: { 'O:0/3': 0 } },
        ],
      },
    },
    {
      id: 'c-sqo-traffic',
      title: 'Traffic light with a sequencer (SQO)',
      level: 3,
      lesson: 'shift-seq',
      scene: 'traffic',
      brief: `<p>Build the traffic light with a Sequencer Output instruction. Each step lasts <strong>2 seconds</strong>, so long phases use two steps:</p>
<table class="tbl"><tr><th>Step</th><th>Word</th><th>Lamps</th><th>Value</th></tr>
<tr><td>1</td><td>N7:1</td><td>N–S GREEN, E–W RED</td><td>12</td></tr>
<tr><td>2</td><td>N7:2</td><td>N–S GREEN, E–W RED</td><td>12</td></tr>
<tr><td>3</td><td>N7:3</td><td>N–S YELLOW, E–W RED</td><td>10</td></tr>
<tr><td>4</td><td>N7:4</td><td>N–S RED, E–W GREEN</td><td>33</td></tr>
<tr><td>5</td><td>N7:5</td><td>N–S RED, E–W GREEN</td><td>33</td></tr>
<tr><td>6</td><td>N7:6</td><td>N–S RED, E–W YELLOW</td><td>17</td></tr></table>
<ul>
<li>The starter rung loads the table on the first scan.</li>
<li>Use <code>SQO #N7:0 003Fh O:0.0 R6:0 6 0</code> (file, mask, destination, control, length, position).</li>
<li>When the System ON switch <code>I:0/0</code> turns on, step 1 must appear <strong>immediately</strong>, then advance every 2 s (use <code>T4:0</code>) and wrap from step 6 to step 1.</li>
<li>When the switch is off: both directions RED only (value 9), and the sequence restarts from step 1 next time.</li>
</ul>`,
      io: Object.assign({}, TRAFFIC_IO, { 'N7:0': 'Sequencer table (N7:1–N7:6 = steps)', 'R6:0': 'Sequencer control', 'T4:0': '2-second step timer', 'S:1/15': 'First-pass bit' }),
      hints: [
        'Values: bit 0 = N–S RED (1), bit 1 = N–S YELLOW (2), bit 2 = N–S GREEN (4), bit 3 = E–W RED (8), bit 4 = E–W YELLOW (16), bit 5 = E–W GREEN (32).',
        'A self-resetting timer: <code>XIC I:0/0 XIO T4:0/DN TON T4:0 1.0 2 0</code>. The SQO steps on each false→true transition of its rung.',
        'Put the SQO rung <em>above</em> the timer and condition it with <code>XIC I:0/0 XIO T4:0/TT</code>. It is true the moment the switch turns on (first step) and again each time the timer finishes.',
        'Switch off: <code>XIO I:0/0 BST RES R6:0 NXB MOV 9 O:0.0 BND</code>.',
      ],
      starter: ['XIC S:1/15 BST MOV 12 N7:1 NXB MOV 12 N7:2 NXB MOV 10 N7:3 NXB MOV 33 N7:4 NXB MOV 33 N7:5 NXB MOV 17 N7:6 BND'],
      solution: [
        'XIC S:1/15 BST MOV 12 N7:1 NXB MOV 12 N7:2 NXB MOV 10 N7:3 NXB MOV 33 N7:4 NXB MOV 33 N7:5 NXB MOV 17 N7:6 BND',
        'XIO I:0/0 BST RES R6:0 NXB MOV 9 O:0.0 BND',
        'XIC I:0/0 XIO T4:0/TT SQO #N7:0 003Fh O:0.0 R6:0 6 0',
        'XIC I:0/0 XIO T4:0/DN TON T4:0 1.0 2 0',
      ],
      test: {
        watch: TRAFFIC_WATCH.concat(['R6:0.POS']),
        steps: [
          { desc: 'Switch off — both RED', wait: 300, expect: ALL_RED },
          { desc: 'Switch on — step 1 immediately: N–S GREEN', set: { 'I:0/0': 1 }, wait: 1800, during: NS_GREEN, expect: { 'R6:0.POS': 1 } },
          { desc: '(stepping)', wait: 400 },
          { desc: 'Step 2: N–S GREEN', wait: 1600, during: NS_GREEN, expect: { 'R6:0.POS': 2 } },
          { desc: '(stepping)', wait: 400 },
          { desc: 'Step 3: N–S YELLOW', wait: 1600, during: NS_YELLOW, expect: { 'R6:0.POS': 3 } },
          { desc: '(stepping)', wait: 400 },
          { desc: 'Steps 4–5: E–W GREEN', wait: 3600, during: EW_GREEN },
          { desc: '(stepping)', wait: 400 },
          { desc: 'Step 6: E–W YELLOW', wait: 1600, during: EW_YELLOW, expect: { 'R6:0.POS': 6 } },
          { desc: '(wrapping)', wait: 400 },
          { desc: 'Wraps to step 1: N–S GREEN', wait: 1500, during: NS_GREEN, expect: { 'R6:0.POS': 1 } },
          { desc: 'Switch off — both RED', set: { 'I:0/0': 0 }, wait: 300, expect: ALL_RED },
          { desc: 'Switch on — starts again at step 1', set: { 'I:0/0': 1 }, wait: 1500, during: NS_GREEN, expect: { 'R6:0.POS': 1 } },
        ],
      },
    },
    {
      id: 'c-bsl-reject',
      title: 'Reject tracking with a bit shift (BSL)',
      level: 3,
      lesson: 'shift-seq',
      scene: 'trainer',
      brief: `<p>Parts move along an indexing conveyor one station at a time. Each move gives one INDEX pulse <code>I:0/0</code>.</p>
<ul>
<li>At the inspection station, the BAD PART sensor <code>I:0/1</code> is 1 if the part there is bad. It is valid at the moment the INDEX pulse arrives.</li>
<li>The reject station is <strong>4 stations</strong> downstream. When a bad part arrives there — at the 4th index pulse after the pulse that inspected it — turn the REJECT solenoid <code>O:0/0</code> on, and keep it on until the next index pulse.</li>
<li>Good parts must not be rejected.</li>
</ul>`,
      io: { 'I:0/0': 'INDEX pulse (conveyor moved one station)', 'I:0/1': 'BAD PART sensor', 'O:0/0': 'REJECT solenoid', 'B3:1': 'Tracking register (B3:1/0 … B3:1/15)', 'R6:0': 'BSL control' },
      hints: [
        'A bit shift register is a row of "memory boxes", one per station. Each INDEX pulse shifts every bit one place and loads the sensor into bit 0.',
        '<code>XIC I:0/0 BSL #B3:1 R6:0 I:0/1 16</code> — file, control, source bit, length.',
        'A part inspected at bit 0 is at bit 4 four pulses later: <code>XIC B3:1/4 OTE O:0/0</code>.',
      ],
      starter: [],
      solution: ['XIC I:0/0 BSL #B3:1 R6:0 I:0/1 16', 'XIC B3:1/4 OTE O:0/0'],
      test: {
        watch: ['I:0/0', 'I:0/1', 'O:0/0'],
        steps: [{ desc: 'Idle — no reject', wait: 200, expect: { 'O:0/0': 0 } }].concat(
          ...BAD.slice(1).map((bad, i) => {
            const k = i + 1;
            const due = k - 4 >= 1 ? BAD[k - 4] : 0;
            return [
              { desc: `Index pulse ${k}: the part at inspection is ${bad ? 'BAD' : 'good'}`, set: { 'I:0/0': 1, 'I:0/1': bad }, wait: 200 },
              { desc: `After pulse ${k}: reject solenoid ${due ? 'ON (bad part from pulse ' + (k - 4) + ')' : 'off'}`, set: { 'I:0/0': 0, 'I:0/1': 0 }, wait: 300, during: { 'O:0/0': due } },
            ];
          })),
      },
    },
    {
      id: 'c-debug-motor',
      title: 'Troubleshoot: fix the motor program',
      level: 2,
      lesson: 'troubleshooting',
      scene: 'motor',
      brief: `<p>A technician wrote this program for a 3-wire start/stop station, but it does not work. The customer's spec:</p>
<ul>
<li>START (NO) starts motor M1 and it keeps running; STOP (NC) stops it; STOP wins if both are held.</li>
<li>An overload trip (NC contact <code>I:0/2</code> opens) stops the motor; it must not restart by itself.</li>
<li>RUNNING light on while running; STOPPED light on while stopped; OVERLOAD light on while the overload is tripped.</li>
</ul>
<p>Load the starter program, run it, and use the rung highlighting and data table to find the <strong>four</strong> bugs. Fix them — don't rewrite from scratch!</p>`,
      io: { 'I:0/0': MOTOR_IO['I:0/0'], 'I:0/1': MOTOR_IO['I:0/1'], 'I:0/2': MOTOR_IO['I:0/2'], 'O:0/0': MOTOR_IO['O:0/0'], 'O:0/1': MOTOR_IO['O:0/1'], 'O:0/2': MOTOR_IO['O:0/2'], 'O:0/3': MOTOR_IO['O:0/3'] },
      hints: [
        'Press nothing and look at rung 0: is the STOP instruction highlighted true? The STOP button is normally closed.',
        'Search for <code>O:0/0</code>: it appears as an OTE on two rungs (a "double coil"). Only the last one solved in the scan wins.',
        'Check each light against the spec: which ones are inverted?',
        'Bugs: XIO on the NC stop, overload rung writing O:0/0 (move the overload into rung 0), STOPPED light uses XIC, OVERLOAD light uses XIC.',
      ],
      starter: [
        'BST XIC I:0/0 NXB XIC O:0/0 BND XIO I:0/1 OTE O:0/0',
        'XIC O:0/0 OTE O:0/1',
        'XIC O:0/0 OTE O:0/2',
        'XIC I:0/2 OTE O:0/3',
        'XIC I:0/2 OTE O:0/0',
      ],
      solution: START_STOP_SOLUTION,
      test: START_STOP_TEST,
    },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
