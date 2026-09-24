/*
 * Lessons: an introductory PLC course for the MicroLogix 1000 / RSLogix 500.
 *
 * Lesson fields:
 *   id, unit, title, minutes
 *   body       HTML. Special blocks rendered by the app:
 *                <div class="ladder" data-rungs="RUNG|RUNG" data-desc='{"I:0/0":"Start"}'></div>
 *                <div class="callout tip|warn|note|lab">…</div>
 *                <button class="try" data-example="ID">…</button>
 *                <button class="go-challenge" data-challenge="ID">…</button>
 *   examples   [{ id, title, scene, rungs, subs?, desc, comments?, notes }]
 *              (subs = {fileNumber: [rungs]} for subroutine files)
 *   quiz       [{ q, choices, answer, why }]
 *   challenges [challenge ids]
 *
 * Every example compiles on the default ML1000-16 profile (tests/content.js).
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  const U1 = 'Unit 1 · Foundations';
  const U2 = 'Unit 2 · Basic logic';
  const U3 = 'Unit 3 · Timers';
  const U4 = 'Unit 4 · Counters & data';
  const U5 = 'Unit 5 · Program structure & troubleshooting';

  // ---------------- shared SVG figures ----------------
  const SVG_BLOCK = `
<svg viewBox="0 0 660 190" width="100%" style="max-width:660px" role="img" aria-label="Input devices feed the PLC input terminals, the CPU runs the program, and output terminals drive output devices">
  <defs><marker id="arA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <g fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="8" y="30" width="140" height="130" rx="8"/>
    <rect x="190" y="30" width="80" height="130" rx="6"/>
    <rect x="290" y="30" width="100" height="130" rx="6" stroke="var(--accent)" stroke-width="2"/>
    <rect x="410" y="30" width="80" height="130" rx="6"/>
    <rect x="530" y="30" width="122" height="130" rx="8"/>
    <path d="M150,95 H186" marker-end="url(#arA)"/><path d="M272,95 H286" marker-end="url(#arA)"/>
    <path d="M392,95 H406" marker-end="url(#arA)"/><path d="M492,95 H526" marker-end="url(#arA)"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="inherit">
    <text x="78" y="22" text-anchor="middle" font-weight="bold">INPUT DEVICES</text>
    <text x="20" y="58">START / STOP buttons</text><text x="20" y="82">Selector switches</text>
    <text x="20" y="106">Limit switches</text><text x="20" y="130">Photo-eyes, floats</text>
    <text x="230" y="22" text-anchor="middle" font-weight="bold">INPUTS</text>
    <text x="230" y="80" text-anchor="middle">I:0/0</text><text x="230" y="98" text-anchor="middle">I:0/1</text><text x="230" y="116" text-anchor="middle">…</text>
    <text x="340" y="22" text-anchor="middle" font-weight="bold" fill="var(--accent)">CPU</text>
    <text x="340" y="70" text-anchor="middle">memory:</text><text x="340" y="88" text-anchor="middle">program +</text><text x="340" y="106" text-anchor="middle">data table</text>
    <text x="340" y="134" text-anchor="middle" fill="var(--muted)">(solves logic)</text>
    <text x="450" y="22" text-anchor="middle" font-weight="bold">OUTPUTS</text>
    <text x="450" y="80" text-anchor="middle">O:0/0</text><text x="450" y="98" text-anchor="middle">O:0/1</text><text x="450" y="116" text-anchor="middle">…</text>
    <text x="591" y="22" text-anchor="middle" font-weight="bold">OUTPUT DEVICES</text>
    <text x="542" y="58">Motor starters</text><text x="542" y="82">Pilot lights</text>
    <text x="542" y="106">Solenoid valves</text><text x="542" y="130">Horns, relays</text>
    <text x="330" y="182" text-anchor="middle" fill="var(--muted)">On a MicroLogix 1000 all three middle blocks are inside one "brick".</text>
  </g>
</svg>`;

  const SVG_RELAY = `
<svg viewBox="0 0 540 150" width="100%" style="max-width:540px" role="img" aria-label="Hard-wired relay start/stop circuit: STOP NC and START NO in series with overload and coil M, M auxiliary contact in parallel with START">
  <g fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M20,15 V135 M520,15 V135"/>
    <path d="M20,50 H90 M110,50 H180 M200,50 H330 M350,50 H420 M448,50 H520"/>
    <path d="M90,38 V62 M110,38 V62 M86,66 L114,34"/>
    <path d="M180,38 V62 M200,38 V62"/>
    <path d="M160,50 V100 H180 M200,100 H220 V50"/>
    <path d="M180,88 V112 M200,88 V112"/>
    <path d="M330,38 V62 M350,38 V62 M326,66 L354,34"/>
    <circle cx="434" cy="50" r="14"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="inherit" text-anchor="middle">
    <text x="20" y="12">L1</text><text x="520" y="12">L2</text>
    <text x="100" y="30">STOP (NC)</text><text x="190" y="30">START (NO)</text>
    <text x="340" y="30">OL (NC)</text><text x="434" y="54">M</text><text x="434" y="80">starter coil</text>
    <text x="190" y="130">M aux contact (seal-in)</text>
  </g>
</svg>`;

  const SVG_SCAN = `
<svg viewBox="0 0 560 270" width="100%" style="max-width:560px" role="img" aria-label="The scan cycle: input scan, program scan, output scan, housekeeping, repeat">
  <defs><marker id="arS" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <g fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="170" y="10" width="220" height="50" rx="10"/>
    <rect x="340" y="110" width="210" height="50" rx="10" stroke="var(--accent)" stroke-width="2"/>
    <rect x="170" y="210" width="220" height="50" rx="10"/>
    <rect x="10" y="110" width="210" height="50" rx="10"/>
    <path d="M392,40 Q445,45 445,106" marker-end="url(#arS)"/>
    <path d="M445,162 Q445,230 394,235" marker-end="url(#arS)"/>
    <path d="M168,235 Q115,230 115,164" marker-end="url(#arS)"/>
    <path d="M115,108 Q115,45 166,38" marker-end="url(#arS)"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="inherit" text-anchor="middle">
    <text x="280" y="31" font-weight="bold">1 · Input scan</text><text x="280" y="49">terminals → input image (I file)</text>
    <text x="445" y="131" font-weight="bold" fill="var(--accent)">2 · Program scan</text><text x="445" y="149">rungs top→bottom, left→right</text>
    <text x="280" y="231" font-weight="bold">3 · Output scan</text><text x="280" y="249">output image (O file) → terminals</text>
    <text x="115" y="131" font-weight="bold">4 · Housekeeping</text><text x="115" y="149">comms, status, watchdog</text>
    <text x="280" y="140" fill="var(--muted)">repeats every</text><text x="280" y="156" fill="var(--muted)">few milliseconds</text>
  </g>
</svg>`;

  const SVG_NO_NC = `
<svg viewBox="0 0 560 170" width="100%" style="max-width:560px" role="img" aria-label="A normally-open START button and a normally-closed STOP button wired from +24 V to PLC inputs">
  <g fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M30,20 V150"/>
    <path d="M30,55 H110 M150,55 H270"/>
    <circle cx="112" cy="55" r="3"/><circle cx="148" cy="55" r="3"/>
    <path d="M104,40 H156 M130,40 V26 M120,26 H140"/>
    <path d="M30,125 H110 M150,125 H270" stroke="var(--on)"/>
    <circle cx="112" cy="125" r="3"/><circle cx="148" cy="125" r="3"/>
    <path d="M104,128 H156 M130,128 V106 M120,106 H140" stroke="var(--on)"/>
    <rect x="270" y="40" width="90" height="30" rx="4"/><rect x="270" y="110" width="90" height="30" rx="4" stroke="var(--on)"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="inherit">
    <text x="10" y="14">+24 V DC</text>
    <text x="130" y="84" text-anchor="middle">START (NO)</text><text x="130" y="158" text-anchor="middle">STOP (NC)</text>
    <text x="315" y="60" text-anchor="middle">I:0/0</text><text x="315" y="130" text-anchor="middle">I:0/1</text>
    <text x="375" y="52">at rest → bit = 0</text><text x="375" y="68">pressed → bit = 1</text>
    <text x="375" y="116" fill="var(--on)">at rest → bit = 1</text><text x="375" y="132">pressed → bit = 0</text>
    <text x="375" y="148">broken wire → bit = 0</text>
  </g>
</svg>`;

  function timing(rows, extra, label) {
    // rows: [[label, pathD, y]]
    return `
<svg viewBox="0 0 500 200" width="100%" style="max-width:520px" role="img" aria-label="${label}">
  <g fill="none" stroke="var(--muted)" stroke-width="0.6" stroke-dasharray="2 4">${[100, 140, 180, 220, 260, 300, 340, 380, 420, 460].map((x) => `<path d="M${x},6 V180"/>`).join('')}</g>
  <g fill="none" stroke="var(--on)" stroke-width="2">${rows.map((r) => `<path d="${r[1]}"/>`).join('')}</g>
  <g fill="currentColor" font-size="12" font-family="inherit">${rows.map((r) => `<text x="4" y="${r[2] - 4}">${r[0]}</text>`).join('')}
    <text x="60" y="196" fill="var(--muted)">0</text><text x="98" y="196" fill="var(--muted)">1</text><text x="138" y="196" fill="var(--muted)">2</text><text x="178" y="196" fill="var(--muted)">3</text><text x="218" y="196" fill="var(--muted)">4</text><text x="258" y="196" fill="var(--muted)">5</text><text x="298" y="196" fill="var(--muted)">6</text><text x="338" y="196" fill="var(--muted)">7</text><text x="378" y="196" fill="var(--muted)">8</text><text x="418" y="196" fill="var(--muted)">9</text><text x="450" y="196" fill="var(--muted)">10 s</text>
  </g>${extra || ''}
</svg>`;
  }
  const SVG_TON = timing([
    ['Rung', 'M60,30 H100 V12 H160 V30 H220 V12 H420 V30 H480', 30],
    ['EN', 'M60,60 H100 V42 H160 V60 H220 V42 H420 V60 H480', 60],
    ['TT', 'M60,90 H100 V72 H160 V90 H220 V72 H340 V90 H480', 90],
    ['DN', 'M60,120 H340 V102 H420 V120 H480', 120],
    ['ACC', 'M60,175 H100 L160,157 V175 H220 L340,139 H420 V175 H480', 175],
  ], `<g fill="currentColor" font-size="11"><path d="M60,139 H480" stroke="var(--accent)" stroke-dasharray="4 3" fill="none"/><text x="484" y="143" fill="var(--accent)">PRE</text><text x="100" y="150" fill="var(--muted)">too short</text></g>`,
  'TON timing diagram, preset 3 seconds');
  const SVG_TOF = timing([
    ['Rung', 'M60,30 H100 V12 H180 V30 H220 V12 H300 V30 H480', 30],
    ['EN', 'M60,60 H100 V42 H180 V60 H220 V42 H300 V60 H480', 60],
    ['TT', 'M60,90 H180 V72 H220 V90 H300 V72 H380 V90 H480', 90],
    ['DN', 'M60,120 H100 V102 H380 V120 H480', 120],
    ['ACC', 'M60,175 H180 L220,157 V175 H300 L380,139 H480', 175],
  ], `<g fill="currentColor" font-size="11"><path d="M60,139 H480" stroke="var(--accent)" stroke-dasharray="4 3" fill="none"/><text x="484" y="143" fill="var(--accent)">PRE</text></g>`,
  'TOF timing diagram, preset 2 seconds');
  const SVG_RTO = timing([
    ['Rung', 'M60,30 H100 V12 H180 V30 H260 V12 H380 V30 H480', 30],
    ['RES', 'M60,60 H440 V42 H455 V60 H480', 60],
    ['TT', 'M60,90 H100 V72 H180 V90 H260 V72 H340 V90 H480', 90],
    ['DN', 'M60,120 H340 V102 H440 V120 H480', 120],
    ['ACC', 'M60,175 H100 L180,157 H260 L340,139 H440 V175 H480', 175],
  ], `<g fill="currentColor" font-size="11"><path d="M60,139 H480" stroke="var(--accent)" stroke-dasharray="4 3" fill="none"/><text x="484" y="143" fill="var(--accent)">PRE</text><text x="190" y="152" fill="var(--muted)">ACC held</text></g>`,
  'RTO timing diagram, preset 4 seconds');

  PLC.LESSONS = [
    // =====================================================================
    // UNIT 1 — FOUNDATIONS
    // =====================================================================
    {
      id: 'what-is-plc',
      unit: U1,
      title: 'What is a PLC?',
      minutes: 12,
      body: `
<p>A <strong>programmable logic controller</strong> (PLC) is a rugged industrial computer that runs a machine. It does three things, over and over, many times a second:</p>
<ol>
<li><strong>Reads inputs</strong> — push buttons, selector switches, limit switches, photo-eyes, float switches.</li>
<li><strong>Solves a program</strong> — logic written by you that decides what should happen.</li>
<li><strong>Writes outputs</strong> — motor starters, pilot lights, solenoid valves, horns.</li>
</ol>
${SVG_BLOCK}
<p>The PLC never "sees" a motor or a button. It only sees <em>voltage or no voltage</em> on each input terminal, and it only switches each output terminal <em>on or off</em>. Everything else is up to the wiring — and your program.</p>

<h3>From relay panels to PLCs</h3>
<p>Before PLCs, machine logic was built from hundreds of electromechanical <strong>relays</strong> wired together in large panels. To change what a machine did, an electrician had to rewire the panel — slow, expensive, and hard to troubleshoot.</p>
<p>In the late 1960s the auto industry (famously General Motors' Hydramatic division, in 1968) asked for a programmable replacement for relay panels. The first PLCs appeared soon after, and Allen-Bradley (now Rockwell Automation) became one of the major PLC makers. Today PLCs run everything from car washes to water plants.</p>

<h3>Why ladder logic looks like a wiring diagram</h3>
<p>Electricians already read <strong>relay ladder diagrams</strong>: two vertical power rails (L1 and L2) with horizontal "rungs" of contacts and coils between them. Here is a classic hard-wired motor start/stop circuit:</p>
${SVG_RELAY}
<p>PLC makers deliberately made the programming language look the same, so electricians could read it on day one. That language is <strong>ladder logic</strong>. The same circuit as a PLC program looks like this:</p>
<div class="ladder" data-rungs="BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIC I:0/2 OTE O:0/0" data-desc='{"I:0/0":"START","O:0/0":"Motor M","I:0/1":"STOP","I:0/2":"Overload"}'></div>
<p>Contacts on the left are <em>conditions</em>; the coil on the right is the <em>action</em>. If there is a continuous path of true conditions from the left rail to the coil, the rung is <strong>true</strong> and the output turns on. You will learn exactly what each symbol means in Unit 2.</p>
<div class="callout note">In a PLC program the rails carry no real voltage. "Power flow" is just a helpful way to picture <em>logical continuity</em>: the CPU evaluates each rung as true or false.</div>

<h3>Meet the MicroLogix 1000</h3>
<p>This course uses the Allen-Bradley <strong>MicroLogix 1000</strong>, programmed with <strong>RSLogix 500</strong> (the same software used for the larger SLC 500 family). It is a <em>brick</em> (or "fixed I/O") controller: power supply, CPU, inputs and outputs are all in one housing. It has no expansion slots — the I/O you buy is the I/O you get.</p>
<table class="tbl">
<tr><th>Model size</th><th>Inputs</th><th>Outputs</th><th>Input addresses</th><th>Output addresses</th></tr>
<tr><td>10-point</td><td>6</td><td>4</td><td>I:0/0 – I:0/5</td><td>O:0/0 – O:0/3</td></tr>
<tr><td><strong>16-point</strong> (PLCsim default)</td><td>10</td><td>6</td><td>I:0/0 – I:0/9</td><td>O:0/0 – O:0/5</td></tr>
<tr><td>32-point</td><td>20</td><td>12</td><td>I:0/0 – I:0/15, I:0.1/0 – I:0.1/3</td><td>O:0/0 – O:0/11</td></tr>
</table>
<p>There are also 20-point versions with analog I/O. On the controller, the input terminals are labelled <code>I/0</code>, <code>I/1</code>, … and the outputs <code>O/0</code>, <code>O/1</code>, … In the program these become <code>I:0/0</code> and <code>O:0/0</code> — "slot 0", because everything is built in.</p>
<p>The catalog number tells you the electrical type. For example, in a <code>1761-L16BWA</code>, "16" is the point count, and the letters describe the inputs (24 V DC), the outputs (relay) and the power supply (120/240 V AC). Always check the exact model in the <em>MicroLogix 1000 User Manual</em> (1761-UM003) before wiring.</p>
<h4>Relay vs. transistor outputs</h4>
<ul>
<li><strong>Relay outputs</strong> have a tiny mechanical relay per output. They can switch AC <em>or</em> DC loads, but they are slow and wear out after many operations — don't use them to flash a light several times a second for years.</li>
<li><strong>Transistor (DC) outputs</strong> are solid state: fast and no wear, but DC loads only, with a maximum current per point.</li>
</ul>
<div class="callout lab"><strong>In the lab:</strong> before you apply power, check that the supply voltage matches the model's label (connecting 120 V AC to a 24 V DC unit destroys it). You'll connect the PC to the controller's 8-pin mini-DIN serial port — commonly with a 1761-CBL-PM02 cable — and use RSLinx to set up the communication driver for RSLogix 500.</div>
<div class="callout note">PLCsim simulates the <em>logic</em> of a MicroLogix 1000, not its electrical side. In PLCsim you "wire" devices by picking an animated scene.</div>

<h3>Your first rung</h3>
<p>The simplest useful program: when switch <code>I:0/0</code> is on, turn light <code>O:0/0</code> on.</p>
<div class="ladder" data-rungs="XIC I:0/0 OTE O:0/0" data-desc='{"I:0/0":"Switch","O:0/0":"Light"}'></div>
<button class="try" data-example="ex-first-rung">Load example: your first rung</button>
`,
      examples: [
        {
          id: 'ex-first-rung',
          title: 'Your first rung',
          scene: 'trainer',
          rungs: ['XIC I:0/0 OTE O:0/0'],
          desc: { 'I:0/0': 'Switch', 'O:0/0': 'Light' },
          comments: ['When switch I:0/0 is ON, light O:0/0 is ON.'],
          notes: '<p>Put the controller in <strong>RUN</strong>, then click input <code>I:0/0</code> on the trainer. Watch the rung highlight and output <code>O:0/0</code> turn on. Turn the input off again.</p>',
        },
      ],
      quiz: [
        { q: 'Which of these is an <strong>input</strong> device?', choices: ['Motor starter', 'Pilot light', 'Limit switch', 'Solenoid valve'], answer: 2,
          why: 'A limit switch tells the PLC something about the machine, so it is wired to an input. The others are things the PLC switches on and off (outputs).' },
        { q: 'Why does ladder logic look like a relay wiring diagram?', choices: ['So electricians who already read relay diagrams could program and troubleshoot PLCs', 'Because the CPU is built from relays', 'Because the program actually carries 24 V between the rails', 'It is required by the electrical code'], answer: 0,
          why: 'Ladder logic was designed to replace relay panels, so it copied the diagrams that maintenance electricians already knew.' },
        { q: 'How many inputs and outputs does a 16-point MicroLogix 1000 have?', choices: ['16 in / 16 out', '10 in / 6 out', '6 in / 4 out', '8 in / 8 out'], answer: 1,
          why: 'The 16-point models have 10 inputs (I:0/0–I:0/9) and 6 outputs (O:0/0–O:0/5).' },
        { q: 'A machine needs to switch a 120 V AC solenoid and a 24 V DC lamp from the same output group. Which output type handles both?', choices: ['Transistor (DC) outputs', 'Relay outputs', 'Neither — PLCs can only switch DC', 'Analog outputs'], answer: 1,
          why: 'Relay contacts don\'t care whether the load is AC or DC (within their ratings). Transistor outputs switch DC only.' },
      ],
      challenges: [],
    },

    {
      id: 'numbers',
      unit: U1,
      title: 'Bits, words and number systems',
      minutes: 15,
      body: `
<p>Everything inside a PLC is stored as <strong>bits</strong>. A bit has only two values: <strong>1</strong> (on, true) or <strong>0</strong> (off, false). An input bit is 1 when its terminal has voltage; an output bit is 1 when the program wants that output on.</p>

<h3>Words</h3>
<p>Bits are grouped into <strong>words</strong>. On SLC 500 and MicroLogix controllers a word is <strong>16 bits</strong>, numbered 0 (right-most, least significant) to 15 (left-most, most significant).</p>
<table class="tbl">
<tr><th>Bit</th><td>15</td><td>14</td><td>13</td><td>12</td><td>11</td><td>10</td><td>9</td><td>8</td><td>7</td><td>6</td><td>5</td><td>4</td><td>3</td><td>2</td><td>1</td><td>0</td></tr>
<tr><th>Place value</th><td>(sign)</td><td>16384</td><td>8192</td><td>4096</td><td>2048</td><td>1024</td><td>512</td><td>256</td><td>128</td><td>64</td><td>32</td><td>16</td><td>8</td><td>4</td><td>2</td><td>1</td></tr>
<tr><th>25 =</th><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td><strong>1</strong></td><td><strong>1</strong></td><td>0</td><td>0</td><td><strong>1</strong></td></tr>
</table>

<h3>Binary ↔ decimal</h3>
<p>Each bit position is worth twice the one to its right. To read a binary number, add up the place values of the 1 bits: <code>0000 0000 0001 1001</code> = 16 + 8 + 1 = <strong>25</strong>.</p>
<p>To go the other way, subtract the biggest place value that fits, write a 1 there, and repeat: 25 − 16 = 9 → 9 − 8 = 1 → 1 − 1 = 0, so bits 4, 3 and 0 are 1.</p>

<h3>Hexadecimal</h3>
<p>Long binary numbers are hard to read, so we group them in fours. Each group of 4 bits is one <strong>hex</strong> digit, 0–9 then A–F (A = 10 … F = 15).</p>
<table class="tbl">
<tr><th>Binary</th><td>0000 0000 0001 1001</td><td>0000 0000 0011 1111</td><td>1111 1111 1111 1111</td></tr>
<tr><th>Hex</th><td>0019h</td><td>003Fh</td><td>FFFFh</td></tr>
<tr><th>Decimal</th><td>25</td><td>63</td><td>−1 (see below)</td></tr>
</table>
<p>RSLogix 500 marks hex constants with a trailing <code>h</code>, like <code>003Fh</code>. You'll use hex for <em>masks</em> — patterns that pick out certain bits of a word.</p>

<h3>BCD</h3>
<p><strong>Binary-coded decimal</strong> stores each <em>decimal</em> digit in its own 4 bits. Thumbwheel switches and older 7-segment displays use it. Decimal 47 in BCD is <code>0100 0111</code> (4, then 7). Careful: read as plain binary that same pattern is 71! RSLogix 500 has convert instructions (TOD, FRD) for BCD; they are not simulated in PLCsim.</p>

<h3>Signed integers: −32768 to 32767</h3>
<p>Integer words (like <code>N7:0</code>) are <strong>signed</strong>. Bit 15 is the sign bit, using a system called <em>two's complement</em>. The range is <strong>−32768 to +32767</strong>. All ones (<code>FFFFh</code>) is −1.</p>
<div class="callout warn">If a math result doesn't fit in that range, it <strong>overflows</strong>. On a MicroLogix 1000 an unhandled overflow stops the processor with a major fault (you'll see how in Unit 4).</div>
<p>The MicroLogix 1000 has <strong>no floating-point (decimal) file</strong> — there is no F8. All data are whole numbers. That's why timers count in steps of a <em>time base</em> (1 s or 0.01 s), and why division rounds to a whole number.</p>

<h3>See it in the simulator</h3>
<p>These rungs store the same number three ways, and copy the whole input word into <code>N7:3</code>:</p>
<div class="ladder" data-rungs="MOV 25 N7:0|MOV 0019h N7:1|MOV I:0 N7:3" data-desc='{"N7:0":"Decimal 25","N7:1":"Hex 19h","N7:3":"Input word"}'></div>
<button class="try" data-example="ex-number-formats">Load example: number formats</button>
<div class="callout tip">In RSLogix 500's data table view you can change the <strong>radix</strong> (binary, decimal, hex…) that a file is displayed in. The value stored doesn't change — only how you look at it.</div>
`,
      examples: [
        {
          id: 'ex-number-formats',
          title: 'Number formats',
          scene: 'trainer',
          rungs: ['MOV 25 N7:0', 'MOV 0019h N7:1', 'MOV I:0 N7:3'],
          desc: { 'N7:0': 'Decimal 25', 'N7:1': 'Hex 19h', 'N7:3': 'Copy of input word' },
          comments: ['Decimal constant.', 'The same value written in hex.', 'Copy the whole input word — every input bit becomes one bit of N7:3.'],
          notes: '<p>Go to RUN and open the data table. <code>N7:0</code> and <code>N7:1</code> both hold 25. Now turn on inputs <code>I:0/0</code>, <code>I:0/3</code> and <code>I:0/4</code>: <code>N7:3</code> becomes 1 + 8 + 16 = 25. Try other combinations and predict the value first.</p>',
        },
      ],
      quiz: [
        { q: 'How many bits are in one N7 integer word on a MicroLogix 1000?', choices: ['8', '12', '16', '32'], answer: 2, why: 'SLC 500 and MicroLogix words are 16 bits, numbered 0–15.' },
        { q: 'What is binary <code>0000 0000 0000 1010</code> in decimal?', choices: ['10', '12', '5', '1010'], answer: 0, why: 'Bits 3 and 1 are on: 8 + 2 = 10.' },
        { q: 'What is the largest value an N7 word can hold?', choices: ['65535', '32767', '9999', '32768'], answer: 1, why: 'Signed 16-bit integers range from −32768 to +32767.' },
        { q: 'What is <code>2Ah</code> in decimal?', choices: ['20', '42', '32', '210'], answer: 1, why: '2 × 16 + A (10) = 42.' },
        { q: 'A thumbwheel switch sends the BCD pattern <code>0100 0111</code>. What number is the operator dialling?', choices: ['71', '47', '4', '17'], answer: 1, why: 'In BCD each 4-bit group is one decimal digit: 0100 = 4, 0111 = 7.' },
      ],
      challenges: [],
    },

    {
      id: 'addressing',
      unit: U1,
      title: 'Addresses and data files',
      minutes: 15,
      body: `
<p>The PLC's memory has two parts: the <strong>program files</strong> (your ladder logic) and the <strong>data files</strong> (the data table) — the bits and words the program reads and writes. Every data location has an <strong>address</strong>.</p>

<h3>The data files</h3>
<table class="tbl">
<tr><th>File</th><th>Type</th><th>What it holds</th><th>ML1000 size</th></tr>
<tr><td>O0</td><td>Output</td><td>Output image — one bit per output terminal</td><td>fixed by the I/O</td></tr>
<tr><td>I1</td><td>Input</td><td>Input image — one bit per input terminal</td><td>fixed by the I/O</td></tr>
<tr><td>S2</td><td>Status</td><td>Processor status: first-scan bit, math flags, fault codes, clock</td><td>fixed</td></tr>
<tr><td>B3</td><td>Bit</td><td>Internal bits ("internal relays")</td><td>32 words = 512 bits</td></tr>
<tr><td>T4</td><td>Timer</td><td>Timers (3 words each)</td><td>40 timers, T4:0–T4:39</td></tr>
<tr><td>C5</td><td>Counter</td><td>Counters (3 words each)</td><td>32 counters, C5:0–C5:31</td></tr>
<tr><td>R6</td><td>Control</td><td>Control elements for shift registers, sequencers</td><td>16, R6:0–R6:15</td></tr>
<tr><td>N7</td><td>Integer</td><td>Signed 16-bit numbers</td><td>105 words, N7:0–N7:104</td></tr>
</table>
<p>On larger controllers you can create more files (N10, F8 floats, and so on). On the <strong>MicroLogix 1000 the files and their sizes are fixed</strong>, and there is no F8 float file.</p>

<h3>Reading an address</h3>
<p>An address is: <em>file type letter + file number</em>, a colon, the <em>element</em> (word) number, then either <code>/bit</code> or <code>.sub-element</code>.</p>
<table class="tbl">
<tr><th>Address</th><th>Means</th></tr>
<tr><td><code>I:0/3</code></td><td>Input, slot 0, bit 3 — terminal I/3</td></tr>
<tr><td><code>O:0/1</code></td><td>Output, slot 0, bit 1 — terminal O/1</td></tr>
<tr><td><code>I:0.1/2</code></td><td>Input slot 0, <em>word 1</em>, bit 2 (input 18 on a 32-point model)</td></tr>
<tr><td><code>B3:0/5</code></td><td>Bit file 3, word 0, bit 5</td></tr>
<tr><td><code>B3/21</code></td><td>Bit 21 of file B3, counted straight through = <code>B3:1/5</code> (21 = 16 + 5)</td></tr>
<tr><td><code>N7:0</code></td><td>Integer file 7, word 0 (the whole number)</td></tr>
<tr><td><code>N7:0/3</code></td><td>Bit 3 of N7:0</td></tr>
<tr><td><code>T4:0/DN</code></td><td>Timer 0's done bit</td></tr>
<tr><td><code>T4:0.ACC</code></td><td>Timer 0's accumulated value (a word)</td></tr>
<tr><td><code>C5:2.PRE</code></td><td>Counter 2's preset</td></tr>
<tr><td><code>S:1/15</code></td><td>Status word 1, bit 15 — the first-scan bit</td></tr>
</table>
<p>For I, O and S the file number is implied (I is always file 1), so you write <code>I:0/3</code>, not <code>I1:0/3</code>. And that first letter is the letter <strong>O</strong>, not zero.</p>
<div class="callout note">On a modular SLC 500 the number after the colon is the <em>slot</em> the I/O card sits in, e.g. <code>I:1/0</code> for a card in slot 1. The MicroLogix 1000 has only built-in I/O, so it is always slot 0. If you switch PLCsim to an SLC profile, the scenes' I/O addresses are moved to that controller's slots.</div>

<h3>Descriptions</h3>
<p>Addresses are short but cryptic. RSLogix 500 lets you attach a <strong>description</strong> (like "START PB") to any address; it's shown above the instruction. Good descriptions are the cheapest troubleshooting tool there is.</p>

<h3>Addresses in action</h3>
<div class="ladder" data-rungs="XIC I:0/3 OTE B3:0/5|XIC B3/5 OTE O:0/1|XIC I:0/0 TON T4:0 1.0 3 0|XIC T4:0/DN OTE O:0/0" data-desc='{"I:0/3":"Switch 3","B3:0/5":"Internal bit","O:0/1":"Light 1","I:0/0":"Switch 0","O:0/0":"Light 0"}'></div>
<p>Rung 0 writes <code>B3:0/5</code>; rung 1 reads the <em>same bit</em> using the bit-number form <code>B3/5</code>. Rungs 2 and 3 use a timer's done bit.</p>
<button class="try" data-example="ex-addresses">Load example: addresses in action</button>
`,
      examples: [
        {
          id: 'ex-addresses',
          title: 'Addresses in action',
          scene: 'trainer',
          rungs: ['XIC I:0/3 OTE B3:0/5', 'XIC B3/5 OTE O:0/1', 'XIC I:0/0 TON T4:0 1.0 3 0', 'XIC T4:0/DN OTE O:0/0'],
          desc: { 'I:0/3': 'Switch 3', 'B3:0/5': 'Internal bit', 'O:0/1': 'Light 1', 'I:0/0': 'Switch 0', 'O:0/0': 'Light 0' },
          comments: ['Input bit → internal bit.', 'B3/5 is the same bit as B3:0/5.', 'Timer 0 times while switch 0 is on.', 'Its done bit (a bit inside the timer element) drives light 0.'],
          notes: '<p>Run it. Turn on <code>I:0/3</code> and watch <code>B3:0/5</code> in the data table, then light 1. Turn on <code>I:0/0</code> and watch <code>T4:0.ACC</code> count to 3 before <code>T4:0/DN</code> turns light 0 on.</p>',
        },
      ],
      quiz: [
        { q: 'Which bit does <code>B3/21</code> refer to?', choices: ['B3:21/0', 'B3:2/1', 'B3:1/5', 'B3:0/21'], answer: 2, why: 'Bit-number form counts straight through: bit 21 = word 1 (16 bits) + bit 5.' },
        { q: 'What is the address of the done bit of timer 2?', choices: ['T4:2.DN', 'T4:2/DN', 'T2:4/DN', 'T4/2DN'], answer: 1, why: 'Bits use a slash: T4:2/DN. Words use a dot: T4:2.ACC.' },
        { q: 'On a 16-point MicroLogix 1000, which address does NOT exist?', choices: ['I:0/9', 'O:0/5', 'I:0/12', 'N7:104'], answer: 2, why: 'The 16-point model has inputs I:0/0 to I:0/9 only.' },
        { q: 'Which file would you use to store a whole number such as a recipe setpoint?', choices: ['B3', 'N7', 'O0', 'I1'], answer: 1, why: 'N7 is the integer file: signed 16-bit words.' },
        { q: 'What kind of file is S2?', choices: ['Sequencer', 'Status', 'Subroutine', 'String'], answer: 1, why: 'S2 is the status file — the first-scan bit S:1/15, math flags S:0, the fault code S:6 and more.' },
      ],
      challenges: [],
    },

    {
      id: 'scan-cycle',
      unit: U1,
      title: 'The scan cycle',
      minutes: 14,
      body: `
<p>A PLC doesn't solve the whole program at once. It runs a loop called the <strong>scan cycle</strong>, over and over, as long as it is in RUN mode:</p>
${SVG_SCAN}
<ol>
<li><strong>Input scan</strong> — the CPU reads every input terminal and copies it into the <em>input image</em> (the I file).</li>
<li><strong>Program scan</strong> — the CPU solves the ladder program <strong>one rung at a time, top to bottom</strong>, and each rung <strong>left to right</strong>. Results go into the data table immediately.</li>
<li><strong>Output scan</strong> — the CPU copies the <em>output image</em> (the O file) to the output terminals.</li>
<li><strong>Housekeeping</strong> — communications with the programming PC, updating status bits, checking the watchdog timer.</li>
</ol>

<h3>The image tables</h3>
<p>During the program scan, <code>XIC I:0/0</code> reads the <strong>input image</strong>, not the terminal. If a sensor changes halfway through the program scan, the program doesn't notice until the next input scan. That keeps every rung consistent within one scan.</p>
<p>Likewise, <code>OTE O:0/0</code> only writes the <strong>output image</strong>. The real terminal changes at the output scan. If two rungs write the same output, only the one solved <em>last</em> gets to the terminal (more on this "double coil" mistake in lesson 10).</p>
<div class="callout warn">A very short input pulse — shorter than one scan — can be missed completely. Fast signals need special hardware such as a high-speed counter.</div>

<h3>Why rung order matters</h3>
<p>Results are visible to rungs <em>below</em> immediately, but to rungs <em>above</em> only on the next scan:</p>
<div class="ladder" data-rungs="XIC B3:0/1 OTE O:0/1|XIC I:0/0 OTE B3:0/1|XIC B3:0/1 OTE O:0/2" data-desc='{"B3:0/1":"Memory bit","I:0/0":"Switch","O:0/1":"Light above","O:0/2":"Light below"}'></div>
<p>Turn on <code>I:0/0</code>. In the first scan, rung 0 still sees the old value of <code>B3:0/1</code> (0). Rung 1 sets it. Rung 2 sees the new value, so <code>O:0/2</code> turns on in scan 1 — but <code>O:0/1</code> waits until scan 2. One scan is only milliseconds, but in sequences and one-shots it makes a real difference.</p>
<button class="try" data-example="ex-scan-order">Load example: scan order</button>
<p>Use PLCsim's <kbd>Step scan</kbd> button to run exactly one scan at a time and watch this happen.</p>

<h3>Scan time and the watchdog</h3>
<p>The time for one full loop is the <strong>scan time</strong> — typically a few milliseconds on a MicroLogix, longer for bigger programs. The processor also runs a <strong>watchdog</strong>: if a scan takes longer than the watchdog limit (100 ms by default on SLC/MicroLogix, set in the status file), the processor stops with major fault <code>0022h</code>. That usually means the program is stuck in a loop.</p>
<div class="callout note"><strong>PLCsim vs. real hardware:</strong> PLCsim runs one scan every 10 ms of simulated time, always. A real MicroLogix scans as fast as it can, and the scan time varies a little from scan to scan. That's why PLCsim timers move in 10 ms steps.</div>

<h3>Operating modes</h3>
<ul>
<li><strong>PROGRAM</strong> — the program is not scanned and outputs are off. You edit and download here.</li>
<li><strong>RUN</strong> — the scan cycle runs and outputs are live.</li>
<li><strong>TEST</strong> — the program is scanned but outputs are held off (RSLogix offers single-scan and continuous test modes). PLCsim's <kbd>Step scan</kbd> works like single-scan test mode.</li>
</ul>
<div class="callout lab">The MicroLogix 1000 has no key switch; you change its mode from RSLogix 500 while online (the "REM" remote modes). When you go to RUN on real equipment, the machine may move — make sure everyone is clear first.</div>
`,
      examples: [
        {
          id: 'ex-scan-order',
          title: 'Scan order',
          scene: 'trainer',
          rungs: ['XIC B3:0/1 OTE O:0/1', 'XIC I:0/0 OTE B3:0/1', 'XIC B3:0/1 OTE O:0/2'],
          desc: { 'B3:0/1': 'Memory bit', 'I:0/0': 'Switch', 'O:0/1': 'Light above', 'O:0/2': 'Light below' },
          comments: ['Examines B3:0/1 BEFORE it is written this scan.', 'Writes B3:0/1.', 'Examines B3:0/1 AFTER it is written this scan.'],
          notes: '<p>Stay in PROGRAM mode. Turn on <code>I:0/0</code>, then press <kbd>Step scan</kbd> once: the <code>O:0/2</code> bit turns on but <code>O:0/1</code> doesn\'t. Step once more and <code>O:0/1</code> follows. Turn the switch off and step again to see the same delay on the way off.</p>',
        },
      ],
      quiz: [
        { q: 'What is the order of the scan cycle?', choices: ['Program scan → input scan → output scan', 'Input scan → program scan → output scan → housekeeping', 'Output scan → input scan → program scan', 'All at the same time'], answer: 1, why: 'Read inputs, solve the program, write outputs, then housekeeping — and repeat.' },
        { q: 'While the program is being solved, what does <code>XIC I:0/0</code> examine?', choices: ['The voltage on the terminal at that exact moment', 'The input image bit copied during the last input scan', 'The output image', 'Whatever the programming PC sends'], answer: 1, why: 'Inputs are read once per scan into the input image; every instruction reads the image.' },
        { q: 'Rung 5 sets <code>B3:0/0</code>. Rung 2 examines it. When does rung 2 first see the new value?', choices: ['In the same scan', 'In the next scan', 'Only after an output scan to the terminal', 'Never'], answer: 1, why: 'Rung 2 was already solved before rung 5 ran, so it sees the change on the next scan.' },
        { q: 'A photo-eye gives a 2 ms pulse and the scan time is 10 ms. What can happen?', choices: ['The PLC always catches it', 'The PLC may miss the pulse completely', 'The PLC faults', 'The output scan catches it'], answer: 1, why: 'If the pulse starts and ends between two input scans, it never appears in the input image.' },
        { q: 'A program gets stuck in a loop and a scan never finishes. What happens?', choices: ['Nothing, it waits', 'The watchdog times out and the processor faults (0022h)', 'Outputs keep updating', 'It skips to the next rung'], answer: 1, why: 'The watchdog limits scan time. Exceeding it is a major fault, 0022h.' },
      ],
      challenges: [],
    },

    // =====================================================================
    // UNIT 2 — BASIC LOGIC
    // =====================================================================
    {
      id: 'xic-xio-ote',
      unit: U2,
      title: 'XIC, XIO and OTE',
      minutes: 15,
      body: `
<p>Three instructions do most of the work in any ladder program:</p>
<table class="tbl">
<tr><th>Instruction</th><th>Symbol</th><th>Name</th><th>Rule</th></tr>
<tr><td><code>XIC</code></td><td><code>—] [—</code></td><td>Examine If Closed</td><td>True when its bit is <strong>1</strong></td></tr>
<tr><td><code>XIO</code></td><td><code>—]/[—</code></td><td>Examine If Open</td><td>True when its bit is <strong>0</strong></td></tr>
<tr><td><code>OTE</code></td><td><code>—( )—</code></td><td>Output Energize</td><td>Writes 1 to its bit when the rung is true, 0 when false</td></tr>
</table>

<h3>"Closed" and "open" are about the bit, not the switch</h3>
<p>This is the most important idea in the course. XIC and XIO do <strong>not</strong> know whether the field device is a normally-open or normally-closed switch. They only look at a <strong>bit in memory</strong> and ask a question:</p>
<ul>
<li><code>XIC</code>: "Is this bit ON (1)?" — if yes, I'm true.</li>
<li><code>XIO</code>: "Is this bit OFF (0)?" — if yes, I'm true.</li>
</ul>
<p>The names come from relays: imagine each bit is a relay coil. If the coil is energised, its normally-open contact is <em>closed</em> — so XIC ("examine if closed") passes power. If the coil is off, its normally-closed contact is still closed — so XIO passes power.</p>
<table class="tbl">
<tr><th>Bit value</th><th>XIC is…</th><th>XIO is…</th></tr>
<tr><td>0</td><td>false</td><td><strong>true</strong></td></tr>
<tr><td>1</td><td><strong>true</strong></td><td>false</td></tr>
</table>

<h3>OTE writes every scan</h3>
<p>OTE is an output instruction: it goes on the <strong>right</strong> end of the rung. Each scan it looks at the rung condition to its left and writes the result into its bit — 1 if true, 0 if false. It does this every scan, which is why an OTE output follows its conditions instantly.</p>
<div class="ladder" data-rungs="XIC I:0/0 OTE O:0/0|XIO I:0/0 OTE O:0/1" data-desc='{"I:0/0":"Switch","O:0/0":"ON light","O:0/1":"OFF light"}'></div>
<p>With the switch off, rung 0 is false (<code>O:0/0</code> = 0) and rung 1 is true (<code>O:0/1</code> = 1). Flip the switch and they swap.</p>
<button class="try" data-example="ex-xic-xio">Load example: XIC and XIO</button>

<h3>Rules of the rung</h3>
<ul>
<li>Input (condition) instructions on the left, output instructions on the <strong>right</strong>. RSLogix won't accept an input instruction after an output.</li>
<li>You can examine the same bit with XIC or XIO <strong>as many times as you like</strong> — unlike a real relay, there's no limit on contacts.</li>
<li>A rung may have several outputs, placed in parallel at the right end:</li>
</ul>
<div class="ladder" data-rungs="XIC I:0/0 BST OTE O:0/0 NXB OTE O:0/2 BND" data-desc='{"I:0/0":"Switch","O:0/0":"Light 0","O:0/2":"Light 2"}'></div>
<button class="try" data-example="ex-parallel-outputs">Load example: two outputs on one rung</button>
<div class="callout tip">When you're online in RSLogix 500 (and in PLCsim), instructions that are currently true are highlighted. Following the highlighting from left to right is how you find out <em>why</em> an output is off.</div>
<button class="go-challenge" data-challenge="c-light-switch">Try the challenge: pilot lights on a selector switch</button>
`,
      examples: [
        {
          id: 'ex-xic-xio',
          title: 'XIC and XIO',
          scene: 'trainer',
          rungs: ['XIC I:0/0 OTE O:0/0', 'XIO I:0/0 OTE O:0/1'],
          desc: { 'I:0/0': 'Switch', 'O:0/0': 'ON light', 'O:0/1': 'OFF light' },
          comments: ['True when I:0/0 is 1.', 'True when I:0/0 is 0.'],
          notes: '<p>Run it and toggle <code>I:0/0</code>. Watch which instruction is highlighted: exactly one of the two rungs is true at any time.</p>',
        },
        {
          id: 'ex-parallel-outputs',
          title: 'Two outputs on one rung',
          scene: 'trainer',
          rungs: ['XIC I:0/0 BST OTE O:0/0 NXB OTE O:0/2 BND'],
          desc: { 'I:0/0': 'Switch', 'O:0/0': 'Light 0', 'O:0/2': 'Light 2' },
          notes: '<p>One condition, two outputs in parallel at the right-hand end.</p>',
        },
      ],
      quiz: [
        { q: '<code>XIO I:0/2</code> is TRUE when…', choices: ['the device on I:0/2 is a normally-open switch', 'bit I:0/2 is 0', 'bit I:0/2 is 1', 'output O:0/2 is off'], answer: 1, why: 'XIO is true when its bit is 0. It doesn\'t know or care what kind of switch is wired to the terminal.' },
        { q: 'The rung <code>XIC I:0/0 OTE O:0/0</code> is false. What does the OTE do this scan?', choices: ['Nothing — it keeps its last value', 'Writes 0 to O:0/0', 'Writes 1 to O:0/0', 'Faults the processor'], answer: 1, why: 'An OTE writes every scan: 1 when the rung is true, 0 when it is false.' },
        { q: 'How many times may you examine <code>B3:0/0</code> with XIC/XIO in one program?', choices: ['Once', 'Twice (one XIC and one XIO)', 'Up to 8 times', 'As many times as you need'], answer: 3, why: 'Examining a bit only reads memory, so there is no limit.' },
        { q: 'Which rung would RSLogix 500 reject?', choices: ['<code>XIC I:0/0 OTE O:0/0</code>', '<code>XIO I:0/1 OTE O:0/1</code>', '<code>OTE O:0/0 XIC I:0/0</code>', '<code>XIC I:0/0 XIC I:0/1 OTE O:0/0</code>'], answer: 2, why: 'Output instructions must be at the right end of the rung; an input instruction can\'t follow an output.' },
      ],
      challenges: ['c-light-switch'],
    },

    {
      id: 'nc-stop',
      unit: U2,
      title: 'The normally-closed STOP button',
      minutes: 14,
      body: `
<p>Field devices come in two flavours:</p>
<ul>
<li><strong>Normally open (NO)</strong> — the contact is open at rest and closes when operated. A START button is NO.</li>
<li><strong>Normally closed (NC)</strong> — the contact is closed at rest and opens when operated. A STOP button is NC.</li>
</ul>
${SVG_NO_NC}
<table class="tbl">
<tr><th>Device</th><th>At rest</th><th>Operated (pressed)</th></tr>
<tr><td>START push button (NO) on I:0/0</td><td>I:0/0 = 0</td><td>I:0/0 = 1</td></tr>
<tr><td>STOP push button (NC) on I:0/1</td><td>I:0/1 = <strong>1</strong></td><td>I:0/1 = <strong>0</strong></td></tr>
</table>

<h3>The trap</h3>
<p>Beginners see "the STOP button is normally <em>closed</em>" and reach for the instruction that <em>looks</em> normally closed: <code>XIO</code>. Let's check what happens:</p>
<div class="ladder" data-rungs="XIC I:0/3 XIO I:0/1 OTE O:0/0" data-desc='{"I:0/3":"JOG","I:0/1":"STOP (NC)","O:0/0":"Motor"}'></div>
<p>Nobody is touching STOP, so <code>I:0/1</code> = 1, so <code>XIO I:0/1</code> is <strong>false</strong>, so the motor can never run. And if someone presses STOP, <code>I:0/1</code> goes to 0, XIO becomes true — and the motor <em>starts</em>. Backwards!</p>

<h3>The rule</h3>
<p>Don't think about the device. Think about the <strong>bit</strong>. Ask: <em>"What is the input bit when it is OK to run?"</em></p>
<ul>
<li>If the bit is <strong>1</strong> when it's OK to run → use <code>XIC</code>.</li>
<li>If the bit is <strong>0</strong> when it's OK to run → use <code>XIO</code>.</li>
</ul>
<p>For an NC STOP button, the bit is 1 when not pressed (OK to run), so the correct instruction is <code>XIC</code>:</p>
<div class="ladder" data-rungs="XIC I:0/3 XIC I:0/1 OTE O:0/0" data-desc='{"I:0/3":"JOG","I:0/1":"STOP (NC)","O:0/0":"Motor"}'></div>
<p>Yes — the NC stop button shows up in the program as a <em>normally-open-looking</em> XIC. That's correct and completely normal.</p>
<button class="try" data-example="ex-nc-right">Load example: NC stop done right</button>
<button class="try" data-example="ex-nc-wrong">Load example: the trap (XIO)</button>

<h3>Why are stop buttons normally closed?</h3>
<p>Because it is <strong>fail-safe</strong>. Think about what happens when something goes wrong in the wiring:</p>
<ul>
<li>With an NC stop, a broken wire, loose terminal or blown fuse makes the input 0 — exactly the same as pressing STOP. The machine stops (or won't start), and someone investigates.</li>
<li>With an NO stop, a broken wire looks exactly like "not pressed". The machine runs normally — until someone presses STOP in an emergency and <em>nothing happens</em>.</li>
</ul>
<p>The same thinking applies to overload contacts, safety gate switches and over-travel limit switches: they're wired so that a failure looks like "stop".</p>
<div class="callout warn"><strong>Emergency stops</strong> must not rely only on a PLC program. Safety standards (such as NFPA 79 for industrial machinery) require E-stop circuits that remove power through hard-wired or safety-rated devices. A PLC input for the E-stop is fine for <em>indication</em> and for sequencing — not as the only protection.</div>
<div class="callout lab">In the lab, look at the input status LEDs on the MicroLogix: with nothing pressed, the STOP input's LED should be <strong>on</strong>. If it's off, check the wiring before you touch the program.</div>
<button class="go-challenge" data-challenge="c-nc-stop">Try the challenge: jog with a normally-closed STOP</button>
`,
      examples: [
        {
          id: 'ex-nc-right',
          title: 'NC stop done right',
          scene: 'motor',
          rungs: ['XIC I:0/3 XIC I:0/1 OTE O:0/0'],
          desc: { 'I:0/3': 'JOG', 'I:0/1': 'STOP (NC)', 'O:0/0': 'Motor M1' },
          comments: ['Motor runs while JOG is held, unless STOP is pressed. STOP is NC, so XIC.'],
          notes: '<p>Run it. Notice that the STOP input is ON with nothing pressed. Hold JOG — the motor runs. Press STOP while jogging — it stops.</p>',
        },
        {
          id: 'ex-nc-wrong',
          title: 'The trap: XIO on an NC stop',
          scene: 'motor',
          rungs: ['XIC I:0/3 XIO I:0/1 OTE O:0/0'],
          desc: { 'I:0/3': 'JOG', 'I:0/1': 'STOP (NC)', 'O:0/0': 'Motor M1' },
          comments: ['WRONG: the motor can only run while STOP is pressed!'],
          notes: '<p>Run it and hold JOG: nothing happens. Now hold JOG <em>and</em> STOP together — the motor runs. That is the bug you must never ship.</p>',
        },
      ],
      quiz: [
        { q: 'The STOP button is wired normally-closed to <code>I:0/1</code>. Which instruction, in series in the motor rung, stops the motor when STOP is pressed?', choices: ['<code>XIO I:0/1</code>', '<code>XIC I:0/1</code>', '<code>OTE I:0/1</code>', '<code>OTU I:0/1</code>'], answer: 1, why: 'Not pressed → bit = 1 → XIC is true and the motor may run. Pressed → bit = 0 → XIC is false and the rung breaks.' },
        { q: 'The wire to an NC STOP button breaks. What does the PLC see?', choices: ['The input stays 1', 'The input goes to 0 — the same as pressing STOP', 'A fault code', 'Random values'], answer: 1, why: 'No current reaches the terminal, so the bit is 0. That\'s why NC stops are fail-safe.' },
        { q: 'An overload relay contact is NC and wired to <code>I:0/2</code> (1 when healthy). The motor may run only when the overload is healthy. You should use…', choices: ['<code>XIC I:0/2</code>', '<code>XIO I:0/2</code>', 'either — they do the same thing', 'an OTE'], answer: 0, why: 'OK to run = bit 1 = XIC.' },
        { q: 'A normally-open START button on <code>I:0/0</code> is pressed. What is the value of bit I:0/0?', choices: ['0', '1', 'It depends on the program', 'It toggles'], answer: 1, why: 'Pressing an NO button closes the contact, voltage reaches the terminal, and the input bit becomes 1.' },
      ],
      challenges: ['c-nc-stop'],
    },

    {
      id: 'logic',
      unit: U2,
      title: 'AND, OR, NOT and branches',
      minutes: 18,
      body: `
<p>Ladder logic is Boolean logic in disguise. Three patterns cover everything:</p>
<table class="tbl">
<tr><th>Logic</th><th>Ladder</th><th>Boolean</th></tr>
<tr><td>AND</td><td>instructions in <strong>series</strong></td><td>Y = A · B</td></tr>
<tr><td>OR</td><td>instructions in <strong>parallel</strong> (a branch)</td><td>Y = A + B</td></tr>
<tr><td>NOT</td><td><code>XIO</code></td><td>Y = A′ (not A)</td></tr>
</table>

<h3>AND — series</h3>
<p>Every instruction in the path must be true:</p>
<div class="ladder" data-rungs="XIC I:0/0 XIC I:0/1 OTE O:0/0" data-desc='{"I:0/0":"A","I:0/1":"B","O:0/0":"A AND B"}'></div>
<table class="tbl"><tr><th>A</th><th>B</th><th>A AND B</th><th>A OR B</th></tr>
<tr><td>0</td><td>0</td><td>0</td><td>0</td></tr><tr><td>0</td><td>1</td><td>0</td><td>1</td></tr>
<tr><td>1</td><td>0</td><td>0</td><td>1</td></tr><tr><td>1</td><td>1</td><td>1</td><td>1</td></tr></table>

<h3>OR — branches</h3>
<p>A <strong>branch</strong> gives the rung more than one path. If <em>any</em> path is true, the branch is true. In RSLogix 500's text form a branch is written <code>BST</code> (branch start) … <code>NXB</code> (next branch) … <code>BND</code> (branch end):</p>
<div class="ladder" data-rungs="BST XIC I:0/0 NXB XIC I:0/1 BND OTE O:0/1" data-desc='{"I:0/0":"A","I:0/1":"B","O:0/1":"A OR B"}'></div>

<h3>From Boolean to ladder</h3>
<p>Write the expression, then build it from the inside out. Example: a pump runs if (the HAND switch <em>or</em> the AUTO call is on) <em>and</em> the tank is <em>not</em> empty:</p>
<p><code>PUMP = (HAND + AUTO) · EMPTY′</code></p>
<div class="ladder" data-rungs="BST XIC I:0/0 NXB XIC I:0/1 BND XIO I:0/2 OTE O:0/0" data-desc='{"I:0/0":"HAND","I:0/1":"AUTO call","I:0/2":"Tank EMPTY","O:0/0":"Pump"}'></div>
<p>The parentheses become the branch; the AND becomes "series with the branch"; the NOT becomes XIO.</p>

<h3>Exclusive OR</h3>
<p>XOR is true when exactly one input is on: <code>Y = A·B′ + A′·B</code> — two series paths in parallel. It's the logic of a stairwell light with a switch at each end.</p>
<div class="ladder" data-rungs="BST XIC I:0/0 XIO I:0/1 NXB XIO I:0/0 XIC I:0/1 BND OTE O:0/3" data-desc='{"I:0/0":"A","I:0/1":"B","O:0/3":"A XOR B"}'></div>

<h3>Nested branches</h3>
<p>A branch can contain another branch. <code>Y = A + B·(C + D)</code>:</p>
<div class="ladder" data-rungs="BST XIC I:0/0 NXB XIC I:0/1 BST XIC I:0/2 NXB XIC I:0/3 BND BND OTE O:0/0" data-desc='{"I:0/0":"A","I:0/1":"B","I:0/2":"C","I:0/3":"D"}'></div>
<div class="callout note">RSLogix 500 limits how deeply branches can be nested, and some older processors don't allow nesting at all. If a rung gets hard to read, split it: solve part of it into an internal bit (like <code>B3:0/0</code>) on one rung, then use that bit on the next.</div>
<button class="try" data-example="ex-gates">Load example: logic gates</button>
<button class="try" data-example="ex-boolean">Load example: pump (HAND + AUTO)·EMPTY′</button>
<div class="callout warn">"Two-hand" controls on presses look like a simple AND of two buttons, but real two-hand safety controls need more (both hands within a short time window, anti-tie-down, safety-rated hardware). Never build a safety function from ordinary PLC logic alone.</div>
<button class="go-challenge" data-challenge="c-logic-gates">Try the challenge: build the logic gates</button>
`,
      examples: [
        {
          id: 'ex-gates',
          title: 'Logic gates',
          scene: 'trainer',
          rungs: ['XIC I:0/0 XIC I:0/1 OTE O:0/0', 'BST XIC I:0/0 NXB XIC I:0/1 BND OTE O:0/1', 'XIO I:0/0 OTE O:0/2'],
          desc: { 'I:0/0': 'A', 'I:0/1': 'B', 'O:0/0': 'A AND B', 'O:0/1': 'A OR B', 'O:0/2': 'NOT A' },
          comments: ['AND: series.', 'OR: parallel branch.', 'NOT: XIO.'],
          notes: '<p>Run it and try all four combinations of A and B. Fill in the truth table as you go.</p>',
        },
        {
          id: 'ex-boolean',
          title: 'Pump = (HAND + AUTO) · EMPTY′',
          scene: 'trainer',
          rungs: ['BST XIC I:0/0 NXB XIC I:0/1 BND XIO I:0/2 OTE O:0/0'],
          desc: { 'I:0/0': 'HAND switch', 'I:0/1': 'AUTO call', 'I:0/2': 'Tank EMPTY', 'O:0/0': 'Pump' },
          notes: '<p>Turn on HAND or AUTO: the pump runs. Now turn on EMPTY: the pump stops no matter what.</p>',
        },
      ],
      quiz: [
        { q: 'Two XIC instructions in series implement which logic function?', choices: ['OR', 'AND', 'NOT', 'XOR'], answer: 1, why: 'Both must be true for the path to be complete: AND.' },
        { q: 'Which rung implements <code>Y = A + B·C</code> (A = I:0/0, B = I:0/1, C = I:0/2)?', choices: [
          '<code>XIC I:0/0 XIC I:0/1 XIC I:0/2 OTE O:0/0</code>',
          '<code>BST XIC I:0/0 NXB XIC I:0/1 XIC I:0/2 BND OTE O:0/0</code>',
          '<code>BST XIC I:0/0 NXB XIC I:0/1 BND XIC I:0/2 OTE O:0/0</code>',
          '<code>XIC I:0/0 BST XIC I:0/1 NXB XIC I:0/2 BND OTE O:0/0</code>'], answer: 1,
          why: 'A alone on one leg, B and C in series on the other leg, the legs in parallel.' },
        { q: 'When is <code>BST XIC I:0/0 NXB XIC I:0/1 BND XIO I:0/2 OTE O:0/0</code> true?', choices: ['When all three inputs are on', 'When I:0/0 or I:0/1 is on, and I:0/2 is off', 'When I:0/2 is on', 'When only I:0/0 is on, regardless of I:0/2'], answer: 1, why: '(I:0/0 OR I:0/1) AND NOT I:0/2.' },
        { q: 'A stairwell light has a switch at the top and the bottom. Flipping either switch changes the light. Which function is that?', choices: ['AND', 'OR', 'XOR', 'NOT'], answer: 2, why: 'The light is on when exactly one switch is "up" — exclusive OR.' },
      ],
      challenges: ['c-logic-gates'],
    },

    {
      id: 'seal-in',
      unit: U2,
      title: 'Seal-in circuits and 3-wire motor control',
      minutes: 18,
      body: `
<p>START and STOP buttons are <em>momentary</em>: they spring back when released. But a motor should keep running after the operator lets go of START. The program needs a memory — and the classic way is a <strong>seal-in</strong> (also called a holding or latching contact).</p>

<h3>The seal-in rung</h3>
<div class="ladder" data-rungs="BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIC I:0/2 OTE O:0/0" data-desc='{"I:0/0":"START (NO)","O:0/0":"Motor M1","I:0/1":"STOP (NC)","I:0/2":"Overload (NC)"}'></div>
<p>Follow it scan by scan:</p>
<ol>
<li><strong>Idle.</strong> START is 0 and <code>O:0/0</code> is 0, so both branch legs are false. Motor off.</li>
<li><strong>Press START.</strong> The top leg is true, STOP and overload are healthy (1), so the rung is true: <code>O:0/0</code> = 1.</li>
<li><strong>Release START.</strong> The top leg goes false, but the bottom leg — <code>XIC O:0/0</code> — is now true because the motor bit is on. The rung "seals itself in".</li>
<li><strong>Press STOP.</strong> <code>I:0/1</code> goes to 0, the rung is false, <code>O:0/0</code> = 0 — and that opens the seal contact too. Releasing STOP doesn't restart anything.</li>
</ol>
<p>STOP must be in <strong>series</strong>, outside the branch. If you put STOP inside the START leg, it could not break the seal and the motor would never stop! And because STOP is outside the branch, holding START and STOP together keeps the motor off — "stop wins".</p>
<button class="try" data-example="ex-start-stop">Load example: 3-wire start/stop</button>

<h3>2-wire vs 3-wire control</h3>
<p>This is the PLC version of the hard-wired <strong>3-wire</strong> circuit from lesson 1 (three wires run to the push-button station: STOP, START and the seal-in). Compare it with <strong>2-wire</strong> control, where a maintained switch or thermostat runs the motor directly:</p>
<div class="ladder" data-rungs="XIC I:0/0 XIC I:0/2 OTE O:0/0" data-desc='{"I:0/0":"RUN switch (maintained)","I:0/2":"Overload (NC)","O:0/0":"Motor M1"}'></div>
<table class="tbl">
<tr><th></th><th>2-wire (maintained switch)</th><th>3-wire (START/STOP + seal-in)</th></tr>
<tr><td>After a power failure or an overload reset…</td><td>the motor restarts by itself as soon as power returns</td><td>the motor stays off until someone presses START</td></tr>
<tr><td>Good for</td><td>pumps on float switches, fans on thermostats</td><td>machines where an unexpected restart could hurt someone</td></tr>
</table>
<p>That "stays off" behaviour is called <strong>low-voltage protection</strong>, and it's why most machinery uses 3-wire control.</p>
<div class="callout note">On SLC 500 and MicroLogix controllers, OTE outputs are de-energised when the controller powers up or enters RUN, so a seal-in rung starts out off (check the OTE description in 1747-RM001). PLCsim does the same: every OTE bit is cleared when you switch from PROGRAM to RUN, while latched (OTL) bits keep their state. Don't design a real machine that relies on either behaviour; use the first-scan bit (lesson 16) if you need a known start-up state.</div>

<h3>The overload</h3>
<p>A motor starter's <strong>overload relay</strong> trips when the motor draws too much current for too long. Its NC auxiliary contact (commonly marked 95–96) opens. Wired to a PLC input, it's 1 when healthy and 0 when tripped — so it goes in series with STOP, as an XIC. When the overload trips, the seal breaks, and the motor won't restart when the overload is reset.</p>
<div class="callout lab">Many shops also wire the overload contact directly in series with the starter coil, so the motor stops even if the PLC or its program fails. The PLC input is then used for the OVERLOAD indicator. Using an auxiliary contact <em>from the starter</em> (instead of <code>O:0/0</code>) for the seal-in is also common — it proves the starter really pulled in.</div>

<h3>Adding a JOG button</h3>
<p>Jog means "run only while the button is held" — for inching a conveyor during setup. The obvious idea is to put JOG in parallel with START, but then jogging turns on <code>O:0/0</code>, which closes the seal, and the motor keeps running after you let go! You'll fix that in the challenge — the trick is to seal in an <em>internal bit</em> instead of the output.</p>
<button class="go-challenge" data-challenge="c-start-stop">Try the challenge: 3-wire start/stop with overload</button>
<button class="go-challenge" data-challenge="c-jog">Try the challenge: run and jog</button>
`,
      examples: [
        {
          id: 'ex-start-stop',
          title: '3-wire start/stop',
          scene: 'motor',
          rungs: ['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIC I:0/2 OTE O:0/0', 'XIC O:0/0 OTE O:0/1', 'XIO O:0/0 OTE O:0/2'],
          desc: { 'I:0/0': 'START (NO)', 'I:0/1': 'STOP (NC)', 'I:0/2': 'Overload (NC)', 'O:0/0': 'Motor M1', 'O:0/1': 'RUNNING light', 'O:0/2': 'STOPPED light' },
          comments: ['START seals in through O:0/0. STOP and the overload are NC, so XIC.', 'Running light.', 'Stopped light.'],
          notes: '<p>Run it. Press and release START — the motor keeps running. Press STOP. Start again and trip the overload, then reset it: the motor stays off until START is pressed.</p>',
        },
        {
          id: 'ex-two-wire',
          title: '2-wire control',
          scene: 'trainer',
          rungs: ['XIC I:0/0 XIC I:0/2 OTE O:0/0'],
          desc: { 'I:0/0': 'RUN switch (maintained)', 'I:0/2': 'Overload (NC)', 'O:0/0': 'Motor' },
          notes: '<p>Turn on <code>I:0/2</code> (healthy overload) and the RUN switch <code>I:0/0</code>. Now turn <code>I:0/2</code> off and on again to simulate an overload trip and reset: the motor restarts by itself. That is the difference from 3-wire control.</p>',
        },
      ],
      quiz: [
        { q: 'What is the job of <code>XIC O:0/0</code> in parallel with the START button?', choices: ['It makes START a normally-closed button', 'It keeps the rung true after START is released', 'It stops the motor', 'It protects against overloads'], answer: 1, why: 'Once the motor bit is on, the seal-in contact holds the rung true on its own.' },
        { q: 'Where must STOP go in a seal-in rung?', choices: ['Inside the START leg of the branch', 'Inside the seal-in leg only', 'In series with the whole branch, so it can break both legs', 'On a separate rung with its own OTE'], answer: 2, why: 'STOP has to be able to break the seal-in path too, so it goes in series with the branch.' },
        { q: 'Power fails while a 3-wire controlled motor is running, then comes back. What happens?', choices: ['The motor restarts', 'The motor stays off until START is pressed', 'The PLC faults', 'The motor runs in reverse'], answer: 1, why: 'That\'s the low-voltage protection that 3-wire control gives you.' },
        { q: 'The overload trips on a running motor, then the electrician resets it. The seal-in rung has the overload contact in series. What happens?', choices: ['The motor restarts immediately', 'The motor stays stopped until START is pressed', 'The overload light stays on forever', 'The motor jogs'], answer: 1, why: 'The trip made the rung false, which dropped the seal. Nothing re-energises the rung until START is pressed.' },
      ],
      challenges: ['c-start-stop', 'c-jog'],
    },

    {
      id: 'latch-oneshot',
      unit: U2,
      title: 'Latches (OTL/OTU) and one-shots (OSR)',
      minutes: 18,
      body: `
<h3>OTL and OTU</h3>
<p><code>OTL</code> (Output Latch) and <code>OTU</code> (Output Unlatch) are output instructions that only act when their rung is true:</p>
<table class="tbl">
<tr><th></th><th>Rung true</th><th>Rung false</th></tr>
<tr><td><code>OTE</code></td><td>writes 1</td><td>writes 0</td></tr>
<tr><td><code>OTL</code></td><td>writes 1</td><td><strong>does nothing</strong> (bit keeps its value)</td></tr>
<tr><td><code>OTU</code></td><td>writes 0</td><td><strong>does nothing</strong></td></tr>
</table>
<p>They are used in pairs on the <em>same address</em>: one rung latches, another unlatches.</p>
<div class="ladder" data-rungs="XIC I:0/0 XIC I:0/1 XIC I:0/2 OTL O:0/0|BST XIO I:0/1 NXB XIO I:0/2 BND OTU O:0/0" data-desc='{"I:0/0":"START","I:0/1":"STOP (NC)","I:0/2":"Overload (NC)","O:0/0":"Motor M1"}'></div>
<p>This does the same job as the seal-in rung. Which is better? Usually the seal-in, because of <em>retentive</em> behaviour.</p>

<h3>Latched bits are retentive</h3>
<p>A latched bit stays 1 until an OTU clears it — even when the processor goes from RUN to PROGRAM and back, and through a power loss (as long as the controller keeps its data table). An OTE-based seal-in drops out; a latch does not.</p>
<div class="callout warn"><strong>Latched outputs can restart a machine unexpectedly.</strong> If <code>O:0/0</code> was latched when power failed, the motor may start the moment the PLC goes back to RUN. Good practice:
<ul><li>Latch internal bits (B3) rather than real outputs, and think through what happens at power-up.</li>
<li>Always pair every OTL with an OTU, and consider unlatching on the first scan (<code>XIC S:1/15 OTU …</code>).</li>
<li>If the OTL and OTU rungs are both true in the same scan, the one <strong>lower</strong> in the program wins, because it writes last.</li></ul></div>
<p>Latches are the right tool when you <em>want</em> memory: an alarm that must stay on until acknowledged, a "part rejected" flag, a step of a sequence.</p>
<button class="try" data-example="ex-latch">Load example: motor with OTL/OTU</button>
<button class="go-challenge" data-challenge="c-alarm-latch">Try the challenge: latched high-temperature alarm</button>

<h3>One-shots: OSR</h3>
<p>Many actions should happen <strong>once per press</strong>, not once per scan. Holding a button for one second is about a hundred scans! The <code>OSR</code> (One-Shot Rising) instruction fixes this. It's an <em>input</em> instruction placed just before the output:</p>
<div class="ladder" data-rungs="XIC I:0/0 OSR B3:0/0 ADD N7:0 1 N7:0" data-desc='{"I:0/0":"Push button","B3:0/0":"OSR storage","N7:0":"Press count"}'></div>
<p>When the logic to its left goes from false to true, OSR is true for <strong>exactly one scan</strong>, then false again until the logic goes false and true once more. It remembers the previous state in its <strong>storage bit</strong> (<code>B3:0/0</code> here).</p>
<ul>
<li>Each OSR needs its own storage bit, used nowhere else in the program.</li>
<li>Put the OSR immediately before the output instruction(s) it controls. Some SLC processors restrict where an OSR may be placed (for example inside branches) — see the OSR entry in 1747-RM001.</li>
<li>On MicroLogix 1100/1200/1400/1500 the input one-shot is called <code>ONS</code>, and <code>OSR</code>/<code>OSF</code> there are <em>output</em> instructions with a separate output bit. The MicroLogix 1000 only has the SLC-style OSR.</li>
</ul>
<button class="try" data-example="ex-osr-add">Load example: with and without a one-shot</button>

<h3>The push-on/push-off toggle</h3>
<p>One button that turns a light on, then off, then on… is a classic interview question. A tempting answer is "latch it if it's off, unlatch it if it's on" — but both rungs see the same press in the same scan, so the light turns on and straight back off. The reliable pattern uses a one-shot pulse and a single OTE:</p>
<p><em>light = (pulse AND light off) OR (no pulse AND light on)</em></p>
<button class="go-challenge" data-challenge="c-toggle">Try the challenge: push-on / push-off with one button</button>
`,
      examples: [
        {
          id: 'ex-latch',
          title: 'Motor with OTL/OTU',
          scene: 'motor',
          rungs: ['XIC I:0/0 XIC I:0/1 XIC I:0/2 OTL O:0/0', 'BST XIO I:0/1 NXB XIO I:0/2 BND OTU O:0/0'],
          desc: { 'I:0/0': 'START', 'I:0/1': 'STOP (NC)', 'I:0/2': 'Overload (NC)', 'O:0/0': 'Motor M1' },
          comments: ['Latch the motor on.', 'Unlatch it on STOP or overload.'],
          notes: '<p>Start the motor, then switch the controller to PROGRAM and back to RUN. The motor bit is still latched, so the motor runs again without anyone pressing START. (On a real SLC 500 or MicroLogix, an OTE seal-in would drop out at this point, because OTE bits are reset on entering RUN. PLCsim doesn\'t model that reset, so try the seal-in example on real hardware to compare.)</p>',
        },
        {
          id: 'ex-osr-add',
          title: 'With and without a one-shot',
          scene: 'trainer',
          rungs: ['XIC I:0/0 OSR B3:0/0 ADD N7:0 1 N7:0', 'XIC I:0/1 ADD N7:1 1 N7:1', 'XIC I:0/2 BST CLR N7:0 NXB CLR N7:1 BND'],
          desc: { 'I:0/0': 'Button A (one-shot)', 'I:0/1': 'Button B (no one-shot)', 'I:0/2': 'Clear', 'B3:0/0': 'OSR storage', 'N7:0': 'Count A', 'N7:1': 'Count B' },
          comments: ['Adds 1 once per press.', 'Adds 1 EVERY SCAN while held.', 'Clear both counts.'],
          notes: '<p>Press <code>I:0/0</code> a few times and watch <code>N7:0</code> go up by one each press. Now hold <code>I:0/1</code> for a second: <code>N7:1</code> jumps by about 100. (Hold it for more than five minutes and it will overflow past 32767 and fault the processor — see lesson 16.)</p>',
        },
      ],
      quiz: [
        { q: 'The rung with <code>OTL O:0/0</code> goes false. What happens to O:0/0?', choices: ['It turns off', 'It stays on', 'It toggles', 'It faults'], answer: 1, why: 'OTL only acts when its rung is true. When false, it leaves the bit alone.' },
        { q: 'An OTL and an OTU for <code>B3:0/0</code> are both true in the same scan, and the OTU rung is lower in the program. What is B3:0/0 at the end of the scan?', choices: ['1', '0', 'It alternates each scan', 'The processor faults'], answer: 1, why: 'Rungs are solved top to bottom; the OTU writes last, so the bit ends up 0.' },
        { q: 'Why is latching a motor output directly with OTL risky?', choices: ['OTL is slower than OTE', 'The bit stays on through a mode change or power cycle, so the motor may start unexpectedly', 'OTL can only be used once per program', 'OTL outputs cannot be turned off'], answer: 1, why: 'Latches are retentive. That\'s useful for memory but dangerous for things that move.' },
        { q: '<code>XIC I:0/0 OSR B3:0/0 ADD N7:0 1 N7:0</code> — the button is held for 3 seconds. How much does N7:0 increase?', choices: ['1', '3', 'about 300', 'about 3000'], answer: 0, why: 'The OSR passes only the false-to-true transition, so the ADD runs for one scan.' },
        { q: 'Can the storage bit <code>B3:0/0</code> of one OSR also be used as the storage bit of another OSR?', choices: ['Yes, that saves memory', 'No — each OSR needs its own storage bit', 'Only if both are on the same rung', 'Only in subroutines'], answer: 1, why: 'The storage bit remembers that OSR\'s previous state. Sharing it makes both one-shots misbehave.' },
      ],
      challenges: ['c-alarm-latch', 'c-toggle'],
    },

    {
      id: 'interlocks',
      unit: U2,
      title: 'Internal bits and interlocks',
      minutes: 16,
      body: `
<h3>Internal bits</h3>
<p>The B3 file holds bits that aren't connected to any terminal. They work like the "control relays" (CRs) of a relay panel, except they're free and you have 512 of them on a MicroLogix 1000. Use them to:</p>
<ul>
<li>store a state, such as "machine running" or "cycle in progress";</li>
<li>break complicated logic into readable pieces;</li>
<li>combine several conditions into one bit that many rungs use.</li>
</ul>
<div class="ladder" data-rungs="XIC I:0/1 XIC I:0/2 XIC I:0/3 OTE B3:0/0|XIC B3:0/0 XIC I:0/0 OTE O:0/0|XIC B3:0/0 XIC I:0/4 OTE O:0/1|XIO B3:0/0 OTE O:0/5" data-desc='{"B3:0/0":"Machine READY","I:0/1":"Guard closed","I:0/2":"Air OK","I:0/3":"No faults","O:0/5":"NOT READY light"}'></div>
<button class="try" data-example="ex-ready-bit">Load example: a "ready" bit</button>

<h3>The double-coil mistake</h3>
<p>Here's a very common bug. Someone wants a light on from either of two switches, and writes two rungs:</p>
<div class="ladder" data-rungs="XIC I:0/0 OTE O:0/0|XIC I:0/1 OTE O:0/0" data-desc='{"I:0/0":"Switch A","I:0/1":"Switch B","O:0/0":"Light"}'></div>
<p>Turn on switch A: rung 0 writes 1… and then rung 1 (switch B off) writes 0. At the output scan <code>O:0/0</code> is 0. <strong>The last rung wins.</strong> Switch A seems to do nothing. The fix is one rung with a branch — or two rungs that each set an internal bit, and one rung that ORs them into the output.</p>
<div class="ladder" data-rungs="BST XIC I:0/0 NXB XIC I:0/1 BND OTE O:0/0" data-desc='{"I:0/0":"Switch A","I:0/1":"Switch B","O:0/0":"Light"}'></div>
<p><strong>Rule:</strong> each address should have <em>one</em> OTE in the program. RSLogix 500 will warn about duplicate destructive bits when it verifies the project, and its cross-reference report shows every place an address is written.</p>
<button class="try" data-example="ex-double-coil">Load example: the double-coil bug</button>

<h3>Interlocks</h3>
<p>An <strong>interlock</strong> is logic that stops two things from happening when they must not happen together. The classic example is a <strong>reversing motor starter</strong>: two contactors, one for forward and one for reverse, which swap two of the three phases. If both close at once, that's a phase-to-phase short circuit.</p>
<p>Software interlock: each direction's rung includes an XIO of the <em>other</em> contactor:</p>
<div class="ladder" data-rungs="BST XIC I:0/1 NXB XIC O:0/0 BND XIC I:0/0 XIC I:0/3 XIO O:0/1 OTE O:0/0|BST XIC I:0/2 NXB XIC O:0/1 BND XIC I:0/0 XIC I:0/3 XIO O:0/0 OTE O:0/1" data-desc='{"I:0/0":"STOP (NC)","I:0/1":"FWD","I:0/2":"REV","I:0/3":"Overload","O:0/0":"FWD contactor","O:0/1":"REV contactor"}'></div>
<p>If forward is running, <code>XIO O:0/0</code> in the reverse rung is false, so reverse can't energise. The operator must press STOP first.</p>
<p>A <strong>push-button interlock</strong> puts <code>XIO</code> of the opposite <em>button</em> in each rung too, so pressing both buttons does nothing. (Hard-wired circuits often use NC contacts on the push buttons for this.)</p>
<div class="callout warn"><strong>Software interlocks are not enough on their own.</strong> A contactor takes tens of milliseconds to open — longer than a PLC scan — and a contactor with welded contacts stays closed no matter what the program says. Forcing an output also bypasses program interlocks. Reversing starters therefore also have a <strong>mechanical interlock</strong> between the two contactors and a <strong>hard-wired electrical interlock</strong> (each contactor's NC auxiliary contact in series with the other's coil).</div>
<button class="go-challenge" data-challenge="c-fwd-rev">Try the challenge: forward/reverse with interlocks</button>
`,
      examples: [
        {
          id: 'ex-ready-bit',
          title: 'A "ready" bit',
          scene: 'trainer',
          rungs: ['XIC I:0/1 XIC I:0/2 XIC I:0/3 OTE B3:0/0', 'XIC B3:0/0 XIC I:0/0 OTE O:0/0', 'XIC B3:0/0 XIC I:0/4 OTE O:0/1', 'XIO B3:0/0 OTE O:0/5'],
          desc: { 'B3:0/0': 'Machine READY', 'I:0/0': 'Run motor 1', 'I:0/1': 'Guard closed', 'I:0/2': 'Air OK', 'I:0/3': 'No faults', 'I:0/4': 'Run motor 2', 'O:0/0': 'Motor 1', 'O:0/1': 'Motor 2', 'O:0/5': 'NOT READY light' },
          comments: ['Collect all the permissives into one internal bit.', 'Use it...', '...as often as you like.', 'Indicator.'],
          notes: '<p>Turn on <code>I:0/1</code>, <code>I:0/2</code> and <code>I:0/3</code> to make the machine ready. Only then do the motor switches work. Turn any one permissive off and everything stops.</p>',
        },
        {
          id: 'ex-double-coil',
          title: 'The double-coil bug',
          scene: 'trainer',
          rungs: ['XIC I:0/0 OTE O:0/0', 'XIC I:0/1 OTE O:0/0'],
          desc: { 'I:0/0': 'Switch A', 'I:0/1': 'Switch B', 'O:0/0': 'Light' },
          comments: ['Writes O:0/0...', '...and this rung overwrites it. The last rung wins.'],
          notes: '<p>Turn on switch A only: the light stays off (although rung 0 is highlighted true). Switch B works. Then fix it with a single rung using a branch.</p>',
        },
      ],
      quiz: [
        { q: '<code>OTE O:0/0</code> appears on rung 2 and on rung 7. Rung 2 is true and rung 7 is false. What reaches the output terminal?', choices: ['On', 'Off', 'It flickers', 'The processor faults'], answer: 1, why: 'Rung 7 is solved last in the scan and writes 0. The last write wins.' },
        { q: 'What is a B3 bit most like in a relay panel?', choices: ['A fuse', 'A control relay that has no field wiring', 'A push button', 'A motor starter'], answer: 1, why: 'Internal bits store and combine logic just like control relays, but they have no terminals.' },
        { q: 'What instruction goes in the FORWARD rung as a software interlock against the REVERSE contactor O:0/1?', choices: ['<code>XIC O:0/1</code>', '<code>XIO O:0/1</code>', '<code>OTU O:0/1</code>', '<code>OTE O:0/1</code>'], answer: 1, why: 'Forward may only energise while reverse is off: XIO O:0/1.' },
        { q: 'Why do reversing starters also need hard-wired and mechanical interlocks?', choices: ['The PLC scan is too slow to read buttons', 'A welded contact, a forced output or contactor release time can defeat a software-only interlock', 'Software interlocks are not allowed in RSLogix', 'To save PLC outputs'], answer: 1, why: 'The program can only control the coil. It can\'t guarantee the contacts have actually opened.' },
      ],
      challenges: ['c-fwd-rev'],
    },

    // =====================================================================
    // UNIT 3 — TIMERS
    // =====================================================================
    {
      id: 'ton',
      unit: U3,
      title: 'The on-delay timer (TON)',
      minutes: 18,
      body: `
<p>Machines are full of delays: "start the conveyor 5 seconds after the horn", "alarm only if the pressure has been low for 3 seconds". The <strong>TON</strong> (Timer On-Delay) is the workhorse for this.</p>

<h3>The timer element</h3>
<p>Each timer in the T4 file is an <strong>element</strong> of three 16-bit words:</p>
<table class="tbl">
<tr><th>Word</th><th>Contents</th><th>Address</th></tr>
<tr><td>0</td><td>Status bits: <strong>EN</strong> (bit 15), <strong>TT</strong> (bit 14), <strong>DN</strong> (bit 13)</td><td><code>T4:0/EN</code>, <code>T4:0/TT</code>, <code>T4:0/DN</code></td></tr>
<tr><td>1</td><td><strong>PRE</strong> — preset, the target count</td><td><code>T4:0.PRE</code></td></tr>
<tr><td>2</td><td><strong>ACC</strong> — accumulated count so far</td><td><code>T4:0.ACC</code></td></tr>
</table>

<h3>Time base × preset = time</h3>
<p>The ACC counts in steps of the <strong>time base</strong>. The MicroLogix 1000 offers two: <strong>1.0 s</strong> and <strong>0.01 s</strong>.</p>
<table class="tbl">
<tr><th>Delay wanted</th><th>Time base</th><th>Preset</th></tr>
<tr><td>5 s</td><td>1.0</td><td>5</td></tr>
<tr><td>5 s</td><td>0.01</td><td>500</td></tr>
<tr><td>2.5 s</td><td>0.01</td><td>250 (can't be done with 1.0)</td></tr>
<tr><td>1 hour</td><td>1.0</td><td>3600 (too long for 0.01: max 327.67 s)</td></tr>
</table>
<p>PRE and ACC are signed 16-bit words, so the largest preset is 32767. A <strong>negative</strong> preset or accumulator is an error: the processor faults with code <code>0034h</code>.</p>

<h3>How TON behaves</h3>
<p>In the text format a TON is written <code>TON T4:0 1.0 5 0</code> — timer, time base, preset, starting accumulator.</p>
<ul>
<li><strong>Rung true:</strong> EN = 1. ACC counts up. TT (timer timing) = 1 while ACC &lt; PRE.</li>
<li><strong>ACC reaches PRE:</strong> DN (done) = 1, TT = 0. ACC stops at PRE.</li>
<li><strong>Rung false (at any time):</strong> EN, TT and DN all go to 0, and <strong>ACC resets to 0</strong>. A TON is <em>non-retentive</em>.</li>
</ul>
${SVG_TON}
<p>In the diagram (PRE = 3 s), the rung is first true for only 1.5 s: the timer starts, then resets without ever getting done. The second time, the rung stays true long enough; DN comes on at 3 s and stays on until the rung goes false.</p>
<div class="ladder" data-rungs="XIC I:0/0 TON T4:0 1.0 5 0|XIC T4:0/EN OTE O:0/0|XIC T4:0/TT OTE O:0/1|XIC T4:0/DN OTE O:0/2" data-desc='{"I:0/0":"Start timing","O:0/0":"EN light","O:0/1":"TT light","O:0/2":"DN light"}'></div>
<button class="try" data-example="ex-ton">Load example: TON status bits</button>

<h3>Typical uses</h3>
<ul>
<li><strong>Delay on:</strong> <code>XIC T4:0/DN</code> turns something on PRE after the rung goes true.</li>
<li><strong>Confirmation / debounce:</strong> "low pressure for 3 seconds" ignores short dips — the timer resets every time the signal disappears.</li>
<li><strong>"Only while timing":</strong> <code>XIC T4:0/TT</code> is on for exactly PRE after the rung goes true — handy for a warning horn.</li>
</ul>
<div class="ladder" data-rungs="XIC I:0/2 TON T4:1 0.01 300 0|XIC T4:1/DN OTE O:0/3" data-desc='{"I:0/2":"Low pressure switch","O:0/3":"LOW PRESSURE alarm"}'></div>
<button class="try" data-example="ex-ton-confirm">Load example: confirmed alarm</button>
<div class="callout note"><strong>PLCsim vs. real hardware:</strong> PLCsim adds exactly 10 ms of time per scan, so a 0.01 s timer counts one step per scan. On a real MicroLogix, timer accuracy depends on the time base and the scan time — see "Timer Accuracy" in 1747-RM001. For very long scans, timers can lose time.</div>
<div class="callout tip">Pick an unused timer for every TON. Two TON instructions with the same address fight each other just like a double coil.</div>
<button class="go-challenge" data-challenge="c-delayed-start">Try the challenge: conveyor start-up warning</button>
`,
      examples: [
        {
          id: 'ex-ton',
          title: 'TON status bits',
          scene: 'trainer',
          rungs: ['XIC I:0/0 TON T4:0 1.0 5 0', 'XIC T4:0/EN OTE O:0/0', 'XIC T4:0/TT OTE O:0/1', 'XIC T4:0/DN OTE O:0/2'],
          desc: { 'I:0/0': 'Start timing', 'O:0/0': 'EN light', 'O:0/1': 'TT light', 'O:0/2': 'DN light', 'T4:0': '5 s timer' },
          comments: ['5 s on-delay (time base 1.0, preset 5).', 'Enabled: follows the rung.', 'Timing: on while ACC < PRE.', 'Done: on once ACC reaches PRE.'],
          notes: '<p>Turn <code>I:0/0</code> on and watch <code>T4:0.ACC</code> count 0…5 and the three lights. Then turn it off <em>before</em> 5 s and see ACC go straight back to 0.</p>',
        },
        {
          id: 'ex-ton-confirm',
          title: 'Confirmed alarm (3 s)',
          scene: 'trainer',
          rungs: ['XIC I:0/2 TON T4:1 0.01 300 0', 'XIC T4:1/DN OTE O:0/3'],
          desc: { 'I:0/2': 'Low pressure switch', 'O:0/3': 'LOW PRESSURE alarm', 'T4:1': '3 s confirm timer' },
          comments: ['0.01 s time base, preset 300 = 3.00 s.', 'The alarm only sounds if the switch stayed on for 3 s.'],
          notes: '<p>Flick <code>I:0/2</code> on and off quickly: no alarm. Leave it on for 3 s: alarm.</p>',
        },
      ],
      quiz: [
        { q: '<code>TON T4:0 1.0 5 0</code> — the rung is true for 3 s, then goes false. What is T4:0.ACC now?', choices: ['3', '5', '0', '2'], answer: 2, why: 'A TON resets ACC to 0 whenever its rung goes false.' },
        { q: 'You need a 2.5-second delay on a MicroLogix 1000. Which settings work?', choices: ['Time base 1.0, preset 2.5', 'Time base 0.01, preset 250', 'Time base 0.01, preset 25', 'Time base 0.001, preset 2500'], answer: 1, why: 'Presets are whole numbers. 250 × 0.01 s = 2.5 s. (0.001 s isn\'t available on the ML1000.)' },
        { q: 'Which timer bit is on while the timer is timing but not yet done?', choices: ['EN', 'TT', 'DN', 'PRE'], answer: 1, why: 'TT = timer timing: rung true and ACC < PRE.' },
        { q: 'Which word of the timer element holds the accumulated value?', choices: ['Word 0', 'Word 1', 'Word 2', 'The status file'], answer: 2, why: 'Word 0 = status bits, word 1 = PRE, word 2 = ACC.' },
        { q: 'The rung of <code>TON T4:0 1.0 5 0</code> stays true for 10 s. What is ACC after 10 s?', choices: ['10', '5', '0', '32767'], answer: 1, why: 'A TON stops accumulating when it reaches the preset.' },
      ],
      challenges: ['c-delayed-start'],
    },

    {
      id: 'tof-rto',
      unit: U3,
      title: 'TOF, RTO and RES',
      minutes: 18,
      body: `
<h3>TOF — off-delay</h3>
<p>The <strong>TOF</strong> (Timer Off-Delay) delays turning something <em>off</em>.</p>
<ul>
<li><strong>Rung true:</strong> EN = 1 and <strong>DN = 1 immediately</strong>. ACC is held at 0.</li>
<li><strong>Rung goes false:</strong> EN = 0, TT = 1 and ACC starts counting. DN stays on.</li>
<li><strong>ACC reaches PRE:</strong> DN = 0, TT = 0.</li>
<li>If the rung goes true again before then, ACC resets and DN stays on.</li>
</ul>
${SVG_TOF}
<p>Use a TOF for anything that must keep going for a while after the command stops: a cooling fan after a motor stops, a conveyor that runs on to clear parts, a stairwell light.</p>
<div class="ladder" data-rungs="XIC I:0/0 OTE O:0/0|XIC I:0/0 TOF T4:0 1.0 10 0|XIC T4:0/DN OTE O:0/1" data-desc='{"I:0/0":"Motor RUN switch","O:0/0":"Motor","O:0/1":"Cooling fan"}'></div>
<button class="try" data-example="ex-tof">Load example: TOF run-on</button>

<h3>RTO — retentive on-delay</h3>
<p>The <strong>RTO</strong> (Retentive Timer On) counts like a TON while its rung is true, but when the rung goes false it <strong>keeps its ACC</strong>. When the rung goes true again, it carries on from where it stopped. Once DN is set it stays set, even with the rung false.</p>
${SVG_RTO}
<p>ACC keeps its value through a mode change or power cycle too. Only a <strong>RES</strong> instruction clears it. Use an RTO to add up <em>total</em> time across interruptions: machine run hours for maintenance, total time a part has spent in an oven.</p>
<div class="ladder" data-rungs="XIC I:0/0 RTO T4:1 1.0 20 0|XIC T4:1/DN OTE O:0/2|XIC I:0/1 RES T4:1" data-desc='{"I:0/0":"Machine running","I:0/1":"Reset PB","O:0/2":"SERVICE DUE"}'></div>
<button class="try" data-example="ex-rto">Load example: RTO run-time total</button>

<h3>RES — reset</h3>
<p><code>RES</code> is an output instruction. When its rung is true it clears the ACC and the status bits of a timer (or counter, or control element). Put it on its own rung, with whatever condition should reset the timer.</p>
<ul>
<li>A TON doesn't need RES — it resets itself when its rung goes false. (RES on a TON whose rung is still true just restarts the timing.)</li>
<li>An RTO <strong>needs</strong> RES — nothing else clears it.</li>
<li>Don't use RES on a TOF. Rockwell's manual warns that resetting a TOF can cause unpredictable operation.</li>
</ul>

<h3>Choosing the right timer</h3>
<table class="tbl">
<tr><th>Need</th><th>Timer</th><th>Use the bit…</th></tr>
<tr><td>Do something X seconds <em>after</em> a condition becomes true (and stays true)</td><td>TON</td><td>DN</td></tr>
<tr><td>Keep something on for X seconds <em>after</em> a condition goes false</td><td>TOF</td><td>DN</td></tr>
<tr><td>Add up time across interruptions</td><td>RTO + RES</td><td>DN or ACC</td></tr>
<tr><td>Something on only for the first X seconds</td><td>TON</td><td>TT</td></tr>
</table>
<button class="go-challenge" data-challenge="c-cooling-fan">Try the challenge: cooling fan run-on</button>
<button class="go-challenge" data-challenge="c-run-hours">Try the challenge: service-due run-time meter</button>
`,
      examples: [
        {
          id: 'ex-tof',
          title: 'TOF run-on',
          scene: 'trainer',
          rungs: ['XIC I:0/0 OTE O:0/0', 'XIC I:0/0 TOF T4:0 1.0 10 0', 'XIC T4:0/DN OTE O:0/1'],
          desc: { 'I:0/0': 'Motor RUN switch', 'O:0/0': 'Motor', 'O:0/1': 'Cooling fan', 'T4:0': 'Fan run-on' },
          comments: ['Motor follows the switch.', 'Off-delay: DN on immediately, off 10 s after the rung goes false.', 'Fan.'],
          notes: '<p>Turn the motor on: the fan starts too. Turn it off and watch <code>T4:0.ACC</code> count while the fan keeps running for 10 s.</p>',
        },
        {
          id: 'ex-rto',
          title: 'RTO run-time total',
          scene: 'trainer',
          rungs: ['XIC I:0/0 RTO T4:1 1.0 20 0', 'XIC T4:1/DN OTE O:0/2', 'XIC I:0/1 RES T4:1'],
          desc: { 'I:0/0': 'Machine running', 'I:0/1': 'Reset PB', 'O:0/2': 'SERVICE DUE', 'T4:1': 'Run-time total' },
          comments: ['Retentive: ACC is kept when the rung goes false.', 'Due after 20 s total.', 'Only RES clears an RTO.'],
          notes: '<p>Run the machine for a few seconds, stop it, and start it again. <code>T4:1.ACC</code> carries on from where it stopped. Reach 20 s, then press reset.</p>',
        },
      ],
      quiz: [
        { q: 'The rung of a TOF goes true. What does its DN bit do?', choices: ['Turns on after PRE', 'Turns on immediately', 'Stays off', 'Toggles'], answer: 1, why: 'A TOF\'s DN is on while the rung is true, and for PRE after it goes false.' },
        { q: 'Which timer keeps its ACC when its rung goes false?', choices: ['TON', 'TOF', 'RTO', 'All of them'], answer: 2, why: 'RTO is retentive. TON resets when its rung goes false.' },
        { q: 'How do you clear an RTO?', choices: ['Make its rung false', 'Use a RES instruction with the same address', 'Set its preset to 0', 'It clears itself when done'], answer: 1, why: 'Only RES (or writing directly to ACC) clears an RTO.' },
        { q: 'Which timer suits: "the exhaust fan runs for 30 s after the heater turns off"?', choices: ['TON', 'TOF', 'RTO', 'A counter'], answer: 1, why: 'Keep something on for a time after a condition goes false — an off-delay.' },
      ],
      challenges: ['c-cooling-fan', 'c-run-hours'],
    },

    {
      id: 'timer-circuits',
      unit: U3,
      title: 'Timer circuits: flashers, cascades, sequences',
      minutes: 22,
      body: `
<h3>The self-resetting timer</h3>
<p>Put the timer's own DN bit, as an XIO, in front of it:</p>
<div class="ladder" data-rungs="XIC I:0/0 XIO T4:0/DN TON T4:0 1.0 1 0|XIC T4:0/DN ADD N7:0 1 N7:0" data-desc='{"I:0/0":"Enable","N7:0":"Pulse count"}'></div>
<p>Follow the scans: the timer runs for 1 s, DN turns on. In the <em>next</em> scan <code>XIO T4:0/DN</code> is false, so the rung is false and the TON resets (DN off). The scan after that the rung is true again and timing restarts. The result is a DN pulse <strong>one scan long</strong>, once a second — a <em>pulse generator</em>, or clock. Anything that examines <code>T4:0/DN</code> below the timer sees each pulse exactly once.</p>
<button class="try" data-example="ex-pulse">Load example: 1-second pulse generator</button>

<h3>Flashers</h3>
<p>For a light that's on for one time and off for another, use two timers that take turns:</p>
<div class="ladder" data-rungs="XIC I:0/0 XIO T4:1/DN TON T4:0 1.0 1 0|XIC T4:0/DN TON T4:1 1.0 1 0|XIC T4:0/DN OTE O:0/0" data-desc='{"I:0/0":"Enable","O:0/0":"Beacon","T4:0":"OFF time","T4:1":"ON time"}'></div>
<p>T4:0 times first (light off), then T4:1 times (light on, because T4:0 is done). When T4:1 finishes, it resets T4:0, which resets T4:1, and the cycle repeats. Changing the presets changes the on and off times separately.</p>
<button class="try" data-example="ex-flasher-off-first">Load example: two-timer flasher</button>
<p>With one timer and a compare instruction (lesson 15) you can do the same: <code>LES T4:0.ACC 100</code> is true for the first half of a 2-second self-resetting timer.</p>

<h3>Cascaded timers</h3>
<p>When one timer's DN starts the next timer, you get a sequence. Starting three conveyors in order, 2 s apart, so that the downstream one is running before parts arrive:</p>
<div class="ladder" data-rungs="BST XIC I:0/0 NXB XIC B3:0/0 BND XIC I:0/1 OTE B3:0/0|XIC B3:0/0 TON T4:0 1.0 2 0|XIC T4:0/DN TON T4:1 1.0 2 0|XIC B3:0/0 OTE O:0/2|XIC T4:0/DN OTE O:0/1|XIC T4:1/DN OTE O:0/0" data-desc='{"I:0/0":"START","I:0/1":"STOP (NC)","B3:0/0":"Line running","O:0/2":"Conveyor 3 (last)","O:0/1":"Conveyor 2","O:0/0":"Conveyor 1 (first)"}'></div>
<p>STOP drops <code>B3:0/0</code>, which resets T4:0, which resets T4:1 — everything stops at once.</p>
<button class="try" data-example="ex-cascade">Load example: conveyor start sequence</button>

<h3>A traffic light</h3>
<p>A sequence that loops is just a cascade whose last timer resets the first. Write down the phase table first:</p>
<table class="tbl"><tr><th>Phase</th><th>Timer</th><th>Time</th><th>N–S</th><th>E–W</th></tr>
<tr><td>1</td><td>T4:0</td><td>5 s</td><td>green</td><td>red</td></tr>
<tr><td>2</td><td>T4:1</td><td>2 s</td><td>yellow</td><td>red</td></tr>
<tr><td>3</td><td>T4:2</td><td>5 s</td><td>red</td><td>green</td></tr>
<tr><td>4</td><td>T4:3</td><td>2 s</td><td>red</td><td>yellow</td></tr></table>
<p>Then decode each lamp from the timer bits. Phase 2 is "T4:0 done but T4:1 not done yet": <code>XIC T4:0/DN XIO T4:1/DN</code>. Reds are simplest as "this direction is not green and not yellow".</p>
<div class="callout tip">Write the phase table and a timing diagram <em>before</em> writing rungs. Most sequence bugs are really design bugs.</div>

<h3>Timers with sensors: a tank</h3>
<p>Real sequences mix timers with sensors: fill until a level switch, mix for a time, drain until empty. Each step is a sealed-in bit (or a timer) that starts on the previous step's completion and ends on its own condition. The tank challenge puts all of this together.</p>
<button class="go-challenge" data-challenge="c-flasher">Try the challenge: warning beacon flasher</button>
<button class="go-challenge" data-challenge="c-traffic">Try the challenge: traffic light with timers</button>
<button class="go-challenge" data-challenge="c-tank">Try the challenge: tank fill, mix and drain</button>
`,
      examples: [
        {
          id: 'ex-pulse',
          title: '1-second pulse generator',
          scene: 'trainer',
          rungs: ['XIC I:0/0 XIO T4:0/DN TON T4:0 1.0 1 0', 'XIC T4:0/DN ADD N7:0 1 N7:0'],
          desc: { 'I:0/0': 'Enable', 'T4:0': 'Pulse timer', 'N7:0': 'Pulse count' },
          comments: ['Self-resetting timer: DN is on for one scan every second.', 'Count the pulses.'],
          notes: '<p>Turn on <code>I:0/0</code>. <code>N7:0</code> counts up once per second. Use <kbd>Step scan</kbd> around the moment the timer finishes to see DN on for exactly one scan.</p>',
        },
        {
          id: 'ex-flasher-off-first',
          title: 'Two-timer flasher',
          scene: 'trainer',
          rungs: ['XIC I:0/0 XIO T4:1/DN TON T4:0 1.0 1 0', 'XIC T4:0/DN TON T4:1 1.0 1 0', 'XIC T4:0/DN OTE O:0/0'],
          desc: { 'I:0/0': 'Enable', 'O:0/0': 'Beacon', 'T4:0': 'OFF time', 'T4:1': 'ON time' },
          comments: ['OFF time.', 'ON time, starts when the OFF time is done.', 'Light is on while T4:1 is timing.'],
          notes: '<p>This flasher starts with the light <em>off</em>. Can you change it so it starts <em>on</em>? (That\'s the flasher challenge.)</p>',
        },
        {
          id: 'ex-cascade',
          title: 'Conveyor start sequence',
          scene: 'trainer',
          rungs: [
            'BST XIC I:0/0 NXB XIC B3:0/0 BND XIC I:0/1 OTE B3:0/0',
            'XIC B3:0/0 TON T4:0 1.0 2 0',
            'XIC T4:0/DN TON T4:1 1.0 2 0',
            'XIC B3:0/0 OTE O:0/2',
            'XIC T4:0/DN OTE O:0/1',
            'XIC T4:1/DN OTE O:0/0',
          ],
          desc: { 'I:0/0': 'START', 'I:0/1': 'STOP (NC)', 'B3:0/0': 'Line running', 'O:0/2': 'Conveyor 3 (last)', 'O:0/1': 'Conveyor 2', 'O:0/0': 'Conveyor 1 (first)' },
          comments: ['Line run request (3-wire).', 'Delay 1.', 'Delay 2 starts when delay 1 is done.', 'Downstream conveyor first...', '...then the middle one...', '...then the infeed.'],
          notes: '<p>Turn <code>I:0/1</code> on first (it\'s the NC STOP). Press START and watch the three outputs come on 2 s apart. Turn <code>I:0/1</code> off to stop.</p>',
        },
      ],
      quiz: [
        { q: 'In <code>XIC I:0/0 XIO T4:0/DN TON T4:0 1.0 2 0</code>, how long does T4:0/DN stay on each cycle?', choices: ['2 s', '1 s', 'One scan', 'Until I:0/0 turns off'], answer: 2, why: 'The scan after DN turns on, XIO T4:0/DN makes the rung false and the TON resets.' },
        { q: 'In a cascade, what usually starts the second timer T4:1?', choices: ['I:0/0', 'T4:0/DN', 'T4:0/EN', 'T4:1/DN'], answer: 1, why: 'Each timer starts when the one before it is done.' },
        { q: 'Traffic light: T4:0 times N–S green and T4:1 times N–S yellow. Which condition lights N–S YELLOW?', choices: ['<code>XIC T4:0/DN XIO T4:1/DN</code>', '<code>XIC T4:1/DN</code>', '<code>XIO T4:0/DN</code>', '<code>XIC T4:0/TT XIC T4:1/TT</code>'], answer: 0, why: 'Yellow is the time after green has finished but before the yellow timer is done.' },
        { q: 'In the conveyor start sequence, STOP drops <code>B3:0/0</code>, which is the only condition on T4:0\'s rung. T4:1\'s rung is <code>XIC T4:0/DN</code>. What happens to T4:1?', choices: ['It keeps timing', 'It resets too, because T4:0/DN goes off', 'It holds its ACC', 'It faults'], answer: 1, why: 'T4:0 resets, so its DN bit goes off, so T4:1\'s rung goes false and that TON resets as well. The whole cascade collapses.' },
      ],
      challenges: ['c-flasher', 'c-traffic', 'c-tank'],
    },

    // =====================================================================
    // UNIT 4 — COUNTERS & DATA
    // =====================================================================
    {
      id: 'counters',
      unit: U4,
      title: 'Counters: CTU, CTD and RES',
      minutes: 18,
      body: `
<p>Counters count <strong>events</strong>: boxes past a photo-eye, cars into a garage, strokes of a press.</p>

<h3>The counter element</h3>
<table class="tbl">
<tr><th>Word</th><th>Contents</th></tr>
<tr><td>0</td><td>Status bits: <strong>CU</strong> (15) count-up enable, <strong>CD</strong> (14) count-down enable, <strong>DN</strong> (13) done, <strong>OV</strong> (12) overflow, <strong>UN</strong> (11) underflow, UA (10, used by the high-speed counter)</td></tr>
<tr><td>1</td><td><strong>PRE</strong> — preset</td></tr>
<tr><td>2</td><td><strong>ACC</strong> — accumulated count</td></tr>
</table>

<h3>CTU — count up</h3>
<p><code>CTU C5:0 10 0</code> (counter, preset, starting accumulator) adds 1 to ACC every time its rung goes from <strong>false to true</strong>. Holding the rung true doesn't count again — the CU bit remembers the rung was already true, which is how the counter spots the <em>transition</em>.</p>
<ul>
<li><strong>DN</strong> is on whenever ACC ≥ PRE. The counter <em>keeps counting</em> past the preset (unlike a timer).</li>
<li>Counting past 32767 wraps ACC to −32768 and sets <strong>OV</strong>.</li>
<li>Counters are <strong>retentive</strong>: ACC keeps its value when the rung goes false, and through mode changes and power loss.</li>
</ul>
<div class="ladder" data-rungs="XIC I:0/0 CTU C5:0 5 0|XIC C5:0/DN OTE O:0/0|XIC I:0/1 RES C5:0" data-desc='{"I:0/0":"Part sensor","O:0/0":"5 PARTS light","I:0/1":"Reset PB"}'></div>
<button class="try" data-example="ex-ctu">Load example: count to 5</button>

<h3>RES — reset</h3>
<p>Because a counter is retentive, you must clear it yourself with <code>RES C5:0</code> (ACC = 0 and the status bits cleared). Think about <em>where</em> the reset rung goes: a reset placed <em>above</em> the rungs that use the counter takes effect in the same scan; one placed below takes effect a scan later.</p>

<h3>CTD — count down, and up/down counting</h3>
<p><code>CTD</code> subtracts 1 on each false-to-true transition. Going below −32768 wraps to +32767 and sets <strong>UN</strong>. A CTD on its own is rare; the useful trick is a <strong>CTU and a CTD with the same address</strong>. They share one ACC: one adds, one subtracts. That's how you keep track of how many things are <em>inside</em> something.</p>
<div class="ladder" data-rungs="XIC I:0/0 CTU C5:0 10 0|XIC I:0/1 CTD C5:0 10 0|XIC C5:0/DN OTE O:0/0|XIC I:0/2 RES C5:0" data-desc='{"I:0/0":"ENTRY eye","I:0/1":"EXIT eye","O:0/0":"FULL sign","I:0/2":"RESET key"}'></div>
<p>Give both instructions the same preset — they share the one PRE word.</p>
<button class="try" data-example="ex-updown">Load example: up/down counter</button>

<div class="callout warn">A counter only sees an event if the input is on for at least one full scan (plus the input filter time) and off again for at least one scan. Fast pulses — encoders, flow meters — need a <strong>high-speed counter</strong>.</div>
<div class="callout lab">On a real MicroLogix 1000 with DC inputs, the built-in high-speed counter (the HSC instruction) is tied to counter element <code>C5:0</code>. If your program uses HSC, use <code>C5:1</code> and up for ordinary counters. See the MicroLogix 1000 user manual (1761-UM003) for details. PLCsim does not simulate HSC.</div>
<button class="go-challenge" data-challenge="c-parking">Try the challenge: parking garage FULL sign</button>
<button class="go-challenge" data-challenge="c-batch">Try the challenge: batch counter on a conveyor</button>
`,
      examples: [
        {
          id: 'ex-ctu',
          title: 'Count to 5',
          scene: 'trainer',
          rungs: ['XIC I:0/0 CTU C5:0 5 0', 'XIC C5:0/DN OTE O:0/0', 'XIC I:0/1 RES C5:0'],
          desc: { 'I:0/0': 'Part sensor', 'O:0/0': '5 PARTS light', 'I:0/1': 'Reset PB', 'C5:0': 'Part counter' },
          comments: ['Count up on each off→on of the sensor.', 'Done when ACC ≥ 5.', 'Clear the count.'],
          notes: '<p>Toggle <code>I:0/0</code> on and off five times and watch <code>C5:0.ACC</code>. Leave it on — it doesn\'t count again. Keep going past 5: ACC keeps counting and DN stays on. Then reset.</p>',
        },
        {
          id: 'ex-updown',
          title: 'Up/down counter',
          scene: 'parking',
          rungs: ['XIC I:0/0 CTU C5:0 10 0', 'XIC I:0/1 CTD C5:0 10 0', 'XIC C5:0/DN OTE O:0/0', 'XIO C5:0/DN OTE O:0/1', 'XIC I:0/2 RES C5:0'],
          desc: { 'I:0/0': 'ENTRY eye', 'I:0/1': 'EXIT eye', 'I:0/2': 'RESET key', 'O:0/0': 'FULL sign', 'O:0/1': 'SPACES sign', 'C5:0': 'Cars inside' },
          comments: ['Car in: +1.', 'Car out: −1 (same counter!).', 'Full at 10.', 'Spaces available.', 'Reset.'],
          notes: '<p>Let cars in and out and watch <code>C5:0.ACC</code>. What happens if more cars leave than came in? (ACC goes negative — a real program might block that.)</p>',
        },
      ],
      quiz: [
        { q: 'The rung of a CTU stays true for 10 seconds. How many counts are added?', choices: ['1', '10', 'about 1000', '0'], answer: 0, why: 'Counters count false-to-true transitions, not time.' },
        { q: 'A counter has PRE = 10 and ACC = 12. Is DN on?', choices: ['Yes — DN is on whenever ACC ≥ PRE', 'No — DN is only on when ACC = PRE', 'No — the counter stopped at 10', 'Only for one scan'], answer: 0, why: 'Counters keep counting past the preset and DN stays on while ACC ≥ PRE.' },
        { q: 'Power is lost and restored. What is the counter ACC?', choices: ['0', 'The same as before the power loss', 'The preset', '−1'], answer: 1, why: 'Counters are retentive.' },
        { q: 'A CTU and a CTD both use <code>C5:4</code>. What happens?', choices: ['An error — addresses must be unique', 'They share one ACC: the CTU adds and the CTD subtracts', 'The CTD is ignored', 'They count at double speed'], answer: 1, why: 'This is the standard up/down counter.' },
        { q: 'How do you set a counter\'s ACC back to 0?', choices: ['Make its rung false', 'RES with the same address', 'Count to the preset', 'Change the preset'], answer: 1, why: 'RES clears ACC and the status bits.' },
      ],
      challenges: ['c-parking', 'c-batch'],
    },

    {
      id: 'compare',
      unit: U4,
      title: 'Compare instructions',
      minutes: 16,
      body: `
<p>Compare instructions are <strong>input</strong> instructions: they sit on the left of the rung and are true or false depending on numbers in the data table.</p>
<table class="tbl">
<tr><th>Instruction</th><th>True when</th><th>Example</th></tr>
<tr><td><code>EQU</code></td><td>A = B</td><td><code>EQU N7:0 50</code></td></tr>
<tr><td><code>NEQ</code></td><td>A ≠ B</td><td><code>NEQ C5:0.ACC 0</code></td></tr>
<tr><td><code>LES</code></td><td>A &lt; B</td><td><code>LES T4:0.ACC 100</code></td></tr>
<tr><td><code>LEQ</code></td><td>A ≤ B</td><td><code>LEQ N7:0 0</code></td></tr>
<tr><td><code>GRT</code></td><td>A &gt; B</td><td><code>GRT N7:1 N7:2</code></td></tr>
<tr><td><code>GEQ</code></td><td>A ≥ B</td><td><code>GEQ T4:0.ACC 5</code></td></tr>
<tr><td><code>LIM</code></td><td>Low ≤ Test ≤ High</td><td><code>LIM 10 N7:0 20</code></td></tr>
<tr><td><code>MEQ</code></td><td>(Source AND Mask) = (Compare AND Mask)</td><td><code>MEQ I:0 0007h 0005h</code></td></tr>
</table>
<p>Operands can be word addresses or constants. RSLogix 500 requires at least some of them to be addresses (for example, Source A of EQU) — it will tell you when verifying. Compares work on <em>words</em>: T4:0.ACC, C5:0.ACC, N7:x, even a whole input word I:0.</p>

<h3>LIM — the band test</h3>
<p><code>LIM low test high</code> is true when the test value is between the limits, <em>including</em> the limits. If you enter the low limit larger than the high limit, LIM flips and is true <em>outside</em> the band: <code>LIM 20 N7:0 10</code> is true for N7:0 ≥ 20 or ≤ 10.</p>

<h3>One timer, many events</h3>
<p>Comparing a timer's ACC lets one timer drive a whole sequence. Here a single 9-second cycle timer lights three lamps in turn:</p>
<div class="ladder" data-rungs="XIC I:0/0 XIO T4:0/DN TON T4:0 1.0 9 0|XIC I:0/0 LIM 0 T4:0.ACC 2 OTE O:0/0|XIC I:0/0 LIM 3 T4:0.ACC 5 OTE O:0/1|XIC I:0/0 GEQ T4:0.ACC 6 OTE O:0/2" data-desc='{"I:0/0":"Enable","O:0/0":"Lamp 1","O:0/1":"Lamp 2","O:0/2":"Lamp 3"}'></div>
<p>With a 1.0 s time base, ACC = 0, 1, 2 covers the first three seconds. Notice the <code>XIC I:0/0</code> in front of each LIM: when the system is off, ACC is 0 — which is inside the first band!</p>
<button class="try" data-example="ex-compare-bands">Load example: one timer, three lamps</button>
<div class="callout tip">Think about the edges. <code>GRT T4:0.ACC 5</code> is <em>false</em> when ACC is exactly 5. With a 1.0 s time base, ACC = 5 lasts from 5.0 s to 6.0 s.</div>

<h3>MEQ — checking some bits of a word</h3>
<p>The mask picks which bits matter. <code>MEQ I:0 0007h 0005h</code> looks only at inputs 0–2 (mask 0111) and is true when they are on-off-on (0101), whatever the other inputs are doing.</p>
<button class="try" data-example="ex-meq">Load example: MEQ pattern check</button>
<button class="go-challenge" data-challenge="c-traffic-lim">Try the challenge: traffic light with one timer and LIM</button>
`,
      examples: [
        {
          id: 'ex-compare-bands',
          title: 'One timer, three lamps',
          scene: 'trainer',
          rungs: ['XIC I:0/0 XIO T4:0/DN TON T4:0 1.0 9 0', 'XIC I:0/0 LIM 0 T4:0.ACC 2 OTE O:0/0', 'XIC I:0/0 LIM 3 T4:0.ACC 5 OTE O:0/1', 'XIC I:0/0 GEQ T4:0.ACC 6 OTE O:0/2'],
          desc: { 'I:0/0': 'Enable', 'O:0/0': 'Lamp 1', 'O:0/1': 'Lamp 2', 'O:0/2': 'Lamp 3', 'T4:0': 'Cycle timer' },
          comments: ['9 s self-resetting cycle timer.', 'ACC 0–2.', 'ACC 3–5.', 'ACC 6 and up.'],
          notes: '<p>Turn on <code>I:0/0</code> and watch the lamps follow <code>T4:0.ACC</code>. Change the LIM limits and predict the result before running.</p>',
        },
        {
          id: 'ex-meq',
          title: 'MEQ pattern check',
          scene: 'trainer',
          rungs: ['MEQ I:0 0007h 0005h OTE O:0/0'],
          desc: { 'O:0/0': 'Pattern matched' },
          comments: ['Inputs 0–2 must be ON, OFF, ON. Inputs 3–9 are ignored by the mask.'],
          notes: '<p>Turn on <code>I:0/0</code> and <code>I:0/2</code>: the light comes on. Turn on <code>I:0/1</code> too: off. Turn on any of inputs 3–9: no effect.</p>',
        },
      ],
      quiz: [
        { q: '<code>LIM 10 N7:0 20</code> is true when…', choices: ['N7:0 is between 10 and 20, including 10 and 20', 'N7:0 is between 10 and 20, not including them', 'N7:0 is below 10 or above 20', 'N7:0 equals 10 or 20'], answer: 0, why: 'LIM includes both limits.' },
        { q: '<code>LIM 20 N7:0 10</code> (low limit bigger than high). N7:0 = 25. Is it true?', choices: ['Yes', 'No', 'The processor faults', 'RSLogix won\'t accept it'], answer: 0, why: 'With Low > High, LIM is true outside the band: 25 ≥ 20.' },
        { q: 'T4:0.ACC is exactly 5. Which compare is true?', choices: ['<code>GRT T4:0.ACC 5</code>', '<code>LES T4:0.ACC 5</code>', '<code>GEQ T4:0.ACC 5</code>', '<code>NEQ T4:0.ACC 5</code>'], answer: 2, why: 'Only "greater than or equal" includes 5.' },
        { q: 'Where do compare instructions go on a rung?', choices: ['On the right, as outputs', 'On the left, as conditions (input instructions)', 'Only on their own rung', 'Only inside branches'], answer: 1, why: 'Compares are input instructions: they are true or false and condition the rung.' },
      ],
      challenges: ['c-traffic-lim'],
    },

    {
      id: 'math',
      unit: U4,
      title: 'Math, move and status flags',
      minutes: 20,
      body: `
<p>Math and move instructions are <strong>output</strong> instructions. They execute on <strong>every scan</strong> that their rung is true — with no conditions in front, every scan, period.</p>

<h3>The instructions</h3>
<table class="tbl">
<tr><th>Instruction</th><th>Does</th><th>Example</th></tr>
<tr><td><code>MOV</code></td><td>Dest = Source</td><td><code>MOV 25 N7:0</code></td></tr>
<tr><td><code>ADD</code></td><td>Dest = A + B</td><td><code>ADD N7:0 5 N7:0</code></td></tr>
<tr><td><code>SUB</code></td><td>Dest = A − B</td><td><code>SUB 10 C5:0.ACC N7:1</code></td></tr>
<tr><td><code>MUL</code></td><td>Dest = A × B</td><td><code>MUL N7:0 100 N7:2</code></td></tr>
<tr><td><code>DIV</code></td><td>Dest = A ÷ B, <strong>rounded</strong></td><td><code>DIV N7:2 80 N7:3</code></td></tr>
<tr><td><code>NEG</code></td><td>Dest = −Source</td><td><code>NEG N7:0 N7:4</code></td></tr>
<tr><td><code>CLR</code></td><td>Dest = 0</td><td><code>CLR N7:0</code></td></tr>
</table>
<div class="ladder" data-rungs="XIC I:0/0 OSR B3:0/0 ADD N7:0 5 N7:0|SUB 10 C5:0.ACC N7:1" data-desc='{"I:0/0":"UP button","N7:0":"Setpoint","N7:1":"Spaces left"}'></div>
<p>The first rung adds 5 <em>once per press</em> (thanks to the OSR). Without the OSR it would add 5 a hundred times a second. The second rung has no conditions, so it recalculates every scan — exactly what you want for a display value.</p>

<h3>Integer division rounds</h3>
<p>The MicroLogix 1000 has no floating point. <code>DIV</code> rounds to the nearest whole number: 7 ÷ 2 = 3.5 → <strong>4</strong>; 5 ÷ 3 = 1.67 → <strong>2</strong>. The unrounded quotient and the remainder are left in the math register (S:14 and S:13) if you need them.</p>
<p>Because of this, <strong>multiply before you divide</strong>. What percent is 37 of 80?</p>
<ul>
<li>Right: 37 × 100 = 3700, then 3700 ÷ 80 = 46.25 → <strong>46</strong>.</li>
<li>Wrong: 37 ÷ 80 = 0.46 → <strong>0</strong>, then 0 × 100 = 0.</li>
</ul>
<button class="try" data-example="ex-math">Load example: multiply before you divide</button>

<h3>Status flags</h3>
<p>After each math instruction, the processor sets four arithmetic flags in status word S:0. Examine them on the rungs <em>right after</em> the math — the next math instruction overwrites them.</p>
<table class="tbl">
<tr><th>Bit</th><th>Flag</th><th>Set when</th></tr>
<tr><td><code>S:0/0</code></td><td>C — carry</td><td>the operation produced a carry or borrow</td></tr>
<tr><td><code>S:0/1</code></td><td>V — overflow</td><td>the true result doesn't fit in −32768…32767</td></tr>
<tr><td><code>S:0/2</code></td><td>Z — zero</td><td>the result is 0</td></tr>
<tr><td><code>S:0/3</code></td><td>S — sign</td><td>the result is negative</td></tr>
</table>

<h3>Overflow is a fault</h3>
<p>If a result is too big — say <code>ADD 32000 1000 N7:0</code> — the destination is clamped to 32767 (or −32768), the V flag is set, and the <strong>overflow trap bit S:5/0</strong> is set. If S:5/0 is still set when the scan ends, the processor stops with <strong>major fault 0020h</strong> and all outputs turn off.</p>
<p>Two ways to live with it:</p>
<ul>
<li><strong>Prevent it</strong> — check the values with compares before doing the math (best).</li>
<li><strong>Accept it</strong> — if a clamped result is OK, unlatch the trap on the last rung: <code>OTU S:5/0</code>. The processor then doesn't fault.</li>
</ul>
<p>Dividing by zero also sets overflow. (Some SLC and MicroLogix processors also have a <em>math overflow selection</em> bit, S:2/14, that changes what's stored on overflow — see your controller's status file description.)</p>
<button class="try" data-example="ex-overflow">Load example: overflow fault</button>

<h3>The first-scan bit S:1/15</h3>
<p><code>S:1/15</code> is on for the <strong>first scan</strong> after the processor enters RUN, then off. Use it to put the machine in a known state: load setpoints, reset counters, unlatch latched bits.</p>
<div class="ladder" data-rungs="XIC S:1/15 BST MOV 25 N7:0 NXB RES C5:0 NXB OTU B3:0/0 BND" data-desc='{"S:1/15":"First pass","N7:0":"Setpoint","C5:0":"Batch count","B3:0/0":"Cycle latched"}'></div>
<button class="try" data-example="ex-first-pass">Load example: first-scan initialise</button>
<button class="go-challenge" data-challenge="c-spaces-left">Try the challenge: spaces-left display</button>
<button class="go-challenge" data-challenge="c-first-scan">Try the challenge: setpoint with first-scan initialise</button>
`,
      examples: [
        {
          id: 'ex-math',
          title: 'Multiply before you divide',
          scene: 'trainer',
          rungs: ['MOV 37 N7:0', 'MOV 80 N7:1', 'MUL N7:0 100 N7:2', 'DIV N7:2 N7:1 N7:3', 'DIV N7:0 N7:1 N7:4', 'MUL N7:4 100 N7:5'],
          desc: { 'N7:0': 'Part', 'N7:1': 'Whole', 'N7:2': 'Part × 100', 'N7:3': 'Percent (right)', 'N7:4': 'Part ÷ whole', 'N7:5': 'Percent (wrong)' },
          comments: ['Part = 37.', 'Whole = 80.', 'Multiply first...', '...then divide: 46.', 'Divide first: 0.46 rounds to 0...', '...so the percentage is 0.'],
          notes: '<p>Run it and compare <code>N7:3</code> (46) with <code>N7:5</code> (0). Change the MOV values: try 45 of 90, or 1 of 3.</p>',
        },
        {
          id: 'ex-overflow',
          title: 'Overflow fault',
          scene: 'trainer',
          rungs: ['XIC I:0/0 ADD N7:0 1000 N7:0', 'XIC I:0/2 CLR N7:0', 'XIC I:0/1 OTU S:5/0'],
          desc: { 'I:0/0': 'Add 1000 per scan', 'I:0/1': 'Ignore overflow', 'I:0/2': 'Clear', 'N7:0': 'Total', 'S:5/0': 'Overflow trap' },
          comments: ['Adds 1000 EVERY scan while I:0/0 is on.', 'Clear the total.', 'Last rung: unlatching the trap prevents the 0020h fault.'],
          notes: '<p>Turn on <code>I:0/0</code>. Within a third of a second <code>N7:0</code> passes 32767 and the processor faults with 0020h. Clear the fault, go back to RUN, turn on <code>I:0/1</code> first, and try again: now <code>N7:0</code> just sticks at 32767.</p>',
        },
        {
          id: 'ex-first-pass',
          title: 'First-scan initialise',
          scene: 'trainer',
          rungs: ['XIC S:1/15 BST MOV 25 N7:0 NXB RES C5:0 NXB OTU B3:0/0 BND', 'XIC I:0/0 CTU C5:0 100 0', 'XIC I:0/1 OTL B3:0/0', 'XIC B3:0/0 OTE O:0/0'],
          desc: { 'S:1/15': 'First pass', 'N7:0': 'Setpoint', 'C5:0': 'Batch count', 'B3:0/0': 'Cycle latched', 'I:0/0': 'Count', 'I:0/1': 'Latch cycle', 'O:0/0': 'Cycle light' },
          comments: ['On the first scan only: load the setpoint, clear the count, unlatch the cycle bit.', 'A retentive counter.', 'A latched bit.', ''],
          notes: '<p>Count a few parts and latch <code>B3:0/0</code>. Change <code>N7:0</code> in the data table. Now go to PROGRAM and back to RUN: the first-scan rung puts everything back to its start-up state.</p>',
        },
      ],
      quiz: [
        { q: '<code>DIV 7 2 N7:0</code> — what ends up in N7:0?', choices: ['3', '3.5', '4', '1'], answer: 2, why: 'Integer DIV rounds to the nearest whole number: 3.5 rounds to 4.' },
        { q: '<code>ADD 32000 1000 N7:0</code> runs and nothing else touches the status file. What happens?', choices: ['N7:0 = 33000', 'N7:0 = −32536 and the program continues', 'N7:0 is clamped to 32767 and the processor faults with 0020h at the end of the scan', 'The instruction is skipped'], answer: 2, why: 'The overflow trap S:5/0 is set; if it is still set at the end of the scan, that\'s major fault 0020h.' },
        { q: 'Which bit is on only during the first scan after entering RUN?', choices: ['S:0/2', 'S:1/15', 'S:5/0', 'T4:0/DN'], answer: 1, why: 'S:1/15 is the first-pass bit.' },
        { q: 'To find what percent 37 is of 80 with integer math, you should…', choices: ['divide 37 by 80, then multiply by 100', 'multiply 37 by 100, then divide by 80', 'use MOV', 'it can\'t be done without floating point'], answer: 1, why: 'Dividing first loses everything after the decimal point (0.46 → 0).' },
        { q: '<code>XIC I:0/0 MOV 5 N7:0</code> — the button is held for one second. How many times does the MOV execute?', choices: ['Once', 'About 100 times (every scan)', 'Never', 'Twice'], answer: 1, why: 'Output instructions execute every scan their rung is true. (For MOV that\'s harmless; for ADD it matters.)' },
      ],
      challenges: ['c-spaces-left', 'c-first-scan'],
    },

    // =====================================================================
    // UNIT 5 — PROGRAM STRUCTURE & TROUBLESHOOTING
    // =====================================================================
    {
      id: 'program-control',
      unit: U5,
      title: 'Subroutines, jumps and MCR zones',
      minutes: 20,
      body: `
<h3>Program files</h3>
<p>An RSLogix 500 project holds several program files (LAD files):</p>
<ul>
<li><strong>LAD 0</strong> — system file (not ladder you edit), <strong>LAD 1</strong> — reserved.</li>
<li><strong>LAD 2</strong> — the <strong>main program</strong>. It's the only one scanned automatically.</li>
<li><strong>LAD 3 and up</strong> — subroutines (up to LAD 15 on the MicroLogix 1000). They run only when called.</li>
</ul>

<h3>JSR, SBR and RET</h3>
<p><code>JSR U:3</code> (Jump to Subroutine) calls LAD 3 when its rung is true. The processor solves every rung of LAD 3 and then comes back to the rung after the JSR. <code>RET</code> (Return) ends the subroutine early when its rung is true; reaching the end of the file returns too. <code>SBR</code> is an optional marker at the start of the subroutine (on some processors it's used for passing parameters).</p>
<div class="ladder" data-rungs="XIC I:0/0 JSR U:3|XIC I:0/0 OTE O:0/1" data-desc='{"I:0/0":"AUTO mode","O:0/1":"AUTO light"}'></div>
<p>Subroutines keep big programs organised: one file per machine section, per mode (auto/manual), or for code that's used from several places.</p>
<div class="callout warn"><strong>A subroutine that isn't called isn't scanned.</strong> Its OTE outputs keep whatever value they had the last time it ran — they don't turn off! Timers in it stop updating too. If an output must turn off when its subroutine stops being called, turn it off from somewhere that <em>is</em> scanned (for example <code>XIO I:0/0 OTU O:0/0</code> in the main program), or call the subroutine every scan and put the mode condition inside it.</div>
<button class="try" data-example="ex-subroutine">Load example: frozen subroutine outputs</button>
<p>Subroutines can call other subroutines, up to a nesting limit (PLCsim allows 8 levels; check the manual for your processor). A subroutine calling itself will hit that limit and fault.</p>

<h3>JMP and LBL</h3>
<p><code>JMP Q2:1</code> skips to the rung that starts with <code>LBL Q2:1</code> in the same file. The rungs in between are <strong>not scanned</strong> — their outputs freeze, just like an uncalled subroutine.</p>
<div class="ladder" data-rungs="XIC I:0/0 JMP Q2:1|XIC I:0/1 OTE O:0/0|LBL Q2:1 XIC I:0/2 OTE O:0/1" data-desc='{"I:0/0":"Skip","I:0/1":"Switch 1","I:0/2":"Switch 2"}'></div>
<ul>
<li>LBL must be the first instruction on its rung, and each label number may be used once per file.</li>
<li>Jumping <em>backwards</em> makes a loop. If the loop never ends, the scan never ends and the watchdog faults the processor (0022h).</li>
</ul>
<button class="try" data-example="ex-jmp">Load example: JMP and LBL</button>

<h3>MCR zones</h3>
<p>A <strong>Master Control Reset</strong> zone is a block of rungs between two <code>MCR</code> instructions. The first MCR has conditions; the last one is alone on its rung (unconditional).</p>
<div class="ladder" data-rungs="XIC I:0/0 MCR|XIC I:0/1 OTE O:0/0|XIC I:0/2 OTL O:0/1|MCR|XIC I:0/4 OTU O:0/1" data-desc='{"I:0/0":"Zone enable","I:0/1":"Switch 1","I:0/2":"Latch","I:0/4":"Unlatch","O:0/0":"OTE output","O:0/1":"Latched output"}'></div>
<p>When the start rung is <strong>false</strong>, every rung in the zone is solved as if it were false: OTEs turn off, TONs reset, but retentive instructions (OTL/OTU, RTO, counters) keep their values. When it's true, the zone works normally.</p>
<ul><li>Don't nest or overlap MCR zones, and don't jump into one.</li></ul>
<div class="callout warn">The MCR instruction is <strong>not</strong> a substitute for a hard-wired master control relay or emergency stop. Those must remove power from the outputs even if the processor has failed.</div>
<button class="try" data-example="ex-mcr">Load example: MCR zone</button>

<h3>TND</h3>
<p><code>TND</code> (Temporary End) ends the program scan at that rung when true: I/O is updated and the scan starts again at the top. It's a debugging tool — drop it in to run only the top part of a program.</p>
<button class="go-challenge" data-challenge="c-subroutine">Try the challenge: auto/manual with subroutines</button>
`,
      examples: [
        {
          id: 'ex-subroutine',
          title: 'Frozen subroutine outputs',
          scene: 'trainer',
          rungs: ['XIC I:0/0 JSR U:3', 'XIC I:0/0 OTE O:0/1'],
          subs: { 3: ['XIC I:0/1 OTE O:0/0', 'XIC I:0/2 TON T4:0 1.0 10 0', 'XIC T4:0/TT OTE O:0/2'] },
          desc: { 'I:0/0': 'Call LAD 3', 'I:0/1': 'Switch 1', 'I:0/2': 'Start timer', 'O:0/0': 'Output in LAD 3', 'O:0/1': 'Calling light', 'O:0/2': 'Timing light', 'T4:0': 'Timer in LAD 3' },
          comments: ['Call subroutine LAD 3 while I:0/0 is on.', 'Indicator.'],
          notes: '<p>Turn on <code>I:0/0</code> (calling), then <code>I:0/1</code> and <code>I:0/2</code>. Now turn <code>I:0/0</code> off and then turn <code>I:0/1</code> and <code>I:0/2</code> off: <code>O:0/0</code> stays on and <code>T4:0.ACC</code> stops where it was. Look at LAD 3 — nothing in it is highlighted, because it isn\'t being scanned.</p>',
        },
        {
          id: 'ex-jmp',
          title: 'JMP and LBL',
          scene: 'trainer',
          rungs: ['XIC I:0/0 JMP Q2:1', 'XIC I:0/1 OTE O:0/0', 'LBL Q2:1 XIC I:0/2 OTE O:0/1'],
          desc: { 'I:0/0': 'Skip', 'I:0/1': 'Switch 1', 'I:0/2': 'Switch 2', 'O:0/0': 'Light 1', 'O:0/1': 'Light 2' },
          comments: ['Jump over rung 1 while I:0/0 is on.', 'Skipped rung: its output freezes.', 'Execution continues here.'],
          notes: '<p>Turn on <code>I:0/1</code> (light 1 on). Now turn on <code>I:0/0</code> and turn <code>I:0/1</code> off: light 1 stays on, because rung 1 is no longer scanned.</p>',
        },
        {
          id: 'ex-mcr',
          title: 'MCR zone',
          scene: 'trainer',
          rungs: ['XIC I:0/0 MCR', 'XIC I:0/1 OTE O:0/0', 'XIC I:0/2 OTL O:0/1', 'XIC I:0/3 TON T4:0 1.0 5 0', 'XIC T4:0/DN OTE O:0/2', 'MCR', 'XIC I:0/4 OTU O:0/1'],
          desc: { 'I:0/0': 'Zone enable', 'I:0/1': 'Switch 1', 'I:0/2': 'Latch', 'I:0/3': 'Timer', 'I:0/4': 'Unlatch', 'O:0/0': 'OTE output', 'O:0/1': 'Latched output', 'O:0/2': 'Timer done' },
          comments: ['Start of zone (conditional).', 'Non-retentive: turns off when the zone is disabled.', 'Retentive: keeps its state.', 'TON resets when the zone is disabled.', '', 'End of zone (unconditional).', 'Outside the zone.'],
          notes: '<p>Turn on <code>I:0/0</code> and then switches 1–3. Let the timer finish. Now turn <code>I:0/0</code> off: the OTE output and the timer reset, but the latched output stays on.</p>',
        },
      ],
      quiz: [
        { q: 'Which program file is scanned automatically every scan?', choices: ['LAD 0', 'LAD 1', 'LAD 2', 'Every LAD file'], answer: 2, why: 'LAD 2 is the main program. Other files run only when called with JSR.' },
        { q: 'A rung skipped by a JMP had set <code>OTE O:0/1</code> to 1. While the jump is active, O:0/1 is…', choices: ['forced off', 'left on (frozen)', 'toggled', 'faulted'], answer: 1, why: 'Skipped rungs are not scanned, so their outputs keep their last state.' },
        { q: 'The start rung of an MCR zone is false. What happens to OTE outputs inside the zone?', choices: ['They keep their state', 'They turn off', 'They turn on', 'They fault'], answer: 1, why: 'All rungs in a false MCR zone are solved as false, so OTEs write 0. Latches keep their state.' },
        { q: 'Which instruction ends a subroutine early?', choices: ['END', 'TND', 'RET', 'LBL'], answer: 2, why: 'RET returns to the rung after the JSR.' },
        { q: 'A <code>JMP</code> jumps backwards to a label and its condition never goes false. What happens?', choices: ['The rungs run twice', 'The scan never ends and the watchdog faults the processor (0022h)', 'RSLogix skips the JMP', 'Outputs flicker'], answer: 1, why: 'An endless loop stops the scan from finishing; the watchdog catches it.' },
      ],
      challenges: ['c-subroutine'],
    },

    {
      id: 'shift-seq',
      unit: U5,
      title: 'Bit shifts and sequencers',
      minutes: 20,
      body: `
<h3>Bit shift registers: BSL and BSR</h3>
<p>A <strong>bit shift register</strong> is a row of bits that moves one place each time it's triggered — like a conveyor made of memory. <code>BSL</code> (Bit Shift Left) moves bits toward higher bit numbers; <code>BSR</code> (Bit Shift Right) toward lower ones.</p>
<p><code>BSL #B3:1 R6:0 I:0/1 16</code> has four operands:</p>
<table class="tbl">
<tr><th>Operand</th><th>Example</th><th>Meaning</th></tr>
<tr><td>File</td><td><code>#B3:1</code></td><td>Where the bit array starts (the # means "a file of words")</td></tr>
<tr><td>Control</td><td><code>R6:0</code></td><td>Control element: EN, DN, UL (unload) bits and LEN</td></tr>
<tr><td>Bit address</td><td><code>I:0/1</code></td><td>The bit that gets loaded in at the start</td></tr>
<tr><td>Length</td><td><code>16</code></td><td>Number of bits in the array</td></tr>
</table>
<p>On each <strong>false-to-true</strong> transition of the rung, every bit moves up one place, the bit address is copied into bit 0, and the bit that falls off the end goes into <code>R6:0/UL</code>. BSR does the same in the other direction: the new bit goes in at the top and bit 0 falls out into UL.</p>
<div class="ladder" data-rungs="XIC I:0/0 BSL #B3:1 R6:0 I:0/1 8|XIC B3:1/0 OTE O:0/0|XIC B3:1/1 OTE O:0/1|XIC B3:1/2 OTE O:0/2|XIC B3:1/3 OTE O:0/3" data-desc='{"I:0/0":"Shift","I:0/1":"Data in","O:0/0":"Position 0","O:0/1":"Position 1","O:0/2":"Position 2","O:0/3":"Position 3"}'></div>
<button class="try" data-example="ex-bsl">Load example: watch the bits move</button>
<h4>Tracking parts on a conveyor</h4>
<p>On an indexing conveyor, each INDEX pulse moves every part one station. If the shift is triggered by that pulse and the bit address is an inspection sensor, then bit <em>n</em> of the register describes the part that is <em>n</em> stations past the inspection. A reject station 4 stations downstream just looks at bit 4. This is how real plants track good and bad parts without sensors at every station.</p>
<div class="callout note">The file uses whole words: a length of 20 needs two words (B3:1 and B3:2). Don't use the leftover bits of the last word for anything else.</div>

<h3>Sequencer output: SQO</h3>
<p>Many machines step through a fixed pattern of outputs. The <strong>SQO</strong> (Sequencer Output) instruction stores each step's output pattern as a word in a table and copies one step at a time to an output word.</p>
<p><code>SQO #N7:0 003Fh O:0.0 R6:0 6 0</code>:</p>
<table class="tbl">
<tr><th>Operand</th><th>Example</th><th>Meaning</th></tr>
<tr><td>File</td><td><code>#N7:0</code></td><td>The table. Word 0 is position 0 (start-up); steps 1…LEN follow.</td></tr>
<tr><td>Mask</td><td><code>003Fh</code></td><td>Only the bits that are 1 in the mask are changed in the destination (here bits 0–5).</td></tr>
<tr><td>Destination</td><td><code>O:0.0</code></td><td>The word the pattern is written to — here the whole output word.</td></tr>
<tr><td>Control</td><td><code>R6:0</code></td><td>Holds LEN, POS (current step) and the EN, DN bits.</td></tr>
<tr><td>Length / Position</td><td><code>6 0</code></td><td>Number of steps; starting position.</td></tr>
</table>
<p>On each false-to-true transition, POS goes up by one and that step's word is copied (through the mask) to the destination. After the last step it wraps back to step 1. DN is on at the last step.</p>
<h4>Designing the table</h4>
<p>For the traffic light, each output bit has a value: N–S red = 1, N–S yellow = 2, N–S green = 4, E–W red = 8, E–W yellow = 16, E–W green = 32. "N–S green + E–W red" is 4 + 8 = 12. Make one table word per step, and let a self-resetting timer trigger the SQO.</p>
<button class="try" data-example="ex-sqo-chaser">Load example: SQO light chaser</button>
<p><strong>SQC</strong> (Sequencer Compare) is the input-side twin: it compares an input word, through a mask, with the current step of its table and sets the control element's FD (found) bit when they match — handy to check that a machine really reached each step. <strong>COP</strong> (copy file) and <strong>FLL</strong> (fill file) move whole blocks of words.</p>
<button class="go-challenge" data-challenge="c-sqo-traffic">Try the challenge: traffic light with a sequencer</button>
<button class="go-challenge" data-challenge="c-bsl-reject">Try the challenge: reject tracking with a bit shift</button>
`,
      examples: [
        {
          id: 'ex-bsl',
          title: 'Watch the bits move',
          scene: 'trainer',
          rungs: ['XIC I:0/0 BSL #B3:1 R6:0 I:0/1 8', 'XIC B3:1/0 OTE O:0/0', 'XIC B3:1/1 OTE O:0/1', 'XIC B3:1/2 OTE O:0/2', 'XIC B3:1/3 OTE O:0/3', 'XIC B3:1/4 OTE O:0/4', 'XIC B3:1/5 OTE O:0/5'],
          desc: { 'I:0/0': 'Shift pulse', 'I:0/1': 'Data in', 'R6:0': 'BSL control' },
          comments: ['Each off→on of I:0/0 shifts B3:1 left and loads I:0/1 into bit 0.', 'Show positions 0–5 on the lights.'],
          notes: '<p>Turn on <code>I:0/1</code>, pulse <code>I:0/0</code> once, turn <code>I:0/1</code> off, then keep pulsing <code>I:0/0</code>. The single 1 walks along the lights and finally falls off into <code>R6:0/UL</code>.</p>',
        },
        {
          id: 'ex-sqo-chaser',
          title: 'SQO light chaser',
          scene: 'trainer',
          rungs: [
            'XIC S:1/15 BST MOV 1 N7:11 NXB MOV 2 N7:12 NXB MOV 4 N7:13 NXB MOV 8 N7:14 BND',
            'XIC I:0/0 XIO T4:0/DN TON T4:0 0.01 50 0',
            'XIC T4:0/DN SQO #N7:10 000Fh O:0.0 R6:1 4 0',
          ],
          desc: { 'I:0/0': 'Run', 'N7:10': 'Table (steps in N7:11–N7:14)', 'R6:1': 'Sequencer control', 'T4:0': 'Step timer (0.5 s)' },
          comments: ['Load the 4-step table on the first scan.', 'Step pulse every 0.5 s.', 'Copy one table word per step to outputs 0–3 (mask 000Fh).'],
          notes: '<p>Turn on <code>I:0/0</code>: outputs 0–3 light one after another. Watch <code>R6:1.POS</code>. Change the table (e.g. <code>N7:12</code> = 3) in the data table and see the pattern change.</p>',
        },
      ],
      quiz: [
        { q: '<code>BSL #B3:1 R6:0 I:0/5 16</code> shifts. What is loaded into B3:1/0?', choices: ['Always 0', 'Always 1', 'The state of I:0/5 at that moment', 'The bit that fell off the end'], answer: 2, why: 'The bit address is the data that enters the register.' },
        { q: 'When does a BSL shift?', choices: ['Every scan its rung is true', 'On each false-to-true transition of its rung', 'Once per second', 'When R6:0/DN is on'], answer: 1, why: 'Shifts, like counters and sequencers, act on the rising edge of the rung.' },
        { q: 'An SQO has length 4 and is at position 4. Its rung goes false then true again. What is the new position?', choices: ['5', '0', '1', '4'], answer: 2, why: 'After the last step the SQO wraps back to step 1 (position 0 is only the start-up position).' },
        { q: 'An SQO uses mask <code>000Fh</code> with destination <code>O:0.0</code>. What does the mask do?', choices: ['Only outputs 0–3 are changed by the sequencer', 'Outputs 0–3 are never changed', 'It limits the table to 15 steps', 'It sets the step time'], answer: 0, why: 'Only destination bits whose mask bit is 1 are written.' },
      ],
      challenges: ['c-sqo-traffic', 'c-bsl-reject'],
    },

    {
      id: 'troubleshooting',
      unit: U5,
      title: 'Troubleshooting and faults',
      minutes: 22,
      body: `
<p>A machine has stopped and everyone is looking at you. Good troubleshooting is a method, not luck.</p>

<h3>1. Is the processor running?</h3>
<p>Check the LEDs on the MicroLogix 1000: <strong>POWER</strong>, <strong>RUN</strong>, <strong>FAULT</strong> and <strong>FORCE</strong>. If FAULT is on, the processor has stopped with a major fault and all outputs are off — go to step 5. If FORCE is on, something is being forced (step 4).</p>

<h3>2. Divide and conquer: input, logic or output?</h3>
<ol>
<li><strong>Operate the input device</strong> (press the button, block the photo-eye). Does the input LED change? Does the input bit change in the data table? If not, the problem is <em>outside</em> the PLC: the device, its wiring, the fuse or the power supply.</li>
<li><strong>The input changes but the output bit doesn't?</strong> It's logic. Go online, find the rung that drives the output and follow the highlighting from left to right. The first instruction that isn't highlighted is your suspect — now find out why <em>that</em> bit is in the wrong state.</li>
<li><strong>The output bit is on but the device doesn't work?</strong> Check the output LED, the output wiring, the fuse, the load's power supply and the device itself.</li>
</ol>
<div class="callout lab">Never assume. Measure. A meter on the input terminal tells you in seconds whether the problem is in the field or in the PLC.</div>

<h3>3. Tools in RSLogix 500</h3>
<ul>
<li><strong>Cross reference</strong> lists every place an address is used and which instruction uses it. It's the fastest way to find a double coil (two OTEs to the same address) or to see where a bit gets turned on.</li>
<li><strong>Data table monitoring</strong> shows live values: timer ACCs creeping up, counters, N7 words. Change the radix to binary to see individual bits.</li>
<li><strong>Verify</strong> (file or project) checks the program before download: missing operands, input instructions after outputs, a JMP without its LBL, and so on. PLCsim runs the same kind of checks before going to RUN.</li>
<li><strong>Find</strong> and <strong>descriptions</strong> — a program with good descriptions and rung comments is ten times faster to troubleshoot.</li>
</ul>

<h3>4. Forcing</h3>
<p>A <strong>force</strong> overrides an input or output bit, no matter what the field device or the program says. Forcing an input on makes the program believe the device is on; forcing an output on turns the terminal on directly.</p>
<div class="callout warn"><strong>Forcing is dangerous.</strong>
<ul><li>A forced output bypasses every interlock in your program. The machine can move with nobody touching a button.</li>
<li>Forces stay in effect until they are removed — even after you walk away — and they can be saved with the program.</li>
<li>Only force with the machine in a safe state, people clear, and permission from whoever is responsible. Remove every force when you're done and check that the FORCE LED is off.</li></ul></div>
<p>In SLC 500 and MicroLogix controllers only I and O bits can be forced.</p>
<button class="try" data-example="ex-forcing">Load example: forcing practice</button>

<h3>5. Faults</h3>
<p>When the processor detects a serious error it stops (FAULT LED on, outputs off) and writes a <strong>major error code</strong> into <code>S:6</code>. <code>S:1/13</code> (major error halted) is set. Some common codes:</p>
<table class="tbl">
<tr><th>Code</th><th>Meaning</th><th>Typical cause</th></tr>
<tr><td><code>0020h</code></td><td>A minor error bit (like the math overflow trap S:5/0) was set at the end of the scan</td><td>Math result too big, divide by zero</td></tr>
<tr><td><code>0022h</code></td><td>Watchdog: the scan took too long</td><td>A JMP loop that never ends</td></tr>
<tr><td><code>0034h</code></td><td>Negative value in a timer preset or accumulator</td><td>A MOV or math wrote a negative number into T4:x.PRE</td></tr>
</table>
<p>For other codes, look up the value of S:6 in the error-code tables of 1747-RM001 or the MicroLogix 1000 user manual.</p>
<h4>Clearing a fault</h4>
<ol>
<li><strong>Fix the cause first</strong>, or the fault will come straight back.</li>
<li>Clear the major fault. In RSLogix 500, go online and use the processor status / fault dialog to clear the major error. (PLCsim has a Clear fault button.)</li>
<li>Put the processor back in RUN — and make sure the machine is safe to restart.</li>
</ol>
<button class="try" data-example="ex-fault-0034">Load example: cause a 0034h fault</button>

<h3>Common mistakes checklist</h3>
<table class="tbl">
<tr><th>Symptom</th><th>Likely mistake</th></tr>
<tr><td>Motor runs only while STOP is pressed</td><td>XIO used on a normally-closed STOP button</td></tr>
<tr><td>An output ignores one of its rungs</td><td>Double coil — the same OTE on two rungs</td></tr>
<tr><td>Motor stops when START is released</td><td>Missing seal-in branch</td></tr>
<tr><td>STOP doesn't stop the motor</td><td>STOP placed inside the START leg of the branch</td></tr>
<tr><td>A count or ADD jumps by dozens per press</td><td>Missing one-shot (OSR)</td></tr>
<tr><td>Two one-shots behave strangely</td><td>They share a storage bit</td></tr>
<tr><td>A counter never resets / keeps its value after restart</td><td>Counters are retentive — add a RES</td></tr>
<tr><td>Output stuck on after changing mode</td><td>Subroutine no longer called, or rungs skipped by JMP</td></tr>
<tr><td>Processor faults 0020h</td><td>Math overflow</td></tr>
<tr><td>Address won't verify on an ML1000</td><td>Using SLC-style addresses like I:1/0, or F8/N10 files that don't exist</td></tr>
</table>
<button class="go-challenge" data-challenge="c-debug-motor">Try the challenge: fix the motor program</button>
`,
      examples: [
        {
          id: 'ex-forcing',
          title: 'Forcing practice',
          scene: 'motor',
          rungs: ['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIC I:0/2 OTE O:0/0', 'XIC O:0/0 OTE O:0/1', 'XIO O:0/0 OTE O:0/2'],
          desc: { 'I:0/0': 'START', 'I:0/1': 'STOP (NC)', 'I:0/2': 'Overload (NC)', 'O:0/0': 'Motor M1', 'O:0/1': 'RUNNING light', 'O:0/2': 'STOPPED light' },
          comments: ['Normal 3-wire control.', '', ''],
          notes: '<p>Start the motor normally. Now force <code>O:0/2</code> (STOPPED light) ON: both lights are on — the program says one thing, the output says another. Next, force <code>I:0/1</code> ON and press the STOP button: the motor keeps running, because the program never sees STOP. Remove all forces when you\'re done.</p>',
        },
        {
          id: 'ex-fault-0034',
          title: 'Cause a 0034h fault',
          scene: 'trainer',
          rungs: ['XIC I:0/0 MOV -5 T4:0.PRE', 'XIC I:0/1 TON T4:0 1.0 10 0', 'XIC T4:0/DN OTE O:0/0'],
          desc: { 'I:0/0': 'Write bad preset', 'I:0/1': 'Run timer', 'O:0/0': 'Timer done', 'T4:0': 'Timer' },
          comments: ['A bug: writes a negative number into the timer preset.', 'The timer checks its preset...', ''],
          notes: '<p>Run it and turn on <code>I:0/0</code>. The processor faults with 0034h and <code>S:6</code> shows the code. Turn <code>I:0/0</code> off, set <code>T4:0.PRE</code> back to 10 in the data table, clear the fault and go back to RUN.</p>',
        },
      ],
      quiz: [
        { q: 'The operator presses START but its input LED on the PLC doesn\'t light. Where is the problem most likely?', choices: ['In the ladder program', 'In the field: the button, its wiring, a fuse or the power supply', 'In the output module', 'In RSLogix 500'], answer: 1, why: 'The program can\'t change an input LED. If the input never reaches the PLC, look outside it.' },
        { q: 'Which RSLogix tool quickly shows every rung that writes to <code>O:0/3</code>?', choices: ['Cross reference', 'The status file', 'Verify', 'The force table'], answer: 0, why: 'Cross reference lists every use of an address — the quickest way to spot a double coil.' },
        { q: 'Why is forcing an output ON dangerous?', choices: ['It wears out the output', 'It bypasses the program, including interlocks, so equipment can move unexpectedly', 'It clears the program', 'It causes a 0022h fault'], answer: 1, why: 'A force overrides whatever the logic says.' },
        { q: 'The processor faulted and S:6 = 0020h. What is the most likely cause?', choices: ['A watchdog timeout', 'A math overflow left the overflow trap bit S:5/0 set at the end of the scan', 'A negative timer preset', 'A missing subroutine'], answer: 1, why: '0020h means a minor error bit (usually the math overflow trap) was still set at the end of the scan.' },
        { q: 'What must you do FIRST before clearing a major fault?', choices: ['Cycle power', 'Fix the cause of the fault', 'Force all outputs off', 'Download a blank program'], answer: 1, why: 'Otherwise the same error faults the processor again as soon as it runs.' },
      ],
      challenges: ['c-debug-motor'],
    },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
