# Spelling Bee — consolidated results backend

`Code.gs` runs inside the results spreadsheet and gives the quiz page one shared
place to write to, so every lab computer feeds a single consolidated sheet.

- Spreadsheet: **SPELLING BEE 2026-27 — CONSOLIDATED RESULTS**
- One tab per class **and** section: `Class 3A`, `Class 3B`, … `Class 8B` (created on demand)
- A paper is identified by event code + class + section + roll number, so a
  re-submission updates the same row instead of adding a duplicate
- Timestamps are written in IST (`dd-MM-yyyy HH:mm:ss IST`)

## Endpoints

| Request | Purpose |
| --- | --- |
| `POST /exec` with `{session, rec}` | write/update one paper |
| `GET /exec?action=list&session=CODE` | every paper for that event |
| `GET /exec?action=has&session=CODE&cls=3&sec=A&roll=7` | has this child already sat? |

## Re-deploying after a code change

1. Open the spreadsheet > **Extensions > Apps Script**
2. Paste the new `Code.gs`, save
3. **Deploy > Manage deployments > edit (pencil) > Version: New version > Deploy**

Keep the same deployment so the `/exec` URL in `spelling-bee.html` stays valid.
`Who has access` must remain **Anyone**, otherwise the lab computers cannot post
results. Deploying a brand-new deployment produces a new URL, which then has to
be put into `spelling-bee.html` (or passed per machine with `?sheet=<url>`).
