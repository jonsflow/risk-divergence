# Updating the Fed Pages After an FOMC Meeting

All three Federal Reserve pages read their text from config. After a meeting you
edit JSON — no HTML, no JavaScript.

| File | Feeds |
|---|---|
| `config/fomc_meetings.json` | FOMC latest-meeting card, Statement Tracker |
| `config/fed_chair.json` | Fed Chair doctrine scorecard + policy timeline |

Neither is generated. Both are committed source, so they go in a normal PR — unlike
`data/`, which only the workflow commits.

## After a meeting

### 1. `config/fomc_meetings.json`

**Prepend** a meeting to `meetings` (newest first — the pages read `meetings[0]` as
current). Copy the previous entry and edit:

```json
{
  "date": "2026-09-16",
  "label": "Sep 16, 2026",
  "chair": "Warsh",
  "vote": "10–2",
  "target_range": "3.75–4.00%",
  "dissent_count": 2,
  "dissent_direction": "hold",
  "decision": "hike",
  "bps": 25,
  "consecutive_holds": 0,
  "sep_meeting": true,
  "sep_note": "Only if sep_meeting — what the projection showed.",
  "note": "Optional sentence under the decision.",
  "dissent_note": "Optional sentence under the dissenter list.",
  "dissenters": [
    { "name": "…", "bank": "…", "preferred": "…", "quote": "…" }
  ],
  "points": ["Bullet under the two cards.", "…"],
  "sources": { "statement": "…", "implementation": "…", "pdf": "…" },
  "statement": ["paragraph", "…"],
  "implementation": ["paragraph", "…"]
}
```

Then update the top-level `next_meeting`.

**The decision sentence and badge are generated**, not written. `decision`
(`hold`/`hike`/`cut`), `bps`, `target_range` and `consecutive_holds` produce
"Target range held at 3.50–3.75% — the fifth consecutive hold." or "Raised 25bps to
3.75–4.00%." Don't restate that in `note` — use `note` for what the numbers don't say.

`dissenters[].quote` renders under each name, so dissent statements go there rather
than into `points`.

**On the text arrays.** `statement` and `implementation` are one string per
paragraph, verbatim from the press release. Normalize curly apostrophes to ASCII;
drop the release header and the media-contact boilerplate. The tracker diffs these
arrays directly, so a stray edit shows up as a fake redline. Keep the implementation
note's Desk directive intact — the page finds those bullets by matching
`"directs the Desk to:"` and `"In a related action"`, not by index, so paragraphs can
move but those two anchors must survive.

Optionally add a `redlines` entry keyed `"<older-date>|<newer-date>"` — an array of
HTML strings shown under the diff. Omit it and the section hides itself.

### 2. `config/fed_chair.json`

Append a `timeline` row to the end of the array (`era` is `"powell"` or `"warsh"`).
The page renders newest-first, so appending is always correct.

Update `doctrine` only where the record actually moved. Each item has `stated` (what
the Chair committed to — rarely changes) and `status` + `record` (how it's going).
`status.text` is free text; `status.color` should be one of:

- `#34d399` green — doing what was said
- `#f59e0b` amber — partial or mixed
- `#ef4444` red — contradicted
- `#a7a7ad` grey — untested

### 3. Chair changes

When the Chair changes, edit `chair` in `config/fomc_meetings.json` — name,
confirmed, sworn_in, predecessor. Both Fed pages template off it.

`config/fed_chair.json` `page.*` strings accept `{name}`, `{last}`,
`{predecessor}`, `{predecessor_last}`, `{confirmed}`, `{confirmed_long}`,
`{sworn_in}`, `{sworn_in_long}`. That covers the page title, browser title, meta
description, intro, section headings and every chart caption, so no chair name is
typed into HTML. Also replace the `eras` entry for the outgoing Chair's framework.

## Verify

```bash
python3 -c "import json;[json.load(open(f)) for f in ['config/fomc_meetings.json','config/fed_chair.json']]"
python3 -m http.server 8000
```

Check `pages/fomc.html` (latest-meeting card at top), `pages/fed_chair.html`
(scorecard + timeline), and `pages/fomc_statements.html` (new meeting in both
dropdowns, diff renders).

## What is not config

Chart data (FRED), the FOMC decision timeline table (computed from DFEDTARU /
DFEDTARL across the full history, not just tracked meetings), and the site footer.
