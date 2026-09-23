/*
 * Parking Garage Counter scene.
 *   I:0/0 ENTRY photo-eye (sensor, pulses 1 while a car passes in)
 *   I:0/1 EXIT photo-eye  (sensor, pulses 1 while a car passes out)
 *   O:0/0 FULL sign (red), O:0/1 SPACES AVAILABLE sign (green), O:0/2 Entry gate (decoration)
 * Cars pass the eyes one at a time with ≥ 0.8 s between pulses, so every car
 * gives the PLC a clean rising edge.
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  PLC.registerScene('parking', function create(host, api) {
    const K = PLC.sceneKit, D = K.draw;
    const W = 480, H = 300;
    const st = K.stage(host, W, H);
    const say = K.messenger(api);
    const CAP = Math.max(1, (api.def && api.def.params && api.def.params.capacity) || 10);

    const L = 26, CW = 14;
    const GX0 = 150, GX1 = 470, GY0 = 12, GY1 = 222;   // garage walls
    const ENTRY_X = 176, EXIT_X = 206, EYE_Y = 240;     // lanes + photo-eye beams
    const ROAD_IN = 266, ROAD_OUT = 288;
    const AISLE_IN = 117, AISLE_OUT = 135;
    const V_ROAD = 110, V_LANE = 65, V_AISLE = 80, V_PARK = 40;
    const SPAWN_GAP = 1200, EXIT_GAP = 1300;
    const COLORS = ['#3b82f6', '#8b5cf6', '#0ea5e9', '#64748b', '#ec4899', '#14b8a6', '#e2e8f0', '#6366f1', '#a16207', '#f97316'];

    // parking spaces: two rows
    const perRow = Math.ceil(CAP / 2);
    const SX0 = 240, SX1 = 462, sw = (SX1 - SX0) / perRow;
    const spaces = [];
    for (let i = 0; i < CAP; i++) {
      const row = i < perRow ? 0 : 1, col = i % perRow;
      spaces.push({ x: SX0 + sw * (col + 0.5), y: row === 0 ? 60 : 184, row, car: null });
    }

    const entryEye = new K.Sensor(api, 'I:0/0', 0);
    const exitEye = new K.Sensor(api, 'I:0/1', 0);
    let cars, now, lastSpawn, lastExitLane, arrivals, leaves, gate, colorIdx, autoT, turnedAway, counted;

    st.button('Car arrives', () => { arrivals++; }, 'A car drives up to the entrance');
    st.button('Car leaves', () => {
      const parked = cars.filter((c) => c.kind === 'parked').length;
      if (parked - leaves <= 0) { say('No parked cars to leave.', 'info', 'noleave'); return; }
      leaves++;
    }, 'A parked car drives out');
    const auto = st.toggle('Auto', false, () => { autoT = { in: 800, out: 4000 }; }, 'Cars come and go at random');

    function init() {
      cars = []; now = 0; lastSpawn = -1e9; lastExitLane = -1e9; arrivals = 0; leaves = 0; gate = 0;
      colorIdx = 0; autoT = { in: 800, out: 4000 }; turnedAway = 0; counted = { in: 0, out: 0 };
      for (const s of spaces) s.car = null;
      entryEye.force(0); exitEye.force(0);
    }

    // A path is a list of points with a speed per segment (and optional reverse flag).
    function mkCar(kind, pts, speeds, rev) {
      const c = { kind, pts, speeds, rev: rev || [], seg: 0, t: 0, x: pts[0][0], y: pts[0][1], hx: 1, hy: 0, v: 0,
        color: COLORS[colorIdx++ % COLORS.length], inside: false, space: null, waited: false };
      heading(c);
      cars.push(c);
      return c;
    }
    function heading(c) {
      const a = c.pts[c.seg], b = c.pts[c.seg + 1];
      if (!b) return;
      const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
      const r = c.rev[c.seg] ? -1 : 1;
      c.mx = dx / n; c.my = dy / n;       // direction of motion
      c.hx = (r * dx) / n; c.hy = (r * dy) / n; // direction the car faces
    }

    function spawnArrival() {
      const used = spaces.filter((s) => s.car).length;
      if (used >= CAP) {
        mkCar('away', [[-20, ROAD_IN], [W + 40, ROAD_IN]], [V_ROAD]);
        turnedAway++;
        say('Garage is full — a car was turned away.', 'warn', 'full');
        return;
      }
      const free = spaces.filter((s) => !s.car);
      const sp = free[Math.floor(Math.random() * free.length)];
      const aisleY = AISLE_IN;
      const c = mkCar('in', [[-20, ROAD_IN], [ENTRY_X, ROAD_IN], [ENTRY_X, aisleY], [sp.x, aisleY], [sp.x, sp.y]],
        [V_ROAD, V_LANE, V_AISLE, V_PARK]);
      c.space = sp; sp.car = c;
    }

    function departOne() {
      const parked = cars.filter((c) => c.kind === 'parked');
      if (!parked.length) return false;
      const c = parked[Math.floor(Math.random() * parked.length)];
      const sp = c.space;
      c.kind = 'out';
      c.pts = [[sp.x, sp.y], [sp.x, AISLE_OUT], [EXIT_X, AISLE_OUT], [EXIT_X, ROAD_OUT], [W + 40, ROAD_OUT]];
      c.speeds = [V_PARK, V_AISLE, V_LANE, V_ROAD];
      c.rev = [true];
      c.seg = 0; c.t = 0;
      heading(c);
      return true;
    }

    // Is another car directly in front of c (in its direction of motion)?
    function blocked(c) {
      for (const o of cars) {
        if (o === c || o.kind === 'parked') continue;
        const rx = o.x - c.x, ry = o.y - c.y;
        const fwd = rx * c.mx + ry * c.my, lat = Math.abs(rx * c.my - ry * c.mx);
        if (fwd > 0 && fwd < L + 6 && lat < CW + 2) return true;
      }
      return false;
    }

    function step(h) {
      now += h;
      // auto traffic
      if (auto.value) {
        autoT.in -= h; autoT.out -= h;
        if (autoT.in <= 0) { if (arrivals < 3) arrivals++; autoT.in = 1500 + Math.random() * 5000; }
        if (autoT.out <= 0) {
          const parked = cars.filter((c) => c.kind === 'parked').length;
          if (parked - leaves > 0 && leaves < 2) leaves++;
          autoT.out = 2500 + Math.random() * 7000;
        }
      }
      if (arrivals > 0 && now - lastSpawn >= SPAWN_GAP) { arrivals--; lastSpawn = now; spawnArrival(); }
      if (leaves > 0) {
        const outgoing = cars.filter((c) => c.kind === 'out' && c.seg < 2).length;
        if (outgoing === 0) { if (!departOne()) leaves = 0; else leaves--; }
      }

      for (const c of cars) {
        if (c.kind === 'parked') continue;
        const a = c.pts[c.seg], b = c.pts[c.seg + 1];
        const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
        // hold at the top of the exit lane so exit-eye pulses stay separate
        if (c.kind === 'out' && c.seg === 2 && c.t === 0 && now - lastExitLane < EXIT_GAP) { c.v = 0; continue; }
        if (c.kind !== 'in' || c.seg >= 2) { if (blocked(c)) { c.v = 0; continue; } }
        if (c.kind === 'out' && c.seg === 2 && c.t === 0) lastExitLane = now;
        c.v = c.speeds[c.seg];
        c.t += c.v * (h / 1000);
        if (c.t >= segLen) {
          const extra = c.t - segLen;
          c.seg++;
          c.t = 0;
          if (c.seg >= c.pts.length - 1) {
            c.x = b[0]; c.y = b[1]; c.v = 0;
            if (c.kind === 'in') c.kind = 'parked';
            else c.kind = 'gone';
            continue;
          }
          heading(c);
          // carry the remainder into the next segment (except where a hold may apply)
          if (!(c.kind === 'out' && c.seg === 2)) c.t = Math.min(extra * c.speeds[c.seg] / c.speeds[c.seg - 1], 5);
        }
        const p = c.pts[c.seg];
        c.x = p[0] + c.mx * c.t; c.y = p[1] + c.my * c.t;
        // counting: crossing the beams
        if (c.kind === 'in' && !c.inside && c.x === ENTRY_X && c.y < EYE_Y) { c.inside = true; counted.in++; }
        if (c.kind === 'out' && c.inside && c.x === EXIT_X && c.y > EYE_Y) { c.inside = false; counted.out++; }
      }
      for (const c of cars) if (c.kind === 'gone' && c.space) { if (c.space.car === c) c.space.car = null; c.space = null; }
      cars = cars.filter((c) => c.kind !== 'gone');

      const beam = (x) => cars.some((c) => Math.abs(c.x - x) < CW && Math.abs(c.y - EYE_Y) < L / 2);
      entryEye.sense(beam(ENTRY_X));
      exitEye.sense(beam(EXIT_X));

      const target = api.out('O:0/2') ? 1 : 0;
      gate += Math.sign(target - gate) * Math.min(Math.abs(target - gate), h / 700);
    }

    // ---------- drawing ----------
    function drawCar(ctx, c) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(Math.atan2(c.hy, c.hx));
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      D.rr(ctx, -L / 2 + 1.5, -CW / 2 + 1.5, L, CW, 4); ctx.fill();
      ctx.fillStyle = c.color;
      D.rr(ctx, -L / 2, -CW / 2, L, CW, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = 'rgba(20,30,45,0.75)';
      D.rr(ctx, 2.5, -CW / 2 + 2, 5.5, CW - 4, 1.5); ctx.fill();
      D.rr(ctx, -10, -CW / 2 + 2.5, 4, CW - 5, 1.2); ctx.fill();
      ctx.restore();
    }

    function drawEye(ctx, C, x, blockedNow) {
      const x0 = x - 15, x1 = x + 15;
      ctx.save();
      ctx.strokeStyle = blockedNow ? C.red : K.alpha(C.on, 0.8);
      ctx.lineWidth = blockedNow ? 2.5 : 1.5;
      if (blockedNow) { ctx.shadowColor = C.red; ctx.shadowBlur = 8; }
      else ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x0, EYE_Y); ctx.lineTo(x1, EYE_Y); ctx.stroke();
      ctx.restore();
    }

    function sign(ctx, C, x, y, w, h, on, color, txt, addr, name) {
      D.tag(ctx, C, x, y - 9, addr, name, { bg: false });
      D.rr(ctx, x, y, w, h, 6);
      ctx.fillStyle = C.dark ? '#0b0e13' : '#20252d'; ctx.fill();
      if (on) {
        ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 14;
        D.rr(ctx, x + 4, y + 4, w - 8, h - 8, 4); ctx.fillStyle = K.alpha(color, 0.25); ctx.fill();
        ctx.restore();
      }
      D.text(ctx, txt, x + w / 2, y + h / 2 + 1, { size: 15, weight: 800, color: on ? color : K.mix(color, '#222', 0.75), align: 'center' });
    }

    function draw() {
      const C = st.begin(), ctx = st.ctx;
      const road = C.dark ? K.mix(C.bg, '#ffffff', 0.15) : K.mix(C.panel, '#000000', 0.2);
      const floor = C.dark ? K.mix(C.panel, '#ffffff', 0.04) : K.mix(C.panel, '#000000', 0.05);
      // road + driveway
      ctx.fillStyle = road;
      ctx.fillRect(0, 254, W, H - 254);
      ctx.fillRect(ENTRY_X - 16, GY1, EXIT_X - ENTRY_X + 32, 254 - GY1);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([12, 10]);
      ctx.beginPath(); ctx.moveTo(0, 277); ctx.lineTo(W, 277); ctx.stroke(); ctx.setLineDash([]);
      // garage floor + walls
      ctx.fillStyle = floor; ctx.fillRect(GX0, GY0, GX1 - GX0, GY1 - GY0);
      ctx.fillStyle = K.alpha(road, 0.55); ctx.fillRect(ENTRY_X - 16, AISLE_IN - 13, GX1 - ENTRY_X + 6, AISLE_OUT - AISLE_IN + 26);
      ctx.fillRect(ENTRY_X - 16, AISLE_IN - 13, EXIT_X - ENTRY_X + 32, GY1 - AISLE_IN + 13);
      ctx.strokeStyle = C.line; ctx.lineWidth = 4; ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(ENTRY_X - 16, GY1); ctx.lineTo(GX0, GY1); ctx.lineTo(GX0, GY0); ctx.lineTo(GX1, GY0); ctx.lineTo(GX1, GY1); ctx.lineTo(EXIT_X + 16, GY1);
      ctx.stroke(); ctx.lineCap = 'round';
      // lane arrows
      const laneInk = C.dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.4)';
      ctx.fillStyle = laneInk;
      const arrow = (x, y, dir) => { ctx.beginPath(); ctx.moveTo(x, y + dir * -6); ctx.lineTo(x - 4, y + dir * 2); ctx.lineTo(x + 4, y + dir * 2); ctx.closePath(); ctx.fill(); };
      arrow(ENTRY_X, 180, 1); arrow(EXIT_X, 180, -1);
      D.text(ctx, 'IN', ENTRY_X, 196, { size: 8, weight: 800, color: laneInk, align: 'center' });
      D.text(ctx, 'OUT', EXIT_X, 196, { size: 8, weight: 800, color: laneInk, align: 'center' });
      // spaces
      ctx.strokeStyle = C.dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5;
      for (let r = 0; r < 2; r++) {
        const y0 = r === 0 ? GY0 + 6 : AISLE_OUT + 16, y1 = r === 0 ? AISLE_IN - 16 : GY1 - 6;
        for (let i = 0; i <= perRow; i++) {
          const x = SX0 + sw * i;
          ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
        }
      }
      spaces.forEach((s, i) => D.text(ctx, String(i + 1), s.x, s.row === 0 ? GY0 + 16 : GY1 - 12, { size: 8, weight: 600, color: C.muted, align: 'center' }));

      // gate arm (drawn under cars): pivot left of the entry lane
      const gx = ENTRY_X - 17, gy = GY1 + 6;
      const ang = -gate * Math.PI * 0.45;
      ctx.save(); ctx.translate(gx, gy); ctx.rotate(ang);
      ctx.fillStyle = gate > 0.01 ? C.on : C.red;
      D.rr(ctx, 0, -2.5, 34, 5, 2.5); ctx.fill();
      ctx.fillStyle = '#fff';
      for (let k = 8; k < 32; k += 10) ctx.fillRect(k, -2.5, 4, 5);
      ctx.restore();
      ctx.fillStyle = C.metalDark; D.rr(ctx, gx - 5, gy - 5, 10, 10, 2); ctx.fill();

      for (const c of cars) drawCar(ctx, c);

      drawEye(ctx, C, ENTRY_X, entryEye.value);
      drawEye(ctx, C, EXIT_X, exitEye.value);
      // eye housings
      for (const x of [ENTRY_X - 17, ENTRY_X + 14, EXIT_X + 14]) { ctx.fillStyle = C.metalDark; D.rr(ctx, x, EYE_Y - 4, 4, 8, 1); ctx.fill(); }
      D.tag(ctx, C, ENTRY_X - 24, EYE_Y, 'I:0/0', 'ENTRY ' + entryEye.value, { align: 'right', color: entryEye.value ? C.red : C.fg });
      D.tag(ctx, C, EXIT_X + 24, EYE_Y, 'I:0/1', 'EXIT ' + exitEye.value, { align: 'left', color: exitEye.value ? C.red : C.fg });
      D.tag(ctx, C, ENTRY_X - 30, GY1 - 4, 'O:0/2', 'GATE', { align: 'right', color: api.out('O:0/2') ? C.on : C.fg });

      // signs + count
      sign(ctx, C, 12, 24, 128, 36, !!api.out('O:0/0'), C.red, 'FULL', 'O:0/0', 'FULL');
      sign(ctx, C, 12, 84, 128, 36, !!api.out('O:0/1'), C.on, 'SPACES', 'O:0/1', 'SPACES');
      const inside = cars.filter((c) => c.inside).length;
      D.rr(ctx, 12, 134, 128, 70, 6);
      ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = C.soft; ctx.lineWidth = 1; ctx.stroke();
      D.text(ctx, 'TRUE CAR COUNT', 76, 147, { size: 9, weight: 700, color: C.muted, align: 'center' });
      D.text(ctx, `${inside} / ${CAP}`, 76, 171, { size: 20, weight: 800, color: inside >= CAP ? C.red : C.fg, align: 'center' });
      const q = arrivals ? `${arrivals} waiting` : turnedAway ? `${turnedAway} turned away` : '';
      if (q) D.text(ctx, q, 76, 193, { size: 10, weight: 600, color: C.muted, align: 'center' });
      if (!api.running()) D.text(ctx, 'PLC not in RUN', 12, 12, { size: 9, weight: 600, color: C.muted });
    }

    init();
    return {
      update(dtMs) {
        K.substep(dtMs, 10, step);
        entryEye.flush(); exitEye.flush();
        draw();
      },
      reset() { init(); draw(); },
      destroy() { st.destroy(); },
      debug: () => ({ inside: cars.filter((c) => c.inside).length, counted: Object.assign({}, counted), turnedAway, cars: cars.length }),
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
