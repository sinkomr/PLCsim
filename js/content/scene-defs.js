/*
 * Scene I/O maps. These are the wiring diagrams shared by the animated
 * scenes (js/scenes/*.js), the lessons and the challenge tests.
 *
 * Addresses are written for the MicroLogix 1000 (I:0/n, O:0/n). On other
 * controllers PLC.remapIO() moves them to that controller's first input and
 * output slot (e.g. I:1/n and O:2/n on an SLC rack).
 *
 * Input device types:
 *   pb-no   momentary push button, normally open  (pressed → 1)
 *   pb-nc   momentary push button, normally closed (released → 1, pressed → 0)
 *   switch  maintained selector/toggle switch
 *   sensor  driven by the scene (limit switch, photo-eye, level switch …)
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  PLC.SCENE_DEFS = [
    {
      id: 'trainer',
      name: 'I/O Trainer',
      blurb: 'Switches and pilot lights wired to every input and output. Click a switch to turn an input on.',
      inputs: {},   // generated from the controller's inputs
      outputs: {},
    },
    {
      id: 'motor',
      name: 'Motor Start/Stop Station',
      blurb: 'A 3-wire start/stop station for a conveyor motor, with an overload relay you can trip.',
      inputs: {
        'I:0/0': { label: 'START push button', device: 'pb-no' },
        'I:0/1': { label: 'STOP push button', device: 'pb-nc' },
        'I:0/2': { label: 'Overload relay contact', device: 'sensor', note: 'Normally closed: 1 when healthy, 0 when the overload trips' },
        'I:0/3': { label: 'JOG push button', device: 'pb-no' },
      },
      outputs: {
        'O:0/0': { label: 'Motor starter M1', color: 'motor' },
        'O:0/1': { label: 'RUNNING light', color: 'green' },
        'O:0/2': { label: 'STOPPED light', color: 'red' },
        'O:0/3': { label: 'OVERLOAD light', color: 'amber' },
      },
    },
    {
      id: 'fwdrev',
      name: 'Forward/Reverse Motor',
      blurb: 'A reversing motor starter. Energising both contactors at once is a dead short — the scene will show a fault.',
      inputs: {
        'I:0/0': { label: 'STOP push button', device: 'pb-nc' },
        'I:0/1': { label: 'FORWARD push button', device: 'pb-no' },
        'I:0/2': { label: 'REVERSE push button', device: 'pb-no' },
        'I:0/3': { label: 'Overload relay contact', device: 'sensor', note: 'Normally closed: 1 when healthy' },
      },
      outputs: {
        'O:0/0': { label: 'FORWARD contactor', color: 'motor' },
        'O:0/1': { label: 'REVERSE contactor', color: 'motor' },
        'O:0/2': { label: 'FORWARD light', color: 'green' },
        'O:0/3': { label: 'REVERSE light', color: 'amber' },
      },
    },
    {
      id: 'traffic',
      name: 'Traffic Light Intersection',
      blurb: 'A four-way intersection. North–South and East–West each have red, yellow and green. Two greens at once causes a crash.',
      inputs: {
        'I:0/0': { label: 'System ON switch', device: 'switch' },
        'I:0/1': { label: 'Pedestrian push button', device: 'pb-no' },
      },
      outputs: {
        'O:0/0': { label: 'N–S RED', color: 'red' },
        'O:0/1': { label: 'N–S YELLOW', color: 'amber' },
        'O:0/2': { label: 'N–S GREEN', color: 'green' },
        'O:0/3': { label: 'E–W RED', color: 'red' },
        'O:0/4': { label: 'E–W YELLOW', color: 'amber' },
        'O:0/5': { label: 'E–W GREEN', color: 'green' },
      },
    },
    {
      id: 'parking',
      name: 'Parking Garage Counter',
      blurb: 'A 10-space garage. Photo-eyes at the entrance and exit pulse once per car. Light the FULL sign when all spaces are taken.',
      inputs: {
        'I:0/0': { label: 'ENTRY photo-eye', device: 'sensor', note: 'Pulses 1 while a car passes in' },
        'I:0/1': { label: 'EXIT photo-eye', device: 'sensor', note: 'Pulses 1 while a car passes out' },
        'I:0/2': { label: 'RESET key switch', device: 'pb-no' },
      },
      outputs: {
        'O:0/0': { label: 'FULL sign', color: 'red' },
        'O:0/1': { label: 'SPACES AVAILABLE sign', color: 'green' },
        'O:0/2': { label: 'Entry gate', color: 'gate' },
      },
      params: { capacity: 10 },
    },
    {
      id: 'tank',
      name: 'Tank Fill & Mix',
      blurb: 'A mixing tank with a fill valve, drain valve, mixer and two float switches. Overfilling spills product.',
      inputs: {
        'I:0/0': { label: 'START push button', device: 'pb-no' },
        'I:0/1': { label: 'STOP push button', device: 'pb-nc' },
        'I:0/2': { label: 'LOW level switch', device: 'sensor', note: '1 when liquid is above the low mark (20%)' },
        'I:0/3': { label: 'HIGH level switch', device: 'sensor', note: '1 when liquid is at or above the high mark (80%)' },
      },
      outputs: {
        'O:0/0': { label: 'FILL valve', color: 'valve' },
        'O:0/1': { label: 'DRAIN valve', color: 'valve' },
        'O:0/2': { label: 'MIXER motor', color: 'motor' },
        'O:0/3': { label: 'TANK FULL light', color: 'amber' },
      },
      params: { fillSecondsEmptyToFull: 10, drainSecondsFullToEmpty: 8, low: 0.2, high: 0.8 },
    },
    {
      id: 'conveyor',
      name: 'Box Conveyor',
      blurb: 'A feeder drops boxes on a belt; a photo-eye at the end sees each box before it drops into a bin.',
      inputs: {
        'I:0/0': { label: 'START push button', device: 'pb-no' },
        'I:0/1': { label: 'STOP push button', device: 'pb-nc' },
        'I:0/2': { label: 'END photo-eye', device: 'sensor', note: '1 while a box blocks the beam at the end of the belt' },
        'I:0/3': { label: 'BOX PRESENT sensor (feeder)', device: 'sensor', note: '1 while a box sits under the feeder' },
      },
      outputs: {
        'O:0/0': { label: 'CONVEYOR motor', color: 'motor' },
        'O:0/1': { label: 'FEEDER (drops one box per pulse)', color: 'valve' },
        'O:0/2': { label: 'BATCH COMPLETE light', color: 'green' },
      },
    },
  ];

  PLC.getSceneDef = (id) => PLC.SCENE_DEFS.find((s) => s.id === id) || PLC.SCENE_DEFS[0];

  // Move a MicroLogix-1000-style I/O address to a profile's first I/O slot.
  PLC.remapIO = function (text, profile) {
    if (!profile) return text;
    const m = /^([IO]):0((?:\.\d+)?\/\d+|\.\d+)?$/i.exec(String(text).trim());
    if (!m) return text;
    const slots = profile.slots.filter((s) => (m[1].toUpperCase() === 'I' ? s.inputs : s.outputs) > 0);
    if (!slots.length || slots[0].slot === 0) return text;
    return `${m[1].toUpperCase()}:${slots[0].slot}${m[2] || ''}`;
  };
  // Remap every I/O address inside rung text / an object's keys.
  PLC.remapText = function (text, profile) {
    return String(text).replace(/\b([IO]):0((?:\.\d+)?\/\d+|\.\d+)?/gi, (t) => PLC.remapIO(t, profile));
  };
  PLC.remapKeys = function (obj, profile) {
    if (!obj) return obj;
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[PLC.remapIO(k, profile)] = v;
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
