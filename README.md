# PLCsim — ladder logic trainer

A free, in-browser practice environment for **Allen-Bradley-style ladder logic** as programmed in
**RSLogix 500**, built for students in an introductory PLC course who don't have the software or a
trainer at home. The default controller is the **MicroLogix 1000**.

- **Lessons from zero**: what a PLC is, number systems, addressing, the scan cycle, contacts and
  coils, seal-in circuits, latches, one-shots, timers, counters, compare, math, subroutines,
  sequencers and troubleshooting. Each lesson has quizzes and examples you can load and run.
- **Ladder editor** in the RSLogix 500 style: instruction toolbar, branches, drag and drop, rung comments,
  address descriptions, and text rung editing (`XIC I:0/0 BST … NXB … BND OTE O:0/0`).
- **Scan-accurate simulator**: input scan → program scan → output scan; the real data files
  (O0 I1 S2 B3 T4 C5 R6 N7), timer/counter status bits, math flags, and major faults (for example 0020h
  math overflow). Features include Run / Program / single-scan Test, slow motion, forces, and live
  power-flow highlighting.
- **Animated machines** wired to the I/O: motor start/stop, forward/reverse, traffic light, parking
  garage, tank fill and mix, box conveyor, and a generic switch-and-light trainer.
- **Auto-graded challenges**: a written job spec plus automated tests that operate the machine and show a
  pass/fail report with a timing diagram.
- **Controller selector**: MicroLogix 1000 (10/16/20/32-point), 1100, 1200, 1400, 1500 and
  SLC 5/01–5/05. The profile changes the I/O addressing, data files, time bases and the instructions
  available.

No install, no build step, no server code. It is plain HTML, CSS and JavaScript, and it works offline once loaded.

## Use it

**Online:** once GitHub Pages is enabled (see below), open `https://<your-user>.github.io/<repo>/`.

**Locally:** download or clone the repo and double-click `index.html`. You can also serve the folder:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

Your work is saved automatically in the browser. Use **File → Save to file** to keep a copy.

## Publish on GitHub Pages

1. Push this repo to GitHub. It must be public for free Pages hosting.
2. On GitHub, go to **Settings → Pages**.
3. Under **Build and deployment**, set Source = **Deploy from a branch**, Branch = **main**,
   folder = **/ (root)**, then **Save**.
4. After a minute or two the site appears at `https://<your-user>.github.io/<repo>/`.

## Run the tests

The tests need Node.js 18 or newer:

```
node tests/run.js
node tests/content.js
```

- `tests/run.js` checks the engine: addressing, every instruction, the scan order, faults, forces and the grader.
- `tests/content.js` checks that every lesson example compiles, and that every challenge's reference
  solution passes its own tests while the starter program fails them.

## Project layout

```
index.html              app shell
css/app.css             layout and light/dark themes
js/core/                simulator (no DOM; also runs in Node)
  profiles.js           controller models
  datatable.js          data files and address parsing
  instructions.js       instruction set: operands and behaviour
  program.js            program model, text rung format, compiler
  engine.js             scan engine, modes, faults, forces
  grader.js             challenge test runner
  lint.js               Verify warnings
js/content/             lessons, challenges, instruction reference, scene I/O maps
js/scenes/              animated machines
js/ui/                  ladder renderer, editor, panels, learning pane, app
tests/                  Node tests and a scene preview page
docs/SOURCES.md         references and accuracy notes
```

## Accuracy and limits

PLCsim follows the instruction behaviour documented for RSLogix 500 and the SLC 500 / MicroLogix 1000
instruction set. See [docs/SOURCES.md](docs/SOURCES.md) for what is modelled, what is simplified, and
the manuals to check against. It is a learning tool:
- It does not talk to real PLCs.
- It does not open `.RSS` project files.
- It uses a fixed 10 ms simulated scan.

## Disclaimer

PLCsim is an independent educational project. It is not affiliated with or endorsed by Rockwell Automation.
Allen-Bradley, MicroLogix, SLC 500, RSLogix and Studio 5000 are trademarks of Rockwell Automation, Inc.
