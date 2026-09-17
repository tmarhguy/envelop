# Chat reliability and native ALU rebuild

The reviewed live conversation contained status-1 execution failures for ANDADD,
ORADD, XORADD, ANDN and ORN, alongside successful MASKADD/XORAND jobs. The browser
compiler supported all seven, but the bundled OS image did not. Compiler-only
tests therefore passed while actual execution failed.

The replacement image is generated from Tomato's `tools/build_web_image.py`
using its OS assembly and burned microcode. Embedded build ID:
`6933ecdeb9abb996` (previously `84472ff3ad9e0d14`). The emulator implementation
matches the sibling Tomato checkout apart from provenance comments.

## Interaction contract

- Empty draft: an example runs immediately. Existing draft: arithmetic examples
  insert their parsed expression at the cursor, preserving the rest of the draft.
  Help and reviewed questions open their answers without overwriting the draft.
- Suggestions stop rotating on a timer. Their labels indicate run versus insert.
- Execution mode is a persistent Virtual / Physical control. Virtual is the
  default offline-stable path; Physical always targets the durable hardware
  queue, including when Tomato is offline (composer shows Queue). Mode is stored
  in `localStorage` key `envelop.execution-mode.v1`.
- Virtual-mode greetings reply immediately through the labeled deterministic
  Virtual Tomato first-name rule. Physical-mode greetings reach the real machine
  when online and still mark the progressive Tomato reply wait.
- Virtual mode turns unmatched plain chat into a local unanswered-guidance card
  with Edit / examples actions. Short conversational acknowledgements
  (“what’s up”, “okay”, “I’m confused”) use reviewed local reply rules in
  `experience.mjs` — no generated text.
- Ordinary Physical-mode messages remain hardware notes. Each saved note states
  that it entered the hardware queue and that an automatic reply is not
  guaranteed. This is not a delivery acknowledgement. Calculations and help
  remain the immediate routes.
- The last 100 local results are retained in tab session storage, separately for
  each profile. Reloaded in-flight hardware jobs remain unknown, never replayed;
  interrupted virtual jobs require a fresh submission.
- Lost hardware polling stops after three consecutive errors with an unknown
  outcome and a read-only check-result action when the backend job ID is known.
  Ambiguous enqueue outcomes still block virtual replay. A completed rejection
  or terminal failed/cancelled job may offer an explicit virtual execution.
  Queued physical jobs expose an explicit cancel action when the backend ID is
  known.

## ALU contract

The ALU computes `f(A,B,C) + g(A,B,C) + cin` modulo 2^32. Execution details show
both LUT functions, their truth tables, carry input and operand-register mapping.
`(A & B) + C`, `(A | B) + C`, `(A ^ B) + C`, `A + (B & C)`, `A & ~B`, and
`A | ~B` fuse into installed native instructions. Operand loads and RETURN remain
separate bytecode instructions. This does not expose arbitrary LUT programming
through the bounded remote ABI. XORAND is `(A ^ B ^ C) + (A & B & C)`.

## Verification

Run from the Envelop repository root:

```
node --test website/chat/*.test.cjs website/chat/*.test.mjs website/chat/virtual/*.test.mjs
node backend/tests.mjs
python3 tools/check_docs.py
node tools/testing/preview.mjs
```

The local preview at http://127.0.0.1:8765/chat/ mocks authentication, message
storage and offline presence; computation uses the actual browser worker, CPU,
radio frames and shipped OS image. It creates no production accounts or jobs.
The execution tests also run every compilable help/suggestion example, directed
32-bit boundary vectors for all composed operations, and a firmware greeting.
Shared compiler fixtures are checked in unfused compatibility mode; dedicated
fusion tests and real CPU execution cover the optimized browser path.

Physical hardware was offline during this work. These tests do not establish the
firmware revision on the user's FPGA. Bring the bridge online with matching OS
firmware, then verify a greeting, ADD and ORADD before claiming physical acceptance.
No backend migration is needed, and the destructive reset must not be used for
this update. Website changes must still be deployed before the public URL changes.
