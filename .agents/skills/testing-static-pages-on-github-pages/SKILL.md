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
The per-class time limit lives in `PAPERS[cls].mins` (these have changed repeatedly — 20/22/24/25 up to
PR #8, then `15` for every class from PR #10 onward; read the current values rather than trusting this
list) and is
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

### Deleting rows from the shared sheet (there is no delete endpoint)
The Apps Script exposes `action=list` and the POST write path only — **there is no delete action**, so
any removal has to be done by hand in the Google Sheets UI. Because the backend writes **one tab per
class-section** (`Class 5A`, `Class 5B`, …), clearing a whole class is usually "right-click the tab →
Delete → OK" rather than row surgery. A tab is recreated automatically on the next submission for that
class-section, so deleting the tab is safe and is the fastest correct move **when the tab holds only
rows for the intended class-section** — open each tab and eyeball the Class/Section columns first,
since tab names have been wrong before (a tab literally named `44B` turned out to hold a Class 4 row).

Always bracket a destructive request with the API:
```bash
API="https://script.google.com/macros/s/<deployment>/exec?action=list&session=BEE2026"
curl -sL "$API" > /tmp/before.json   # back this up; it is your only undo
curl -sL "$API" | python3 -c "import json,sys;from collections import Counter;r=json.load(sys.stdin)['rows'];print(len(r));print(Counter((str(x['cls']),str(x['sec'])) for x in r))"
```
Report per-class-section counts and the before/after total, and explicitly re-verify that the classes
you were told *not* to touch still have their original counts. Note the sheet is live during an event —
the total can legitimately grow between two reads, so compare per-class counts, not just the total.

### Testing a subset-selection change (`ask: N` out of a larger bank)
When a PR starts asking only N of the M written questions, the failure mode that matters is **fairness**:
every child in a class must get the *same* N. Read the order of operations in `buildPaper()` — slice
first then `shuffle` means the set is fixed and only the order varies (correct); `shuffle` before the
slice would give every child a different paper (the bug). Prove it at runtime, not just by reading code:
sit/step through the same class paper **three times across two browser profiles** (use an incognito
window for a genuinely fresh `localStorage`), record all N prompts in order each time, then diff:
```python
print('SETS IDENTICAL:', set(o1)==set(o2)==set(o3))
print('orders differ:', o1!=o2, o1!=o3, o2!=o3)
```
Also assert the **band spread survived the cut** (map each prompt to its `b:1/2/3` band and check the
counts and that they are still presented easy→hard) — a proportional split can silently collapse onto
one band. For runs you only want to *observe*, step to the last question and **reload instead of
submitting** so no row is written to the live sheet.

Two traps worth pre-computing in Node against the real `PAPERS` before touching the UI: which class is
the only one whose asked slice can trigger a given edge case (e.g. only Class 5's asked band 1 contains
a `type` item, so it is the only class that can exercise the "never open on a blank typing box" swap),
and **which previously-flagged words the cut silently dropped** — PR #12's rules text still advertises
`manoeuvre` and `favourite` as examples even though both fell outside the asked 18.

Be honest about probabilistic evidence: observing four starts that did not open on a typing box shows
no run opened badly, but it does **not** prove the swap code fired.

Scoring shape to assert after an `ask` change: `total = paper.length` and `outOf: paper.length`, so the
sheet's *Score / Out of / Answered / Questions* columns must all read N. Pre-existing rows still reading
the old M make a regression obvious side by side.

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
