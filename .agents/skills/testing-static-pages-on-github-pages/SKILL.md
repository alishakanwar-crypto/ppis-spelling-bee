---
name: testing-static-pages-on-github-pages
description: How to test a self-contained single-file HTML artifact (e.g. spelling-bee.html) published from this repo via GitHub Pages — waiting for publish, verifying served bytes, driving the Spelling Bee quiz/teacher flows in Chrome, and proving the shared Google Sheet (Apps Script) record works across machines.
---

# Testing static pages published from this repo on GitHub Pages

This repo (`alishakanwar-crypto/ppis-spelling-bee`, renamed from `khushaal` — the local clone may
still be at `/home/ubuntu/repos/khushaal`; live URL is
`https://alishakanwar-crypto.github.io/ppis-spelling-bee/spelling-bee.html`, the old `khushaal` path
404s) serves single-file, self-contained HTML artifacts from
`main` root via GitHub Pages. There is nothing to install, build or run locally — test the live URL.

## 1. Wait for Pages to publish (it lags a few minutes after merge)

```bash
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$URL"); echo "$(date +%T) $code"
  [ "$code" = "200" ] && break; sleep 20
done
```
A 404 right after merge is normal. If it is still 404 after ~10 minutes, check Pages
build status in repo settings before reporting a failure.

## 2. Prove the published bytes are the reviewed bytes

```bash
diff <(curl -s "$URL") /path/to/repo/file.html && echo IDENTICAL
curl -s "$URL" | sed -n '1,15p'          # confirm <head> meta/OG/theme-color tags
```
Also check any CDN dependency answers 200 over HTTPS (these pages pull `xlsx` from cdnjs):
`curl -s -o /dev/null -w "%{http_code}" https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js`

## 3. Spelling Bee page — UI path and expected values

- Landing screen is **teacher-facing** ("Set up this computer"): event code default `BEE2026`,
  Teacher PIN default `2026`. Click **Open for students** to reveal the student entry form and the
  floating **Teacher** button (bottom-right; `Ctrl+Shift+T` also opens the PIN prompt).
- Entry form needs name + class + roll (section optional). The band line predicts the paper — **read
  the numbers off that line rather than trusting this file**, the question bank changes between PRs.
  As of PR #2 every class has **25 questions** with `MARK = 1` (total = 25), and the timer is
  20 min (Class 3–4), 22 (5–6), 24 (7), 25 (8). An earlier version used 20 Q / 44 marks for 3–5.
- Answering every question correctly gives an exact, falsifiable expected score (e.g. **25 / 25**) —
  much stronger evidence than "a row appeared". Some questions are free-text and must be spelt
  exactly; pull the answer key out of the page source first so the perfect score is achievable:
  ```bash
  python3 - <<'EOF'
  import re; s=open('spelling-bee.html').read()
  seg=s[s.index('3: { label:"Class 3"'):s.index('4: { label:"Class 4"')]
  print(*re.findall(r'\{t:"type".*', seg), sep='\n')
  EOF
  ```
  (Watch out: at least one key is idiosyncratic — `show:"knite"` expects `knight`.)
- Teacher view: PIN `2026`. Test a wrong PIN first — it must show "That PIN is not correct."
- Export: "Download all classes" writes `Spelling-Bee-Results-<CODE>-<date>.xlsx` to `~/Downloads`.
  Validate it as a real workbook rather than trusting the toast:
  ```bash
  python3 -c "import zipfile,re;z=zipfile.ZipFile('FILE');print(re.findall(r'name=\"(.*?)\"',z.read('xl/workbook.xml').decode()));print(re.findall(r'<v>(.*?)</v>',z.read('xl/worksheets/sheet1.xml').decode())[:20])"
  ```
  Values are stored as inline `<v>` entries; there is no `xl/sharedStrings.xml`.
- Layout note: clicking an action button changes the `#copymsg` line and **shifts the button row
  down ~15 px**. Re-screenshot before the next click or you will miss the button.

## 4. The shared Google Sheet record (Apps Script) — since PR #2

Results no longer depend on `window.storage` (that layer is dead code on Pages: `HAS_STORE === false`
is still true and is *not* a finding). Each finished paper is POSTed to a Google Apps Script web app
bound to one spreadsheet, one tab per class **and** section (`Class 3A`, `Class 3B` … `Class 8B`),
created on demand. Backend lives in `spelling-bee-appsscript/Code.gs`.

Expected on GitHub Pages: `HAS_CLOUD === true`; setup screen says **"Connected to the school's shared
Google Sheet."**, the "Choose the shared folder" button and its help text are hidden, and
**Open for students is enabled with nothing to pick**. Completion screen says
**"Written to the school sheet (Class 3A) from <station>"**.

The endpoint is public and cheap to probe before touching the UI (grab it from `CLOUD_DEFAULT`):
```bash
curl -sL "$EXEC?action=list&session=BEE2026"
curl -sL "$EXEC?action=has&session=BEE2026&cls=3&sec=A&roll=11"
# POST needs --post301 --post302 --post303 -L (Apps Script 302-redirects) and Content-Type: text/plain
```
Re-POSTing the same event+class+section+roll must **update** the row (timestamp changes, row count
unchanged), not duplicate it — a cheap way to prove the keying without a third UI run.

