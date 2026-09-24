/*
 * Instruction reference (RSLogix 500 / MicroLogix 1000 subset simulated by PLCsim).
 *
 *   PLC.REFERENCE[MNEMONIC] = {
 *     summary   one line
 *     details   HTML
 *     example   [rung strings] for LAD 2 (compiles on ML1000-16)
 *     exampleSubs  optional {fileNumber: [rungs]} for subroutine files
 *     pitfalls  [strings]
 *     avail     optional note when not available on the MicroLogix 1000
 *   }
 *
 * Source for semantics: js/core/instructions.js, cross-checked against the
 * SLC 500 and MicroLogix 1000 Instruction Set Reference (1747-RM001).
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  const TIMER_LAYOUT = `<table class="tbl"><tr><th>Word</th><th>Contents</th></tr>
<tr><td>0</td><td>bit 15 <code>EN</code> enable · bit 14 <code>TT</code> timer timing · bit 13 <code>DN</code> done</td></tr>
<tr><td>1</td><td><code>PRE</code> preset (0–32767)</td></tr>
<tr><td>2</td><td><code>ACC</code> accumulator (0–32767)</td></tr></table>
<p>Time = PRE × time base. MicroLogix 1000 time bases: 1.0 s and 0.01 s. A negative PRE or ACC faults the processor (0034h).</p>`;
  const COUNTER_LAYOUT = `<table class="tbl"><tr><th>Word</th><th>Contents</th></tr>
<tr><td>0</td><td>bit 15 <code>CU</code> count-up enable · 14 <code>CD</code> count-down enable · 13 <code>DN</code> done (ACC ≥ PRE) · 12 <code>OV</code> overflow · 11 <code>UN</code> underflow · 10 <code>UA</code> (high-speed counter)</td></tr>
<tr><td>1</td><td><code>PRE</code> preset (−32768…32767)</td></tr>
<tr><td>2</td><td><code>ACC</code> accumulator (−32768…32767)</td></tr></table>`;
  const CONTROL_LAYOUT = `<table class="tbl"><tr><th>Word</th><th>Contents</th></tr>
<tr><td>0</td><td>bit 15 <code>EN</code> enable · 14 <code>EU</code> · 13 <code>DN</code> done · 12 <code>EM</code> · 11 <code>ER</code> error · 10 <code>UL</code> unload · 9 <code>IN</code> · 8 <code>FD</code> found</td></tr>
<tr><td>1</td><td><code>LEN</code> length</td></tr>
<tr><td>2</td><td><code>POS</code> position</td></tr></table>`;
  const MATH_FLAGS = `<p><strong>Status flags (S:0):</strong> C (S:0/0) carry/borrow · V (S:0/1) overflow · Z (S:0/2) result is zero · S (S:0/3) result is negative. On overflow the result is clamped to 32767 or −32768 and the overflow trap <code>S:5/0</code> is set; if S:5/0 is still set at the end of the scan the processor faults with <code>0020h</code>.</p>`;
  const MOVE_FLAGS = `<p><strong>Status flags (S:0):</strong> C and V cleared · Z set if the result is 0 · S set if the result is negative (bit 15 set).</p>`;

  function cmp(sym, words) {
    return {
      summary: `Input instruction: true when Source A ${sym} Source B.`,
      details: `<p>Compares two 16-bit signed values. Either operand may be a word address (N7:0, T4:0.ACC, C5:0.ACC, I:0 …) or a constant; RSLogix 500 requires Source A to be an address. ${words}</p><p>Compare instructions do not change the status flags.</p>`,
    };
  }

  PLC.REFERENCE = {
    // ---------------- bit ----------------
    XIC: {
      summary: 'Examine If Closed — true when the addressed bit is 1.',
      details: `<p>Input instruction. Asks "is this bit ON?". It examines a <strong>bit in the data table</strong>, not the physical contact: for a normally-closed field device (a STOP button) the bit is 1 at rest, so XIC is true until the button is pressed.</p><table class="tbl"><tr><th>Bit</th><th>XIC</th></tr><tr><td>0</td><td>false</td></tr><tr><td>1</td><td>true</td></tr></table><p>Any bit address can be used: I, O, B3, T4:n/DN, C5:n/DN, N7:n/b, S:1/15 …</p>`,
      example: ['XIC I:0/0 OTE O:0/0'],
      pitfalls: ['Choosing XIC/XIO by the device type instead of the bit value. Ask: "what is the bit when it is OK to run?" — 1 → XIC.', 'Examining an output bit (XIC O:0/0) reads the output image, not whether the motor is actually turning.'],
    },
    XIO: {
      summary: 'Examine If Open — true when the addressed bit is 0.',
      details: `<p>Input instruction. Asks "is this bit OFF?". Used for NOT logic, interlocks (<code>XIO O:0/1</code> in the forward rung) and self-resetting timers (<code>XIO T4:0/DN</code>).</p><table class="tbl"><tr><th>Bit</th><th>XIO</th></tr><tr><td>0</td><td>true</td></tr><tr><td>1</td><td>false</td></tr></table>`,
      example: ['XIO I:0/0 OTE O:0/1'],
      pitfalls: ['XIO on a normally-closed STOP button makes the motor run only while STOP is pressed — use XIC.'],
    },
    OTE: {
      summary: 'Output Energize — writes 1 when the rung is true, 0 when false.',
      details: `<p>Output instruction; must be at the right end of the rung (several may be in parallel). Executes every scan: true rung → bit = 1, false rung → bit = 0. OTE bits are non-retentive: on SLC/MicroLogix hardware they are reset when the processor enters RUN or power is restored, and inside a false MCR zone.</p>`,
      example: ['XIC I:0/0 BST OTE O:0/0 NXB OTE B3:0/0 BND'],
      pitfalls: ['Double coil: two OTEs with the same address — the last one solved in the scan wins.', 'An OTE in a subroutine that is no longer called, or in rungs skipped by JMP, keeps its last value.'],
    },
    OTL: {
      summary: 'Output Latch — sets the bit to 1 when the rung is true; does nothing when false.',
      details: `<p>Output instruction. Once set, the bit stays 1 until an <code>OTU</code> with the same address is true. Latched bits are retentive: they keep their state through a mode change and a power cycle.</p>`,
      example: ['XIC I:0/0 OTL B3:0/0', 'XIC I:0/1 OTU B3:0/0'],
      pitfalls: ['A latched output can restart equipment after power-up. Latch internal bits, not outputs, where possible, and consider unlatching on the first scan (S:1/15).', 'If OTL and OTU are both true in the same scan, the one lower in the program wins.'],
    },
    OTU: {
      summary: 'Output Unlatch — clears the bit to 0 when the rung is true; does nothing when false.',
      details: `<p>Output instruction, the partner of OTL. Also useful on its own to clear a bit that something else set — for example <code>OTU S:5/0</code> on the last rung to clear the math overflow trap.</p>`,
      example: ['XIC I:0/0 OTL O:0/0', 'XIC I:0/1 OTU O:0/0'],
      pitfalls: ['Every OTL should have a matching OTU somewhere, or the bit can never be cleared by the program.'],
    },
    OSR: {
      summary: 'One-Shot Rising (SLC 500 / MicroLogix 1000) — true for one scan when the logic before it goes false → true.',
      details: `<p>Input instruction with one operand, a <strong>storage bit</strong> (normally a B3 bit). Each scan it compares the rung condition coming in with the storage bit: if the condition is true now and was false last scan, OSR is true for this scan only. It then saves the condition in the storage bit.</p><p>Place it immediately before the output instruction(s) it controls. Some SLC processors restrict where OSR may be used (for example in branches) — see 1747-RM001.</p><p><strong>On MicroLogix 1100/1200/1400/1500</strong>, OSR is a different, <em>output</em> instruction with a storage bit and an output bit; the input one-shot there is <code>ONS</code>.</p>`,
      example: ['XIC I:0/0 OSR B3:0/0 ADD N7:0 1 N7:0'],
      pitfalls: ['Each OSR needs its own storage bit, used nowhere else.', 'Without a one-shot, ADD/SUB/CTU-style logic runs every scan while a button is held (about 100 times a second).'],
    },
    ONS: {
      summary: 'One Shot (MicroLogix 1100/1200/1400/1500) — the input one-shot; same behaviour as the SLC OSR.',
      details: `<p>Input instruction with a storage bit. True for exactly one scan when the rung condition before it goes false → true.</p>`,
      avail: 'Not available on the MicroLogix 1000 or SLC 500 — use OSR there.',
      example: ['XIC I:0/0 ONS B3:0/0 ADD N7:0 1 N7:0'],
      pitfalls: ['The storage bit must be unique to this instruction.'],
    },
    OSF: {
      summary: 'One Shot Falling (MicroLogix 1100/1200/1400/1500) — pulses an output bit for one scan when the rung goes true → false.',
      details: `<p>Output instruction with two operands: a storage bit and an output bit. When the rung goes from true to false, the output bit is 1 for one scan. The ML1100+ <code>OSR</code> is the rising-edge version with the same two operands.</p>`,
      avail: 'Not available on the MicroLogix 1000 or SLC 500.',
      example: ['XIC I:0/0 OSF B3:0/1 B3:0/2', 'XIC B3:0/2 ADD N7:0 1 N7:0'],
      pitfalls: ['Use the output bit on rungs below the OSF, so they see its one-scan pulse in the same scan.'],
    },

    // ---------------- timers / counters ----------------
    TON: {
      summary: 'Timer On-Delay — DN turns on PRE × time base after the rung goes true; resets when the rung goes false.',
      details: `<p>Operands: timer (T4:n), time base, preset, accumulator. Text form: <code>TON T4:0 1.0 5 0</code>.</p><ul><li>Rung true: EN = 1; ACC counts up; TT = 1 while ACC &lt; PRE; DN = 1 when ACC reaches PRE (ACC stops there).</li><li>Rung false: EN, TT, DN = 0 and ACC = 0 (non-retentive).</li></ul>${TIMER_LAYOUT}`,
      example: ['XIC I:0/0 TON T4:0 1.0 5 0', 'XIC T4:0/DN OTE O:0/0'],
      pitfalls: ['A preset of 2.5 s needs the 0.01 time base (PRE 250); presets are whole numbers.', 'Two timing instructions with the same T4 address fight each other.', 'For a self-resetting timer, use XIO T4:n/DN in front of it; DN is then on for one scan per cycle.'],
    },
    TOF: {
      summary: 'Timer Off-Delay — DN is on while the rung is true and for PRE × time base after it goes false.',
      details: `<ul><li>Rung true: EN = 1, DN = 1, TT = 0, ACC = 0.</li><li>Rung goes false: EN = 0, TT = 1, ACC counts up; DN stays 1.</li><li>ACC reaches PRE: DN = 0, TT = 0.</li><li>Rung true again before then: ACC resets, DN stays on.</li></ul>${TIMER_LAYOUT}`,
      example: ['XIC I:0/0 TOF T4:1 1.0 10 0', 'XIC T4:1/DN OTE O:0/1'],
      pitfalls: ['Do not use RES on a TOF — the Rockwell manual warns this can cause unpredictable operation.', 'After power-up, a TOF whose rung has never been true has DN = 0.'],
    },
    RTO: {
      summary: 'Retentive Timer On — like TON, but ACC is kept when the rung goes false. Cleared only by RES.',
      details: `<ul><li>Rung true: EN = 1, ACC counts, TT = 1 while ACC &lt; PRE, DN = 1 at PRE.</li><li>Rung false: EN = 0, TT = 0, but <strong>ACC and DN keep their values</strong>.</li><li>ACC and DN also survive a mode change and power loss.</li></ul>${TIMER_LAYOUT}`,
      example: ['XIC I:0/0 RTO T4:2 1.0 20 0', 'XIC T4:2/DN OTE O:0/2', 'XIC I:0/1 RES T4:2'],
      pitfalls: ['Forgetting the RES: once DN is set it stays set forever.'],
    },
    CTU: {
      summary: 'Count Up — adds 1 to ACC on each false → true transition of the rung.',
      details: `<p>Operands: counter (C5:n), preset, accumulator. Text form: <code>CTU C5:0 10 0</code>. The CU bit remembers the previous rung state so each transition counts once. DN = 1 while ACC ≥ PRE; counting continues past PRE. Past 32767, ACC wraps to −32768 and OV is set. Counters are retentive — use RES to clear.</p>${COUNTER_LAYOUT}`,
      example: ['XIC I:0/0 CTU C5:0 10 0', 'XIC C5:0/DN OTE O:0/0', 'XIC I:0/1 RES C5:0'],
      pitfalls: ['An input that is on for less than one scan may not be counted.', 'On a real MicroLogix 1000, C5:0 is used by the high-speed counter if the HSC instruction is programmed.'],
    },
    CTD: {
      summary: 'Count Down — subtracts 1 from ACC on each false → true transition of the rung.',
      details: `<p>Usually paired with a CTU of the <strong>same address</strong> to make an up/down counter (both share one PRE and ACC). DN = 1 while ACC ≥ PRE. Below −32768, ACC wraps to +32767 and UN is set.</p>${COUNTER_LAYOUT}`,
      example: ['XIC I:0/0 CTU C5:1 10 0', 'XIC I:0/1 CTD C5:1 10 0', 'XIC C5:1/DN OTE O:0/0'],
      pitfalls: ['Give the CTU and CTD the same preset — they share one PRE word.', 'ACC can go negative if more "down" events occur than "up" events.'],
    },
    RES: {
      summary: 'Reset — clears the ACC (or POS) and status bits of a timer, counter or control element.',
      details: `<p>Output instruction. When true: for a timer, ACC = 0 and EN/TT/DN cleared; for a counter, ACC = 0 and CU/CD/DN/OV/UN cleared; for a control element (R6), POS = 0 and all its status bits cleared. PRE and LEN are not changed.</p>`,
      example: ['XIC I:0/0 CTU C5:0 5 0', 'XIC I:0/1 RES C5:0'],
      pitfalls: ['Don\'t RES a TOF.', 'A RES that is held true keeps the element reset — a counter won\'t count while its RES rung is true.'],
    },

    // ---------------- compare ----------------
    EQU: Object.assign(cmp('=', ''), { example: ['EQU N7:0 50 OTE O:0/0'], pitfalls: ['EQU on a timer ACC may be true for a whole second (1.0 time base) or just one scan-worth (0.01 base) — often GEQ or LIM is safer.'] }),
    NEQ: Object.assign(cmp('≠', ''), { example: ['NEQ C5:0.ACC 0 OTE O:0/1'], pitfalls: [] }),
    LES: Object.assign(cmp('&lt;', ''), { example: ['LES T4:0.ACC 100 OTE O:0/0'], pitfalls: ['LES is false when A equals B.'] }),
    LEQ: Object.assign(cmp('≤', ''), { example: ['LEQ N7:0 0 OTE O:0/0'], pitfalls: [] }),
    GRT: Object.assign(cmp('&gt;', ''), { example: ['GRT N7:1 N7:2 OTE O:0/2'], pitfalls: ['GRT is false when A equals B.'] }),
    GEQ: Object.assign(cmp('≥', ''), { example: ['GEQ T4:0.ACC 5 OTE O:0/3'], pitfalls: [] }),
    LIM: {
      summary: 'Limit Test — true when Low ≤ Test ≤ High (inclusive).',
      details: `<p>Operands: Low Limit, Test, High Limit. If Low ≤ High, LIM is true when Test is within the band, including the limits. If Low &gt; High, it is true when Test is <em>outside</em> the band (Test ≥ Low or Test ≤ High). Great for decoding one timer's ACC into several phases.</p><p>RSLogix 500 requires that if Test is a constant, both limits are addresses.</p>`,
      example: ['XIC I:0/0 XIO T4:0/DN TON T4:0 1.0 14 0', 'XIC I:0/0 LIM 0 T4:0.ACC 4 OTE O:0/2'],
      pitfalls: ['When the timer is idle its ACC is 0 — a band starting at 0 is true then too. Add the enable condition in front.'],
    },
    MEQ: {
      summary: 'Masked Comparison for Equal — true when (Source AND Mask) = (Compare AND Mask).',
      details: `<p>Operands: Source, Mask, Compare. Only the bits that are 1 in the mask are compared. Example: <code>MEQ I:0 0007h 0005h</code> is true when inputs 0, 1, 2 are on, off, on — whatever the other inputs are.</p>`,
      example: ['MEQ I:0 0007h 0005h OTE O:0/0'],
      pitfalls: ['Write masks in hex (h suffix) — it is much easier to see which bits are selected.'],
    },

    // ---------------- math ----------------
    ADD: {
      summary: 'Add — Dest = Source A + Source B.',
      details: `<p>Output instruction; executes every scan the rung is true.</p>${MATH_FLAGS}`,
      example: ['XIC I:0/0 OSR B3:0/0 ADD N7:0 5 N7:0'],
      pitfalls: ['Without a one-shot, <code>ADD N7:0 1 N7:0</code> adds 1 every scan.', 'An unchecked running total will eventually overflow and fault the processor (0020h).'],
    },
    SUB: {
      summary: 'Subtract — Dest = Source A − Source B.',
      details: `<p>Output instruction. Order matters: A minus B. The carry flag is set when a borrow occurs.</p>${MATH_FLAGS}`,
      example: ['SUB 10 C5:0.ACC N7:1'],
      pitfalls: ['Swapping A and B gives the negative of what you wanted.'],
    },
    MUL: {
      summary: 'Multiply — Dest = Source A × Source B.',
      details: `<p>Output instruction. The full 32-bit product is also placed in the math register (S:14 high word, S:13 low word). If the product doesn't fit in 16 bits, the destination is clamped and overflow is set.</p>${MATH_FLAGS}`,
      example: ['MUL C5:0.ACC 100 N7:2'],
      pitfalls: ['Multiplying before dividing keeps precision, but watch that the intermediate product stays under 32767.'],
    },
    DIV: {
      summary: 'Divide — Dest = Source A ÷ Source B, rounded to the nearest whole number.',
      details: `<p>Output instruction. Integer results are rounded (7 ÷ 2 = 4, 5 ÷ 3 = 2). The unrounded quotient is placed in S:14 and the remainder in S:13. Dividing by zero sets the overflow flag (and the trap S:5/0).</p>${MATH_FLAGS}`,
      example: ['DIV N7:2 10 N7:1'],
      pitfalls: ['Dividing first loses everything after the decimal point: 37 ÷ 80 × 100 = 0. Multiply first.', 'Divide by zero → overflow → fault 0020h unless S:5/0 is unlatched.'],
    },
    NEG: {
      summary: 'Negate — Dest = −Source.',
      details: `<p>Output instruction. Changes the sign of the source. Negating −32768 overflows (+32768 doesn't fit).</p>${MATH_FLAGS}`,
      example: ['NEG N7:0 N7:1'],
      pitfalls: [],
    },
    CLR: {
      summary: 'Clear — Dest = 0.',
      details: `<p>Output instruction. Sets the destination word to zero. Z flag set; C, V, S cleared.</p>`,
      example: ['XIC I:0/2 CLR N7:0'],
      pitfalls: ['To clear a timer or counter, use RES — it also clears the status bits.'],
    },

    // ---------------- move / logical ----------------
    MOV: {
      summary: 'Move — copies Source into Dest every scan the rung is true.',
      details: `<p>Output instruction. Source may be a constant or a word address; Dest a word address (N7:0, T4:0.PRE, C5:0.ACC, O:0 …). Use it to load setpoints and presets.</p>${MOVE_FLAGS}`,
      example: ['XIC S:1/15 MOV 25 N7:0'],
      pitfalls: ['Moving a negative value into a timer PRE or ACC faults the processor (0034h).', 'MOV into O:0 overwrites every output bit in that word.'],
    },
    MVM: {
      summary: 'Masked Move — copies only the Source bits selected by Mask into Dest.',
      details: `<p>Operands: Source, Mask, Dest. Dest bits where the mask is 1 take the source bit; bits where the mask is 0 are left alone. Useful to change a few outputs in a word without touching the others.</p>${MOVE_FLAGS}`,
      example: ['MVM N7:0 000Fh O:0'],
      pitfalls: [],
    },
    AND: {
      summary: 'Bitwise AND — each Dest bit = A bit AND B bit.',
      details: `<p>Output instruction working on all 16 bits at once. Often used with a constant to keep only some bits: <code>AND I:0 000Fh N7:0</code> keeps inputs 0–3.</p>${MOVE_FLAGS}`,
      example: ['AND I:0 000Fh N7:0'],
      pitfalls: ['This is a word instruction, not the same as putting two XICs in series.'],
    },
    OR: {
      summary: 'Bitwise inclusive OR — each Dest bit = A bit OR B bit.',
      details: `<p>Output instruction working on all 16 bits. Used to force certain bits on in a word.</p>${MOVE_FLAGS}`,
      example: ['OR N7:0 0100h N7:1'],
      pitfalls: [],
    },
    XOR: {
      summary: 'Bitwise exclusive OR — each Dest bit is 1 where the A and B bits differ.',
      details: `<p>Output instruction. Handy to find which bits changed between two words: the result is 0 if they are identical.</p>${MOVE_FLAGS}`,
      example: ['XOR N7:0 N7:1 N7:2'],
      pitfalls: [],
    },
    NOT: {
      summary: 'Not — Dest = Source with every bit inverted.',
      details: `<p>Output instruction. <code>NOT 0 N7:0</code> gives FFFFh (−1).</p>${MOVE_FLAGS}`,
      example: ['NOT N7:0 N7:1'],
      pitfalls: ['Not the same as XIO: NOT works on a whole word and is an output instruction.'],
    },

    // ---------------- program control ----------------
    JMP: {
      summary: 'Jump to Label — when true, continues the scan at the rung that starts with the matching LBL.',
      details: `<p>Operand: label number, e.g. <code>Q2:1</code>. The label must be in the same program file. Rungs that are jumped over are not scanned: their outputs freeze and their timers stop updating.</p>`,
      example: ['XIC I:0/0 JMP Q2:1', 'XIC I:0/1 OTE O:0/0', 'LBL Q2:1 XIC I:0/2 OTE O:0/1'],
      pitfalls: ['Jumping backwards creates a loop; an endless loop trips the watchdog (fault 0022h).', 'Outputs in skipped rungs stay in their last state.'],
    },
    LBL: {
      summary: 'Label — the target of a JMP. Must be the first instruction on its rung; always true.',
      details: `<p>Operand: label number <code>Q2:n</code>. Each label number may appear only once per program file.</p>`,
      example: ['XIC I:0/0 JMP Q2:5', 'XIC I:0/1 OTE O:0/0', 'LBL Q2:5 XIC I:0/2 OTE O:0/1'],
      pitfalls: [],
    },
    JSR: {
      summary: 'Jump to Subroutine — when true, runs every rung of the given program file, then returns.',
      details: `<p>Operand: program file number, <code>U:3</code> up to <code>U:15</code> on the MicroLogix 1000. The subroutine file must exist (LAD 3, LAD 4 …). Only LAD 2 is scanned automatically.</p>`,
      example: ['XIC I:0/0 JSR U:3'],
      exampleSubs: { 3: ['XIC I:0/1 OTE O:0/0'] },
      pitfalls: ['A subroutine that is not called is not scanned: its OTEs keep their last state.', 'A subroutine that calls itself nests until the processor faults.'],
    },
    SBR: {
      summary: 'Subroutine — optional marker at the start of a subroutine file; always true.',
      details: `<p>If used, it must be the first instruction on the first rung of the subroutine file. On some SLC processors it also receives parameters passed by JSR; PLCsim doesn't pass parameters.</p>`,
      example: ['XIC I:0/0 JSR U:3'],
      exampleSubs: { 3: ['SBR XIC I:0/1 OTE O:0/0'] },
      pitfalls: [],
    },
    RET: {
      summary: 'Return from Subroutine — when true, ends the subroutine and returns to the rung after the JSR.',
      details: `<p>Reaching the end of the subroutine file also returns, so RET is only needed to return early (or conditionally).</p>`,
      example: ['XIC I:0/0 JSR U:3'],
      exampleSubs: { 3: ['XIC I:0/1 RET', 'XIC I:0/2 OTE O:0/0'] },
      pitfalls: ['Rungs after a true RET are not scanned — their outputs freeze.'],
    },
    MCR: {
      summary: 'Master Control Reset — used in pairs to fence a zone of rungs that can be switched off as a group.',
      details: `<p>The first MCR has conditions (start of zone); the second is alone on its rung (end of zone). When the start rung is false, every rung in the zone is solved as false: OTEs turn off and TONs reset, while retentive instructions (OTL/OTU, RTO, counters) keep their values.</p>`,
      example: ['XIC I:0/0 MCR', 'XIC I:0/1 OTE O:0/0', 'MCR'],
      pitfalls: ['Not a substitute for a hard-wired master control relay or emergency stop.', 'Don\'t nest or overlap MCR zones, and don\'t jump into one.'],
    },
    TND: {
      summary: 'Temporary End — when true, ends the program scan at this rung.',
      details: `<p>The rest of the program is skipped, I/O is updated and the next scan starts at the top. Mainly a debugging tool.</p>`,
      example: ['XIC I:0/5 TND', 'XIC I:0/0 OTE O:0/0'],
      pitfalls: ['Rungs below a true TND are not scanned — their outputs freeze.'],
    },

    // ---------------- file / shift / sequencer ----------------
    BSL: {
      summary: 'Bit Shift Left — on each false → true transition, shifts a bit array one place up and loads a new bit into bit 0.',
      details: `<p>Operands: File (<code>#B3:1</code>), Control (<code>R6:0</code>), Bit Address (the data in), Length (number of bits). The bit shifted out of the top goes into the control element's UL bit. The array occupies whole words (length 20 = 2 words).</p>${CONTROL_LAYOUT}`,
      example: ['XIC I:0/0 BSL #B3:1 R6:0 I:0/1 16', 'XIC B3:1/4 OTE O:0/0'],
      pitfalls: ['Use a different R6 element for every shift register or sequencer.', 'Don\'t use leftover bits in the last word of the array for anything else.'],
    },
    BSR: {
      summary: 'Bit Shift Right — like BSL, but shifts toward bit 0; the new bit enters at the last position and bit 0 goes to UL.',
      details: `<p>Operands: File, Control, Bit Address, Length.</p>${CONTROL_LAYOUT}`,
      example: ['XIC I:0/0 BSR #B3:2 R6:1 I:0/1 8', 'XIC R6:1/UL OTE O:0/0'],
      pitfalls: [],
    },
    SQO: {
      summary: 'Sequencer Output — on each false → true transition, steps to the next word of a table and copies it (through a mask) to a destination.',
      details: `<p>Operands: File (<code>#N7:0</code>), Mask, Dest, Control (R6), Length, Position. Word 0 of the file is position 0 (start-up); steps 1…Length follow, so the file is Length + 1 words. After the last step it wraps to step 1. DN is on at the last step. Only destination bits that are 1 in the mask are changed.</p>${CONTROL_LAYOUT}`,
      example: ['XIC S:1/15 BST MOV 1 N7:11 NXB MOV 2 N7:12 NXB MOV 4 N7:13 BND', 'XIC I:0/0 SQO #N7:10 0007h O:0.0 R6:0 3 0'],
      pitfalls: ['The rung must go false between steps — hold it true and the sequencer stays put.', 'With position 0 at start-up, the first transition shows step 1; until then the outputs are unchanged.'],
    },
    SQC: {
      summary: 'Sequencer Compare — on each false → true transition, steps to the next table word and compares it (through a mask) with a source; FD is set on a match.',
      details: `<p>Operands: File, Mask, Source, Control, Length, Position. The found bit is <code>R6:n/FD</code>. Often paired with an SQO using the same step timing to verify each step's inputs.</p>${CONTROL_LAYOUT}`,
      example: ['XIC S:1/15 BST MOV 1 N7:21 NXB MOV 3 N7:22 BND', 'XIC I:0/5 SQC #N7:20 0003h I:0 R6:2 2 0', 'XIC R6:2/FD OTE O:0/0'],
      pitfalls: [],
    },
    COP: {
      summary: 'Copy File — copies a block of Length words from a source file to a destination file every scan the rung is true.',
      details: `<p>Operands: Source (<code>#N7:0</code>), Dest (<code>#N7:20</code>), Length (number of elements). No status flags are changed.</p>`,
      example: ['XIC I:0/0 COP #N7:0 #N7:20 5'],
      pitfalls: ['The copy must fit in both files — running past the end of a file is an error.'],
    },
    FLL: {
      summary: 'Fill File — writes one value into Length words of a destination file every scan the rung is true.',
      details: `<p>Operands: Source (constant or word), Dest (<code>#N7:30</code>), Length. Handy for clearing a table: <code>FLL 0 #N7:30 10</code>.</p>`,
      example: ['XIC I:0/0 FLL 0 #N7:30 10'],
      pitfalls: [],
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
