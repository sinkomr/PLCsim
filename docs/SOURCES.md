# Sources and accuracy notes

## Primary references

These are the Rockwell Automation publications this simulator is modelled on. Check them when in doubt;
your course materials and instructor come first. Publications are available from the Rockwell Automation
Literature Library: https://literature.rockwellautomation.com

| Topic | Publication |
|---|---|
| SLC 500 and MicroLogix 1000 instruction set (older revisions cover the ML1000) | 1747-RM001 (formerly 1747-6.15) |
| MicroLogix 1000 user manual (I/O, addressing, specifications) | 1761-UM003 (formerly 1761-6.3) |
| MicroLogix 1100 instruction set | 1763-RM001 |
| MicroLogix 1200 / 1500 instruction set | 1762-RM001 |
| MicroLogix 1400 instruction set | 1766-RM001 |

The rung text format (`SOR … BST … NXB … BND … EOR`, e.g. `TON T4:0 1.0 5 0`) matches real RSLogix
500 rung exports.

## What is modelled

- **Scan cycle.** Inputs are copied to the input image once per scan. Rungs are solved top to bottom and left
  to right; data-table changes are seen by later rungs in the same scan. Outputs are written at the end of
  the scan. In Test (single-scan) mode, outputs stay off.
- **Data files.** O0, I1, S2, B3, T4, C5, R6, N7, plus F8 on controllers that have floating point.
  The MicroLogix 1000 file sizes are fixed at B3 = 32 words, T4 = 40, C5 = 32, R6 = 16 and N7 = 105.
- **Addressing.** Embedded I/O is in slot 0 (`I:0/0`); inputs 16–19 on 32-point units are `I:0.1/0`–`I:0.1/3`.
  SLC racks put cards in slot 1 and up (the default rack is slot 1 = 16 inputs, slot 2 = 16 outputs). Other
  supported forms: `B3/21` (bit-number form), `T4:0/DN` and `T4:0.ACC`.
- **Timers.** TON, TOF and RTO use EN (bit 15), TT (14) and DN (13), with PRE in word 1 and ACC in word 2.
  Time bases are 1.0 and 0.01 s (plus 0.001 s on ML1100/1200/1400/1500; 0.01 s only on the SLC 5/01). A negative
  PRE or ACC gives major fault 0034h.
- **Counters.** CTU and CTD count on false-to-true transitions. They use CU/CD/DN/OV/UN, and the ACC wraps at
  ±32767 with OV/UN set. RES clears the element.
- **Math.** Results are 16-bit signed. S:0 holds the flags C, V, Z and S. On overflow the result is clamped to
  32767 / -32768 and S:5/0 (overflow trap) is set. If S:5/0 is still set at the end of the scan, the
  processor faults with **0020h**. S:2/14 selects keeping the low 16 bits instead of clamping. Integer DIV
  rounds to the nearest whole number.
- **One-shots.** On the SLC and MicroLogix 1000, `OSR` is an input instruction with one storage bit. On the
  MicroLogix 1100/1200/1400/1500, `ONS` is the input one-shot and `OSR`/`OSF` are output instructions
  with a storage bit and an output bit.
- **Program control.** JMP/LBL (a backward-jump loop trips the watchdog fault 0022h), JSR/SBR/RET, MCR zones and TND.
- **Status.** S:1/15 first pass, S:4 free-running clock (10 ms per count), S:3 scan time, S:6 fault code, S:1/13 fault.

## Simplified or not modelled

- The scan time is a fixed 10 ms of simulated time. A real ML1000 scan is typically a few milliseconds and
  depends on program size. Timers use simulated time, so they behave the same at any playback speed.
- Not modelled: communications, MSG, PID, high-speed counters, interrupts (STI/DII), immediate I/O
  (IIM/IOM), ASCII/strings and indirect addressing.
- No `.RSS` file import. Use the text rung format to move logic back and forth.
- **Unconfirmed details**, where the Rockwell PDFs could not be checked directly:
  - the exact MicroLogix 1000 status-file length and the DIV-by-zero result (the simulator uses 32767);
  - whether the ML1000 supports S:2/14;
  - exactly what happens to data on entering RUN (the simulator does no prescan and sets S:1/15 for the first scan);
  - the ML1500 embedded I/O slot numbering.

  If your lab hardware behaves differently, trust the hardware and please open an issue.
