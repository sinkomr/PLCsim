/*
 * Learning side panel: lessons (reader + quizzes), challenges (brief, hints,
 * grading) and the instruction reference.
 */
(function (g) {
  'use strict';
  const PLC = (g.PLC = g.PLC || {});
  const esc = (s) => PLC.ladderEsc(s);
  const $ = (id) => document.getElementById(id);

  class Learn {
    constructor(app) {
      this.app = app;
      this.tab = 'lessons';
      this.view = null; // {type:'lesson'|'challenge'|'ref', id}
      this.hintsShown = {};
      $('sideTabs').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-tab]');
        if (b) { this.tab = b.dataset.tab; this.view = null; this.render(); }
      });
      $('btnWide').onclick = () => { $('layout').classList.toggle('side-wide'); this.app.editor.render(); this.render(); };
    }

    get lessons() { return PLC.LESSONS || []; }
    get challenges() { return PLC.CHALLENGES || []; }
    get progress() { return this.app.progress; }

    render() {
      document.querySelectorAll('#sideTabs button[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.tab));
      const body = $('sideBody');
      if (this.view && this.view.type === 'lesson') return this.renderLesson(body, this.view.id);
      if (this.view && this.view.type === 'challenge') return this.renderChallenge(body, this.view.id);
      if (this.view && this.view.type === 'ref') return this.renderRefCard(body, this.view.id);
      if (this.tab === 'lessons') return this.renderLessonList(body);
      if (this.tab === 'challenges') return this.renderChallengeList(body);
      return this.renderRefList(body);
    }

    open(view) {
      this.view = view;
      this.tab = { lesson: 'lessons', challenge: 'challenges', ref: 'reference' }[view.type];
      this.app.openSide();
      this.render();
      $('sideBody').scrollTop = 0;
    }
    openFirstLesson() { if (this.lessons[0]) this.open({ type: 'lesson', id: this.lessons[0].id }); }
    showReference(mn) { this.open({ type: 'ref', id: mn }); }

    // ---------------- lessons ----------------
    renderLessonList(body) {
      const done = this.lessons.filter((l) => this.progress.lessons[l.id]).length;
      let html = `<p class="prop-help" style="margin-top:4px">Start at lesson 1 if you've never programmed a PLC. Each lesson has examples you can load and run, a short quiz, and challenges to practise.</p>
        <div class="progress"><div style="width:${this.lessons.length ? (100 * done) / this.lessons.length : 0}%"></div></div>
        <div class="prop-help">${done} of ${this.lessons.length} lessons complete</div>`;
      let unit = null;
      this.lessons.forEach((l, i) => {
        if (l.unit !== unit) { unit = l.unit; html += `<div class="unit-title">${esc(unit)}</div>`; }
        const ok = this.progress.lessons[l.id];
        html += `<div class="list-item" data-l="${esc(l.id)}"><span class="num">${i + 1}</span><span class="t">${esc(l.title)}</span><span class="prop-help">${l.minutes || ''}${l.minutes ? ' min' : ''}</span><span class="check ${ok ? 'done' : ''}">${ok ? '✓' : ''}</span></div>`;
      });
      if (!this.lessons.length) html += '<p class="prop-help">Lessons are not loaded.</p>';
      body.innerHTML = html;
      body.querySelectorAll('[data-l]').forEach((el) => el.onclick = () => this.open({ type: 'lesson', id: el.dataset.l }));
    }

    renderLesson(body, id) {
      const i = this.lessons.findIndex((l) => l.id === id);
      const l = this.lessons[i];
      if (!l) { this.view = null; return this.render(); }
      const prev = this.lessons[i - 1], next = this.lessons[i + 1];
      const chs = (l.challenges || []).map((cid) => this.challenges.find((c) => c.id === cid)).filter(Boolean);
      body.innerHTML = `<div class="reader">
        <button class="backlink" id="lBack">← All lessons</button>
        <div class="meta" style="margin-top:8px">${esc(l.unit)} · Lesson ${i + 1}${l.minutes ? ` · ${l.minutes} min` : ''}</div>
        <h2>${esc(l.title)}</h2>
        <div id="lBody">${l.body}</div>
        ${(l.examples || []).length ? `<h3>Examples to try</h3>${l.examples.map((ex) => `<div style="margin:6px 0"><button class="try" data-example="${esc(ex.id)}">▶ Load example: ${esc(ex.title)}</button></div>`).join('')}` : ''}
        ${chs.length ? `<h3>Practice</h3>${chs.map((c) => `<div style="margin:6px 0"><button class="go-challenge" data-challenge="${esc(c.id)}">★ Challenge: ${esc(c.title)}</button> ${this.progress.challenges[c.id] ? '<span class="badge good">passed</span>' : ''}</div>`).join('')}` : ''}
        ${this.quizHTML(l)}
        <div class="row" style="margin-top:16px"><button class="btn small" id="lDone">${this.progress.lessons[l.id] ? '✓ Completed' : 'Mark lesson complete'}</button></div>
        <div class="reader-nav">
          ${prev ? `<button class="btn small" data-nav="${esc(prev.id)}">← ${esc(prev.title)}</button>` : '<span></span>'}
          ${next ? `<button class="btn small primary" data-nav="${esc(next.id)}">${esc(next.title)} →</button>` : ''}
        </div></div>`;
      this.enhance(body, l);
      $('lBack').onclick = () => { this.view = null; this.render(); };
      $('lDone').onclick = () => { this.app.markLesson(l.id, true); this.render(); };
      body.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => this.open({ type: 'lesson', id: b.dataset.nav }));
      this.bindQuiz(body, l);
    }

    // Draw ladder blocks and wire buttons inside lesson / reference HTML.
    enhance(root, lesson) {
      const prof = this.app.engine.profile;
      root.querySelectorAll('.ladder[data-rungs]').forEach((el) => {
        const rungs = el.dataset.rungs.split('|').map((s) => s.trim()).filter(Boolean).map((t) => PLC.remapText(t, prof));
        let desc = {};
        try { desc = el.dataset.desc ? PLC.remapKeys(JSON.parse(el.dataset.desc), prof) : {}; } catch (e) { /* ignore */ }
        const w = Math.max(460, Math.min(900, root.clientWidth - 30));
        PLC.staticLadder(el, rungs, prof, desc, { width: w });
      });
      root.querySelectorAll('button.try[data-example]').forEach((b) => b.onclick = () => {
        const ex = this.findExample(b.dataset.example);
        if (ex) this.app.loadExample(ex.ex, ex.lesson);
        else this.app.toast('Example not found');
      });
      root.querySelectorAll('button.go-challenge[data-challenge]').forEach((b) => b.onclick = () => this.open({ type: 'challenge', id: b.dataset.challenge }));
    }

    findExample(id) {
      for (const l of this.lessons) for (const ex of l.examples || []) if (ex.id === id) return { ex, lesson: l };
      return null;
    }

    quizHTML(l) {
      if (!l.quiz || !l.quiz.length) return '';
      return `<div class="quiz"><h3>Check your understanding</h3>${l.quiz.map((q, qi) => `<div class="qblock" data-q="${qi}"><div class="qq">${qi + 1}. ${q.q}</div>${q.choices.map((c, ci) => `<button class="ch" data-c="${ci}">${c}</button>`).join('')}<div class="why hidden"></div></div>`).join('')}</div>`;
    }
    bindQuiz(body, l) {
      const answered = new Set();
      body.querySelectorAll('.qblock').forEach((qb) => {
        const q = l.quiz[+qb.dataset.q];
        qb.querySelectorAll('.ch').forEach((b) => b.onclick = () => {
          const ci = +b.dataset.c;
          const right = ci === q.answer;
          b.classList.add(right ? 'right' : 'wrong');
          if (right) {
            qb.querySelectorAll('.ch').forEach((x) => { x.disabled = true; });
            answered.add(qb.dataset.q);
          }
          const why = qb.querySelector('.why');
          why.innerHTML = (right ? '✔ Correct. ' : '✘ Not quite — try again. ') + (right ? q.why || '' : '');
          why.classList.remove('hidden');
          if (answered.size === l.quiz.length) { this.app.markLesson(l.id, true); const d = $('lDone'); if (d) d.textContent = '✓ Completed'; }
        });
      });
    }

    // ---------------- challenges ----------------
    renderChallengeList(body) {
      const done = this.challenges.filter((c) => this.progress.challenges[c.id]).length;
      let html = `<p class="prop-help" style="margin-top:4px">Each challenge is a small job spec. Write the program, press <b>Run tests</b>, and the grader operates the machine to check it — like a lab check-off.</p>
        <div class="progress"><div style="width:${this.challenges.length ? (100 * done) / this.challenges.length : 0}%"></div></div>
        <div class="prop-help">${done} of ${this.challenges.length} passed</div>`;
      const levels = { 1: 'Level 1 — Basics', 2: 'Level 2 — Timers, counters & sequences', 3: 'Level 3 — Putting it together' };
      for (const lv of [1, 2, 3]) {
        const list = this.challenges.filter((c) => (c.level || 1) === lv);
        if (!list.length) continue;
        html += `<div class="unit-title">${levels[lv]}</div>`;
        html += list.map((c) => `<div class="list-item" data-c="${esc(c.id)}"><span class="t">${esc(c.title)}</span><span class="check ${this.progress.challenges[c.id] ? 'done' : ''}">${this.progress.challenges[c.id] ? '✓' : ''}</span></div>`).join('');
      }
      if (!this.challenges.length) html += '<p class="prop-help">Challenges are not loaded.</p>';
      body.innerHTML = html;
      body.querySelectorAll('[data-c]').forEach((el) => el.onclick = () => this.open({ type: 'challenge', id: el.dataset.c }));
    }

    renderChallenge(body, id) {
      const c = this.challenges.find((x) => x.id === id);
      if (!c) { this.view = null; return this.render(); }
      const app = this.app;
      const prof = app.engine.profile;
      const active = app.slot === 'ch:' + c.id;
      const lesson = this.lessons.find((l) => l.id === c.lesson);
      const hints = c.hints || [];
      const shown = this.hintsShown[c.id] || 0;
      const io = PLC.remapKeys(c.io || {}, prof);
      const last = app.lastGrade && app.lastGrade.id === c.id ? app.lastGrade.result : null;
      body.innerHTML = `<div class="reader">
        <button class="backlink" id="cBack">← All challenges</button>
        <div class="meta" style="margin-top:8px">Level ${c.level || 1}${lesson ? ` · goes with <a href="#" id="cLesson">${esc(lesson.title)}</a>` : ''} ${app.progress.challenges[c.id] ? '<span class="badge good">passed</span>' : ''}</div>
        <h2>${esc(c.title)}</h2>
        <div class="row" style="margin:10px 0">
          ${active ? `<button class="btn primary" id="cTest">▶ Run tests</button><button class="btn small" id="cReset">Start over…</button>` : `<button class="btn primary" id="cStart">Start this challenge</button>`}
        </div>
        ${active ? '' : '<p class="prop-help">Starting opens a separate workspace for this challenge (your free-play project is kept) and sets up the machine.</p>'}
        <div>${c.brief || ''}</div>
        <h3>I/O and addresses to use</h3>
        <table class="iotable">${Object.entries(io).map(([a, t]) => `<tr><td>${esc(a)}</td><td>${esc(t)}</td></tr>`).join('')}</table>
        ${c.scene && c.scene !== 'trainer' ? `<p class="prop-help">Machine: ${esc(PLC.getSceneDef(c.scene).name)} (right-hand panel).</p>` : ''}
        <div id="cResult">${last ? PLC.renderGradeHTML(last) : ''}</div>
        ${hints.length ? `<h3>Hints</h3>${hints.slice(0, shown).map((h, i) => `<div class="hint"><b>Hint ${i + 1}.</b> ${h}</div>`).join('')}${shown < hints.length ? `<button class="btn small" id="cHint">Show hint ${shown + 1} of ${hints.length}</button>` : ''}` : ''}
        <h3>Solution</h3>
        <div id="cSol"><button class="btn small" id="cShowSol">Show a possible solution</button></div>
      </div>`;
      $('cBack').onclick = () => { this.view = null; this.render(); };
      if ($('cLesson')) $('cLesson').onclick = (e) => { e.preventDefault(); this.open({ type: 'lesson', id: lesson.id }); };
      if ($('cStart')) $('cStart').onclick = () => { app.startChallenge(c); this.render(); };
      if ($('cReset')) $('cReset').onclick = () => { if (confirm('Throw away your work on this challenge and start again?')) { app.startChallenge(c, true); this.render(); } };
      if ($('cTest')) $('cTest').onclick = () => { app.runChallengeTests(c); this.render(); };
      if ($('cHint')) $('cHint').onclick = () => { this.hintsShown[c.id] = shown + 1; this.render(); };
      $('cShowSol').onclick = () => {
        if (!app.progress.challenges[c.id] && !confirm('Look at a solution? Try the hints first — you learn more by getting it working yourself.')) return;
        const host = $('cSol');
        const rungs = (c.solution || []).map((t) => PLC.remapText(t, prof));
        const subs = Object.entries(c.solutionSubs || {});
        host.innerHTML = `${subs.length ? '<h4>LAD 2 – MAIN</h4>' : ''}<div class="ladder" id="solMain"></div>${subs.map(([n]) => `<h4>LAD ${n}</h4><div class="ladder" data-sub="${n}"></div>`).join('')}<div class="row"><button class="btn small" id="cLoadSol">Load this solution into the editor</button></div><p class="prop-help">There is usually more than one correct answer — if yours passes the tests, it is right.</p>`;
        const w = Math.max(460, host.clientWidth - 20);
        PLC.staticLadder($('solMain'), rungs, prof, io, { width: w });
        subs.forEach(([n, list]) => PLC.staticLadder(host.querySelector(`[data-sub="${n}"]`), list.map((t) => PLC.remapText(t, prof)), prof, io, { width: w }));
        $('cLoadSol').onclick = () => {
          if (!confirm('Replace your challenge program with this solution?')) return;
          app.startChallenge(c, true, true);
          this.render();
        };
      };
    }

    // ---------------- reference ----------------
    renderRefList(body) {
      const prof = this.app.engine.profile;
      let html = `<p class="prop-help" style="margin-top:4px">Every instruction available on the <b>${esc(prof.short)}</b>. Click one for details and an example.</p>`;
      for (const grp of PLC.INSTR_GROUPS) {
        const list = Object.values(PLC.INSTR).filter((s) => s.group === grp && s.mn !== 'OSR_ML');
        const shown = list.filter((s) => PLC.allowed(s.mn, prof));
        if (!shown.length) continue;
        html += `<div class="unit-title">${esc(grp)}</div>`;
        html += shown.map((s) => {
          const sp = PLC.spec(s.mn, prof);
          return `<div class="list-item" data-r="${s.mn}"><code style="width:44px;font-weight:700">${s.mn}</code><span class="t">${esc(sp.name)}</span></div>`;
        }).join('');
      }
      body.innerHTML = html;
      body.querySelectorAll('[data-r]').forEach((el) => el.onclick = () => this.open({ type: 'ref', id: el.dataset.r }));
    }

    renderRefCard(body, mn) {
      const prof = this.app.engine.profile;
      const sp = PLC.spec(mn, prof);
      if (!sp) { this.view = null; return this.render(); }
      const ref = (PLC.REFERENCE || {})[mn] || {};
      const ops = sp.ops.map((o) => `<li><b>${esc(o[0])}</b> — ${esc({ bit: 'bit address', src: 'word address or number', dst: 'word address', tmr: 'timer element (T4:n)', ctr: 'counter element (C5:n)', ctl: 'control element (R6:n)', res: 'timer, counter or control element', tb: 'time base: ' + prof.timeBases.join(' or ') + ' s', pre: 'preset value', acc: 'accumulated value', len: 'length', pos: 'position', file: 'file address (#N7:0)', mask: 'mask (e.g. 0FFh)', lbl: 'label Q2:n', pf: 'program file U:n' }[o[1]] || o[1])}</li>`).join('');
      body.innerHTML = `<div class="reader ref-card">
        <button class="backlink" id="rBack">← All instructions</button>
        <h2 style="margin-top:8px"><code>${esc(mn)}</code> — ${esc(sp.name)}</h2>
        <div class="meta">${esc(sp.group)} · ${sp.kind === 'in' ? 'input (condition) instruction' : 'output instruction'}${PLC.allowed(mn, prof) ? '' : ' · <b>not available on ' + esc(prof.short) + '</b>'}</div>
        <p>${ref.summary || esc(sp.help)}</p>
        ${ops ? `<h4>Operands</h4><ul>${ops}</ul>` : ''}
        ${ref.details || ''}
        ${ref.avail ? `<div class="callout note">${esc(ref.avail)}</div>` : ''}
        ${ref.example && ref.example.length ? `<h4>Example${ref.exampleSubs ? ' — LAD 2 (MAIN)' : ''}</h4><div class="ladder" data-rungs="${esc(ref.example.join('|'))}"></div>` : ''}
        ${Object.entries(ref.exampleSubs || {}).map(([n, list]) => `<h4>LAD ${n}</h4><div class="ladder" data-rungs="${esc(list.join('|'))}"></div>`).join('')}
        ${ref.pitfalls && ref.pitfalls.length ? `<h4>Watch out for</h4><ul>${ref.pitfalls.map((p) => `<li>${p}</li>`).join('')}</ul>` : ''}
      </div>`;
      $('rBack').onclick = () => { this.view = null; this.tab = 'reference'; this.render(); };
      this.enhance(body);
    }
  }

  PLC.Learn = Learn;
})(typeof window !== 'undefined' ? window : globalThis);