### How to prove cross-device behaviour (the whole point of the feature)
Use **two browser profiles as two lab computers**: normal window (station `PC-01`) and an incognito
window (`PC-02`). Sit a paper in the normal window, then in incognito verify (a) the teacher view
(PIN `2026`) lists it, and (b) re-entering the same class+section+roll is refused with
"A result already exists for Class 3A, roll 11…". Re-use the *same roll in a different section* for
the second paper — that attacks `findRow_`, which keys on event+roll *within* a tab.
Allow ~2–3 s after "Start the test": the duplicate check is a live GET and the button stays disabled.

### Failure-mode testing without touching the network stack
Load `…/spelling-bee.html?sheet=https://script.google.com/macros/s/INVALID/exec` — it still matches
the `script.google.com` pattern so `HAS_CLOUD` stays true but every call fails. Expect
"Saved on this computer only" / **"Not yet in the shared record"** and a teacher view saying
**"The shared sheet could not be reached just now."** The finish button takes ~5 s (3 POST retries).
The override is stored in `localStorage.beeSheetUrl`, so do this in a **throwaway incognito session**
and close it afterwards, or the bad URL sticks on that profile. Afterwards, re-run `?action=list`
against the real endpoint to prove nothing was silently written.

### Regression to watch: the "shared record is unavailable" banner
PR #2 shipped `const notShared = HAS_STORE ? 0 : ALL.length;`, which ignored `HAS_CLOUD`/`CLOUD_LIVE`
and so showed the amber banner "The shared record is unavailable, so this shows only papers sat on
this computer" on *every* teacher view, including successful sheet reads. Fixed in PR #3
(`(HAS_STORE || (HAS_CLOUD && CLOUD_LIVE) || DIR) ? 0 : ALL.length`). Check the banner against the
scope line above it: they must agree, and the banner must appear only in a genuine outage.

### Testing timer expiry without waiting 20-25 minutes
The per-class time limit lives in `PAPERS[cls].mins` (Class 3/4 = 20, 5/6 = 22, 7 = 24, 8 = 25) and is
used at `endAt = Date.now() + (PAPERS[cls].mins + EXTRA) * 60000`. The setup screen's "Extra minutes"
field **cannot shorten** it (`EXTRA = Math.max(0, Math.min(20, …))` — add only). So:
```bash
mkdir -p /tmp/bee-expiry && cp spelling-bee.html /tmp/bee-expiry/
sed -i 's/label:"Class 3", mins:20/label:"Class 3", mins:1/' /tmp/bee-expiry/spelling-bee.html
cd /tmp/bee-expiry && python3 -m http.server 8899   # http://localhost:8899/spelling-bee.html
```
Do **not** add a `?sheet=` override — `CLOUD_DEFAULT` then still points at the real Apps Script
endpoint, so the timed-out row genuinely lands in the live sheet. Say in the report that the served
bytes were modified (one line) and do the teacher-view/export half of the check on the *live* URL.
Expiry path: `tick()` → `if(left <= 0) finish(true)` → `rec.out = true`, `rec.done = idx`;
backend writes `Ran out of time = 'yes'`, teacher view shows a "Ran out of time" stat, a red alarm and
a `TIME UP` pill, export column reads `YES`.

Known accuracy bug to expect (as of PR #3): if the clock expires while a **typing** question is on
screen, the *Answered/Attempted* count is one too high — `renderTyped()` never resets `pick = null`
(`render()` does), so `finish(true)` credits the stale previous answer as an attempt. Score is usually
unaffected (the stale text is scored against the typing answer and fails), but the child is told
"You answered N+1 of 25". Expire on an **option** question if you want an exact count.

### Housekeeping for the shared spreadsheet
Test submissions are real rows in the school's live sheet. Use obviously fake names/rolls, and list
every row and every tab you created in the report so the user can delete them.

**Always check whether the sheet is empty before you plan — it often is not.** A task may say "leave
the sheet empty and ready", but by then real children may already have sat papers:
```bash
curl -sL "<exec>?action=list&session=BEE2026" | python3 -c "
import json,sys
rows=json.load(sys.stdin)['rows']
print(len(rows),'rows')
from collections import Counter
print(Counter((r['cls'],r['sec']) for r in rows))"
```
If real rows exist, do **not** delete anything and do not write into a real class-section. Instead sit
every test paper under a **throwaway section letter** (e.g. Section `Z`), which makes brand-new tabs
(`Class 5Z`, `Class 8Z`) that can only contain your rows — then delete exactly those tabs
(right-click tab → Delete → OK) and re-run the `list` query to prove the original row count is back
and no `sec == "Z"` / test-station rows remain. Get the lead's approval before deleting anything.

Saves can be slow: the completion screen can sit on **"Saving…"** for up to ~a minute before the green
tick (Apps Script + LockService). That is not a failure — wait it out before declaring data loss, and
re-query the API rather than trusting an immediate read.

## 4b. Testing a question-data PR (papers changed, e.g. PR #8)

When a PR only replaces `PAPERS[n].q`, the strongest possible evidence is **sitting the paper with
every answer correct and getting exactly 25/25** — any wrong `a` / `w[0]` key makes that impossible.
Do this manually for at least the classes the PR is really about; state clearly which classes were sat
manually and which were only validated programmatically.

First extract the key so a perfect score is achievable, then run a structural validator mirroring the
page's own logic (`render()`: options are `q.w` for `t:"mcq"` else `q.o`; correct answer is `q.w[0]`
for `mcq` else `q.a`; `type` compares through `norm()` = lowercase, strip non `a-z`):
```bash
python3 - <<'EOF'
import re, json
s = open('spelling-bee.html').read()
# slice each PAPERS[n] block, convert the JS object literal to JSON, then assert per question:
#   answer non-empty · exactly 4 options · no duplicate options · correct answer present in options
EOF
```
Things this catches that a manual sitting cannot: duplicate options, an option list missing its own
answer, and a question count / `mins` regression. Report both.

