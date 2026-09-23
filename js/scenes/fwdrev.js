/*
 * Forward/Reverse Motor scene.
 *   O:0/0 FORWARD contactor, O:0/1 REVERSE contactor, O:0/2 FORWARD light (green), O:0/3 REVERSE light (amber)
 *   I:0/3 overload relay contact (sensor, NC: 1 when healthy)
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});

  PLC.registerScene('fwdrev', function create(host, api) {
    const K = PLC.sceneKit, D = K.draw;
    const W = 480, H = 300;
    const st = K.stage(host, W, H);
    const say = K.messenger(api);

    const ol = new K.Sensor(api, 'I:0/3', 1);
    let speed = 0, angle = 0, tripped = false, shortMs = 0, tripWarnMs = 0, flashT = 0;

    const btnTrip = st.button('Trip overload', () => {
      if (tripped) return;
      tripped = true; ol.force(0);
      say('Overload tripped. I:0/3 is now 0.', 'warn', 'trip');
    }, 'Open the overload relay contact (I:0/3 → 0)');
    st.button('Reset overload', () => {
      tripped = false; tripWarnMs = 0; ol.force(1);
      say('Overload reset — I:0/3 is closed again.', 'info', 'olreset');
    }, 'Close the overload contact again (I:0/3 → 1)');

    function step(h) {
      const f = !!api.out('O:0/0'), r = !!api.out('O:0/1');
      const s = h / 1000;
      if (f && r) {
        shortMs = 1600;
        say('SHORT CIRCUIT — both contactors closed! Interlock FORWARD and REVERSE so they can never be on together.', 'bad', 'short');
      }
      if (shortMs > 0) shortMs = Math.max(0, shortMs - h);
      flashT += h;
      const target = f && !r ? 1 : r && !f ? -1 : 0;
      if (target === 0) {
        // coasting (or the breaker has dropped out on a short)
        speed *= Math.exp(-s / (f && r ? 0.5 : 2.4));
        if (Math.abs(speed) < 0.002) speed = 0;
      } else {
        // driven: plugging decelerates fast, then accelerates the other way
        const rate = Math.sign(target) !== Math.sign(speed) && speed !== 0 ? 1.1 : 0.8;
        const dv = target - speed;
        speed += Math.sign(dv) * Math.min(Math.abs(dv), rate * s);
      }
      angle += speed * Math.PI * 2 * 1.4 * s;
      if ((f || r) && tripped) {
        tripWarnMs += h;
        if (tripWarnMs > 1000) say('The overload is tripped but a contactor is still on — your program should drop the motor out.', 'bad', 'stillon');
      } else tripWarnMs = 0;
      ol.sense(tripped ? 0 : 1);
    }

    function arrowArc(ctx, x, y, r, dir, color) {
      // curved arrow around the motor; dir 1 = clockwise
      ctx.save();
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 4;
      const a0 = -Math.PI * 0.85, a1 = -Math.PI * 0.15;
      ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke();
      const end = dir > 0 ? a1 : a0;
      const ex = x + Math.cos(end) * r, ey = y + Math.sin(end) * r;
      const tan = end + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      ctx.translate(ex, ey); ctx.rotate(tan);
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -7); ctx.lineTo(-5, 7); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    function draw() {
      const C = st.begin(), ctx = st.ctx;
      const f = !!api.out('O:0/0'), r = !!api.out('O:0/1');
      const shorting = shortMs > 0;
      ctx.fillStyle = C.ground; ctx.fillRect(0, 222, W, 78);
      ctx.strokeStyle = C.soft; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 222.5); ctx.lineTo(W, 222.5); ctx.stroke();

      const mx = 108, my = 130, mr = 58;
      if (Math.abs(speed) > 0.02) {
        const col = speed > 0 ? C.on : C.amber;
        arrowArc(ctx, mx, my, mr + 22, Math.sign(speed), K.alpha(col, 0.35 + 0.65 * Math.min(1, Math.abs(speed))));
      }
      D.motor(ctx, C, mx, my, mr, angle, f || r, { bladeColor: speed < -0.01 ? C.amber : C.accent });
      D.text(ctx, 'M2', mx, my + mr + 30, { size: 11, weight: 700, color: C.muted, align: 'center' });
      const dirTxt = Math.abs(speed) < 0.02 ? 'STOPPED' : speed > 0 ? 'CLOCKWISE (FWD)' : 'COUNTER-CLOCKWISE (REV)';
      D.text(ctx, dirTxt, mx, 22, { size: 11, weight: 700, color: Math.abs(speed) < 0.02 ? C.muted : speed > 0 ? C.on : C.amber, align: 'center' });

      // speed gauge
      const gx = 272, gy = 146, gr = 58;
      ctx.lineWidth = 10; ctx.lineCap = 'butt';
      ctx.strokeStyle = K.alpha(C.amber, 0.35);
      ctx.beginPath(); ctx.arc(gx, gy, gr, Math.PI, Math.PI * 1.5); ctx.stroke();
      ctx.strokeStyle = K.alpha(C.on, 0.35);
      ctx.beginPath(); ctx.arc(gx, gy, gr, Math.PI * 1.5, Math.PI * 2); ctx.stroke();
      ctx.lineCap = 'round';
      ctx.strokeStyle = C.line; ctx.lineWidth = 1.5;
      for (let i = -4; i <= 4; i++) {
        const a = Math.PI * 1.5 + (i / 4) * (Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(gx + Math.cos(a) * (gr - 12), gy + Math.sin(a) * (gr - 12));
        ctx.lineTo(gx + Math.cos(a) * (gr - (i % 2 ? 16 : 20)), gy + Math.sin(a) * (gr - (i % 2 ? 16 : 20)));
        ctx.stroke();
      }
      const na = Math.PI * 1.5 + speed * (Math.PI / 2);
      ctx.strokeStyle = C.fg; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(na) * (gr - 8), gy + Math.sin(na) * (gr - 8)); ctx.stroke();
      ctx.beginPath(); ctx.arc(gx, gy, 5, 0, Math.PI * 2); ctx.fillStyle = C.fg; ctx.fill();
      D.text(ctx, 'REV', gx - gr - 2, gy + 14, { size: 10, weight: 700, color: C.amber, align: 'center' });
      D.text(ctx, 'FWD', gx + gr + 2, gy + 14, { size: 10, weight: 700, color: C.on, align: 'center' });
      D.text(ctx, '0', gx, gy - gr - 12, { size: 10, weight: 600, color: C.muted, align: 'center' });
      D.text(ctx, (speed < -0.001 ? '−' : '') + Math.round(Math.abs(speed) * 1750) + ' rpm', gx, gy + 26, { size: 13, weight: 700, color: C.fg, align: 'center' });

      // contactors + overload
      const box = (x, w, title, addr, state, color, active) => {
        D.rr(ctx, x, 236, w, 50, 6);
        ctx.fillStyle = active ? K.alpha(color, 0.16) : C.panel; ctx.fill();
        ctx.strokeStyle = active ? color : C.soft; ctx.lineWidth = active ? 2 : 1; ctx.stroke();
        D.tag(ctx, C, x + 8, 250, addr, title, { bg: false });
        D.text(ctx, state, x + 8, 271, { size: 12, weight: 700, color: active ? color : C.muted });
      };
      box(10, 106, 'FWD K1', 'O:0/0', f ? 'CLOSED' : 'OPEN', shorting ? C.red : C.on, f || shorting);
      box(122, 106, 'REV K2', 'O:0/1', r ? 'CLOSED' : 'OPEN', shorting ? C.red : C.amber, r || shorting);
      box(234, 110, 'OL', 'I:0/3', tripped ? 'TRIPPED · 0' : 'OK · 1', tripped ? C.red : C.on, true);

      // pilot lights
      D.rr(ctx, 350, 14, 120, 272, 8);
      ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = C.soft; ctx.lineWidth = 1; ctx.stroke();
      D.text(ctx, 'PILOT LIGHTS', 410, 32, { size: 10, weight: 700, color: C.muted, align: 'center' });
      [['O:0/2', 'FORWARD', C.on], ['O:0/3', 'REVERSE', C.amber]].forEach(([addr, name, col], i) => {
        const y = 80 + i * 80;
        D.lamp(ctx, C, 372, y, 12, !!api.out(addr), col);
        D.text(ctx, addr, 390, y - 7, { size: 10, weight: 700, color: C.accent });
        D.text(ctx, name, 390, y + 8, { size: 10.5, weight: 600, color: C.fg });
      });
      if (!api.running()) D.text(ctx, 'PLC not in RUN', 364, 272, { size: 10, weight: 600, color: C.muted });

      if (shorting) {
        const blink = Math.floor(flashT / 160) % 2 === 0;
        ctx.fillStyle = K.alpha(C.red, blink ? 0.22 : 0.1);
        ctx.fillRect(0, 0, W, H);
        D.rr(ctx, 40, 104, 400, 52, 8);
        ctx.fillStyle = C.red; ctx.fill();
        // lightning bolt
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(70, 112); ctx.lineTo(58, 133); ctx.lineTo(67, 133); ctx.lineTo(61, 150); ctx.lineTo(78, 126); ctx.lineTo(69, 126); ctx.lineTo(76, 112);
        ctx.closePath(); ctx.fill();
        D.text(ctx, 'SHORT CIRCUIT', 250, 121, { size: 16, weight: 800, color: '#fff', align: 'center' });
        D.text(ctx, 'both contactors closed!', 250, 141, { size: 12, weight: 600, color: '#fff', align: 'center' });
      }
    }

    return {
      update(dtMs) {
        K.substep(dtMs, 10, step);
        ol.flush();
        btnTrip.disabled = tripped;
        draw();
      },
      reset() {
        speed = 0; angle = 0; tripped = false; shortMs = 0; tripWarnMs = 0;
        ol.force(1);
        draw();
      },
      destroy() { st.destroy(); },
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
