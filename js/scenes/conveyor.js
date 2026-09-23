/*
 * Box Conveyor scene.
 *   O:0/0 CONVEYOR motor, O:0/1 FEEDER (one box per false→true transition), O:0/2 BATCH COMPLETE light (green)
 *   I:0/2 END photo-eye (sensor: 1 while a box blocks the beam near the end)
 *   I:0/3 BOX PRESENT   (sensor: 1 while a box sits under the feeder)
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  PLC.registerScene('conveyor', function create(host, api) {
    const K = PLC.sceneKit, D = K.draw;
    const W = 480, H = 290;
    const st = K.stage(host, W, H);
    const say = K.messenger(api);

    const BELT_Y = 184, X0 = 40, X1 = 396, RR = 12;  // belt top surface, tail/head roller centres
    const FEED_X = 84, EYE_X = 350, BW = 30, BH = 26;
    const SPEED = 53;          // px/s  (≈ 0.25 m/s at 210 px/m → ~6 s feeder to end)
    const GRAV = 900;
    const BIN = { x0: 398, x1: 470, y0: 214, y1: 276 };
    const FLOOR = 278;

    const endEye = new K.Sensor(api, 'I:0/2', 0);
    const present = new K.Sensor(api, 'I:0/3', 0);
    let boxes, bin, beltPos, prevFeed, feedAnim, hue;

    st.button('Add box', () => drop(true), 'Drop one box under the feeder by hand');
    st.button('Empty bin', () => { bin = 0; }, 'Empty the collection bin');

    function init() {
      boxes = []; bin = 0; beltPos = 0; feedAnim = 0; hue = 0;
      prevFeed = !!api.out('O:0/1');
      endEye.force(0); present.force(0);
    }

    function drop(manual) {
      const busy = boxes.some((b) => b.state !== 'fall' && Math.abs(b.x - FEED_X) < BW + 2);
      if (busy) {
        say(manual ? 'There is already a box under the feeder.' : 'Feeder pulsed but a box is still under it — no box dropped.', 'info', 'feedbusy');
        return false;
      }
      boxes.push({ state: 'drop', x: FEED_X, y: 118, vy: 0, vx: 0, rot: 0, shade: hue++ % 4 });
      feedAnim = 250;
      return true;
    }

    function step(h) {
      const s = h / 1000;
      const run = !!api.out('O:0/0');
      const v = run ? SPEED : 0;
      beltPos += v * s;
      if (feedAnim > 0) feedAnim -= h;
      const restY = BELT_Y - BH / 2;
      for (const b of boxes) {
        if (b.state === 'drop') {
          b.vy += GRAV * s; b.y += b.vy * s;
          if (b.y >= restY) { b.y = restY; b.vy = 0; b.state = 'belt'; }
        } else if (b.state === 'belt') {
          b.x += v * s;
          if (b.x > X1 + 2) { b.state = 'fall'; b.vx = Math.max(v, 20); b.vy = 0; }
        } else if (b.state === 'fall') {
          b.vy += GRAV * s; b.x += b.vx * s; b.y += b.vy * s;
          b.rot += s * 3;
          const stackTop = BIN.y1 - Math.min(2, Math.floor(bin / 4)) * 8 - BH / 2;
          if (b.x > BIN.x1 - BW / 2) b.x = BIN.x1 - BW / 2;
          if (b.y >= stackTop) { b.state = 'done'; bin++; }
        }
      }
      boxes = boxes.filter((b) => b.state !== 'done');
      present.sense(boxes.some((b) => b.state === 'belt' && Math.abs(b.x - FEED_X) < BW / 2));
      endEye.sense(boxes.some((b) => b.state === 'belt' && Math.abs(b.x - EYE_X) < BW / 2));
    }

    function drawBox(ctx, C, b) {
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.rot || 0);
      const base = ['#c8894b', '#b97a3f', '#d19a5c', '#bf8447'][b.shade || 0];
      ctx.fillStyle = base;
      D.rr(ctx, -BW / 2, -BH / 2, BW, BH, 2); ctx.fill();
      ctx.strokeStyle = 'rgba(60,35,10,0.55)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = 'rgba(255,235,200,0.55)'; ctx.fillRect(-3, -BH / 2, 6, BH); // tape
      ctx.restore();
    }

    function draw() {
      const C = st.begin(), ctx = st.ctx;
      const run = !!api.out('O:0/0'), feed = !!api.out('O:0/1'), batch = !!api.out('O:0/2');
      ctx.fillStyle = C.ground; ctx.fillRect(0, FLOOR, W, H - FLOOR);
      ctx.strokeStyle = C.soft; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, FLOOR + 0.5); ctx.lineTo(W, FLOOR + 0.5); ctx.stroke();

      // frame legs
      ctx.fillStyle = C.metalDark;
      for (const x of [X0 + 30, (X0 + X1) / 2, X1 - 30]) ctx.fillRect(x - 3, BELT_Y + 20, 6, FLOOR - BELT_Y - 20);

      // belt
      D.rr(ctx, X0 - RR, BELT_Y, X1 - X0 + 2 * RR, 2 * RR, RR);
      ctx.fillStyle = C.dark ? '#323a46' : '#3a414c'; ctx.fill();
      ctx.strokeStyle = C.dark ? '#56606e' : '#262b33'; ctx.lineWidth = 1; ctx.stroke();
      ctx.save();
      D.rr(ctx, X0 - RR, BELT_Y, X1 - X0 + 2 * RR, 2 * RR, RR); ctx.clip();
      ctx.strokeStyle = C.dark ? '#5b6573' : '#59616d'; ctx.lineWidth = 2;
      const off = beltPos % 20;
      for (let x = X0 - 40 + off; x < X1 + 30; x += 20) { ctx.beginPath(); ctx.moveTo(x, BELT_Y + 1); ctx.lineTo(x - 4, BELT_Y + 5); ctx.stroke(); }
      ctx.restore();
      // rollers
      for (const x of [X0, X1]) {
        ctx.beginPath(); ctx.arc(x, BELT_Y + RR, RR - 4, 0, Math.PI * 2);
        ctx.fillStyle = C.metal; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
        ctx.save(); ctx.translate(x, BELT_Y + RR); ctx.rotate(beltPos / (RR - 4));
        ctx.strokeStyle = C.line; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-(RR - 6), 0); ctx.lineTo(RR - 6, 0); ctx.moveTo(0, -(RR - 6)); ctx.lineTo(0, RR - 6); ctx.stroke();
        ctx.restore();
      }
      // drive motor at the head end (below the belt)
      const mX = X1 - 58, mY = BELT_Y + 32;
      ctx.strokeStyle = C.metalDark; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(mX + 18, mY + 9); ctx.lineTo(X1, BELT_Y + RR); ctx.stroke();
      D.rr(ctx, mX - 18, mY, 36, 20, 4);
      ctx.fillStyle = C.metal; ctx.fill(); ctx.strokeStyle = run ? C.on : C.line; ctx.lineWidth = run ? 2.5 : 1.5; ctx.stroke();
      if (run) { ctx.save(); ctx.shadowColor = C.on; ctx.shadowBlur = 10; ctx.stroke(); ctx.restore(); }
      D.text(ctx, 'M', mX, mY + 10.5, { size: 11, weight: 800, color: run ? C.on : C.muted, align: 'center' });
      D.tag(ctx, C, mX - 24, mY + 10, 'O:0/0', 'CONVEYOR', { align: 'right', color: run ? C.on : C.fg });
      if (run) {
        // direction arrow under the belt
        ctx.fillStyle = K.alpha(C.on, 0.9);
        const ax = (X0 + X1) / 2 - 40;
        ctx.beginPath(); ctx.moveTo(ax + 16, BELT_Y + RR); ctx.lineTo(ax + 6, BELT_Y + RR - 5); ctx.lineTo(ax + 6, BELT_Y + RR + 5); ctx.closePath(); ctx.fill();
      }

      // bin
      ctx.fillStyle = C.dark ? K.mix(C.panel, '#fff', 0.06) : K.mix(C.panel, '#000', 0.06);
      ctx.fillRect(BIN.x0, BIN.y0, BIN.x1 - BIN.x0, BIN.y1 - BIN.y0);
      const shown = Math.min(bin, 12);
      for (let i = 0; i < shown; i++) {
        const col = i % 4, row = Math.floor(i / 4);
        ctx.fillStyle = ['#c8894b', '#b97a3f', '#d19a5c', '#bf8447'][i % 4];
        D.rr(ctx, BIN.x0 + 4 + col * 16, BIN.y1 - 10 - row * 8, 14, 9, 1.5); ctx.fill();
      }
      ctx.strokeStyle = C.line; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(BIN.x0, BIN.y0); ctx.lineTo(BIN.x0, BIN.y1); ctx.lineTo(BIN.x1, BIN.y1); ctx.lineTo(BIN.x1, BIN.y0); ctx.stroke();
      D.text(ctx, 'BIN ' + bin, (BIN.x0 + BIN.x1) / 2, BIN.y0 + 14, { size: 12, weight: 800, color: C.fg, align: 'center' });

      // boxes
      for (const b of boxes) drawBox(ctx, C, b);

      // feeder hopper + chute
      const hx = FEED_X, open = feed || feedAnim > 0;
      ctx.beginPath();
      ctx.moveTo(hx - 40, 42); ctx.lineTo(hx + 40, 42); ctx.lineTo(hx + 20, 88); ctx.lineTo(hx - 20, 88); ctx.closePath();
      ctx.fillStyle = C.metal; ctx.fill(); ctx.strokeStyle = feed ? C.on : C.line; ctx.lineWidth = feed ? 2.5 : 1.5; ctx.stroke();
      // boxes waiting in the hopper
      for (let i = 0; i < 3; i++) { ctx.fillStyle = '#c8894b'; D.rr(ctx, hx - 30 + i * 21, 48, 18, 14, 1.5); ctx.fill(); }
      ctx.fillStyle = C.metalDark;
      ctx.fillRect(hx - 20, 88, 4, 18); ctx.fillRect(hx + 16, 88, 4, 18);
      // flap
      ctx.strokeStyle = open ? C.on : C.line; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(hx - 18, 106); ctx.lineTo(open ? hx - 12 : hx + 18, open ? 124 : 106); ctx.stroke();
      D.tag(ctx, C, hx, 24, 'O:0/1', 'FEEDER', { align: 'center', color: feed ? C.on : C.fg });

      // BOX PRESENT sensor: diffuse sensor hung from the chute leg, looking down at the drop spot
      const pv = present.value;
      ctx.fillStyle = C.metalDark;
      ctx.fillRect(hx + 16, 106, 4, 30);
      D.rr(ctx, hx + 16, 134, 16, 10, 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + 25, 139, 2.5, 0, Math.PI * 2); ctx.fillStyle = pv ? C.amber : C.soft; ctx.fill();
      ctx.save();
      ctx.strokeStyle = pv ? C.amber : K.alpha(C.muted, 0.8); ctx.lineWidth = pv ? 2.5 : 1.2;
      if (!pv) ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(hx + 20, 145); ctx.lineTo(hx + 8, pv ? BELT_Y - BH : BELT_Y - 1); ctx.stroke();
      ctx.restore();
      D.tag(ctx, C, hx + 38, 139, 'I:0/3', 'BOX PRESENT ' + pv, { color: pv ? C.amber : C.fg });

      // END photo-eye: head above the belt, beam to a reflector at belt level
      const ev = endEye.value;
      ctx.fillStyle = C.metalDark;
      ctx.fillRect(EYE_X + 22, 96, 4, BELT_Y - 96);          // post
      ctx.fillRect(EYE_X, 96, 26, 4);                        // arm
      D.rr(ctx, EYE_X - 8, 100, 16, 14, 3); ctx.fill();       // sensor head
      ctx.save();
      ctx.strokeStyle = ev ? C.red : K.alpha(C.on, 0.85); ctx.lineWidth = ev ? 3 : 1.5;
      if (ev) { ctx.shadowColor = C.red; ctx.shadowBlur = 8; } else ctx.setLineDash([3, 3]);
      const blockY = ev ? BELT_Y - BH : BELT_Y - 1;
      ctx.beginPath(); ctx.moveTo(EYE_X, 114); ctx.lineTo(EYE_X, blockY); ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(EYE_X, 107, 3, 0, Math.PI * 2); ctx.fillStyle = ev ? C.red : C.on; ctx.fill();
      D.tag(ctx, C, EYE_X + 2, 84, 'I:0/2', 'END EYE ' + ev, { align: 'center', color: ev ? C.red : C.fg });

      // batch complete light
      D.lamp(ctx, C, 440, 44, 11, batch, C.on);
      D.text(ctx, 'O:0/2', 440, 70, { size: 10, weight: 700, color: C.accent, align: 'center' });
      D.text(ctx, 'BATCH', 440, 83, { size: 9, weight: 600, color: C.fg, align: 'center' });
      D.text(ctx, 'COMPLETE', 440, 94, { size: 9, weight: 600, color: C.fg, align: 'center' });

      const onBelt = boxes.filter((b) => b.state === 'belt').length;
      D.text(ctx, `On belt ${onBelt}`, 96, FLOOR - 12, { size: 11, weight: 600, color: C.muted });
      if (!api.running()) D.text(ctx, 'PLC not in RUN', 190, 40, { size: 10, weight: 600, color: C.muted });
    }

    init();
    return {
      update(dtMs) {
        const feed = !!api.out('O:0/1');
        if (feed && !prevFeed) drop(false);
        prevFeed = feed;
        K.substep(dtMs, 10, step);
        endEye.flush(); present.flush();
        draw();
      },
      reset() { init(); draw(); },
      destroy() { st.destroy(); },
      debug: () => ({ bin, boxes: boxes.length }),
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
