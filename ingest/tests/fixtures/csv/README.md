# CSV fixtures

Small excerpts (7 events) of public fight statistics, used to test the parser against real
rows and real edge cases: majority draw, no contest, a repeated bout within one event, an old
event with empty stat rows, a placeholder `--` control time, and an event that also appears
under a stale duplicate name.

- Origin: the CSV mirror <https://github.com/Greco1899/scrape_ufc_stats> (GPL-3.0), which
  republishes statistics originally published by ufcstats.com. Snapshot of 4 October 2026.
- Files: `events.csv`, `results.csv`, `stats.csv` (columns exactly as in the mirror).
- These excerpts are test data only. Never commit the full CSVs; they live in the gitignored
  download cache (`ingest/.cache/`).