Gotchas:
- `buildPaper()` **shuffles within bands** (`b:1`, then `b:2`, then `b:3`), so the on-screen order is
  not the data order. Never map "Q7" to the 7th entry in the source — match on the prompt text.
- If the first question would be a `type`, the page swaps it with the first non-`type` question.
- A US-English spellchecker will flag valid **British** spellings (`neighbour`, `favourite`,
  `colourful`) and real-word distractors (`its`/`it's`, `affect`, `advise`, `calender`, `surprize`).
  These are not defects — verify by hand before reporting a "misspelt answer".
- Also review grade-appropriateness by hand: watch for a hard *grammar* item (e.g. "plural of
  ANALYSIS" → `analyses`) sitting in band 1, which is meant to be the settling-in band.

## 4c. Testing a `mins` / time-limit change (e.g. PR #10 set every class to 15 min)

Two separate things must be checked, and the second is the one that actually matters to the user.

**(a) Is the new limit applied everywhere?** The entry-screen band line is built from the data
(`"Class "+c+" paper — "+PAPERS[+c].q.length+" questions, "+PAPERS[+c].mins+" minutes."`), so select
**every** class 3–8 in the dropdown in turn and read the line. A half-applied change shows up as some
classes keeping their old number. Then start one paper and confirm the first quiz frame shows the new
value (`MM:SS`) — the band line and the actual `endAt` are computed in different places
(`check()` vs `endAt = Date.now() + (PAPERS[cls].mins + EXTRA)*60000`).

**(b) Is the new limit realistic?** Do not answer this from your own sitting — you know every answer
in advance, so a fully-correct run takes ~3 minutes and proves nothing about a child. Instead, replay
the proposed cap against the **real `secs` column already in the sheet**, which is free empirical data
from children who sat under the old limits:
```bash
curl -sL "$EXEC_URL?action=list&session=BEE2026" | python3 -c "
import json,sys,statistics as st
rows=json.load(sys.stdin)['rows']; CAP=15*60
for cls in range(3,9):
    rs=[r for r in rows if r['cls']==cls and isinstance(r.get('secs'),(int,float)) and r['secs']>60]
    if not rs: continue
    cut=[r for r in rs if r['secs']>CAP]
    print('Class %d: n=%d median %.1f min -> %d cut off (%.0f%%)'%(
        cls,len(rs),st.median([r['secs'] for r in rs])/60,len(cut),100*len(cut)/len(rs)))"
```
Report this as a **finding, not a code failure** — the code does exactly what the PR says. The
persuasive framing is a class whose *questions did not change* (Class 3 in PR #10): same paper, less
time, so the cut-off percentage is attributable purely to the clock with no difficulty confounder.
Filter out sub-60 s rows — they are staff smoke-tests, not children.

Also surface it visually: the teacher view's "Time taken" column shows real durations per class and
already renders a `TIME UP` pill, which makes a much better screenshot than a table of numbers.

## 5. Phone viewport testing on this box

Chrome on Linux refuses to resize its window below ~532 px, and `--app=` mode did not spawn a
window here, so **use DevTools device emulation**: `F12`, then `Ctrl+Shift+M`, then set the
Dimensions fields (e.g. 390 × 844). Caveats:
- Closing DevTools (`F12`) also exits device mode — keep DevTools docked while screenshotting.
- Clicking the device-toolbar icon right after DevTools opens is unreliable; the `Ctrl+Shift+M`
  shortcut is more dependable.
- Device emulation is per-tab: navigate the emulated tab to the URL after enabling it.

## 6. Housekeeping

Two Chrome windows plus DevTools plus device emulation are easy to leave behind. Before finishing,
turn off device mode, close DevTools, and close extra/incognito windows so the shared browser is
usable by others.

## Devin Secrets Needed

None. The page is public and requires no login; the Teacher PIN is the in-page default `2026`.
