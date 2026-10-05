# Wikipedia fixtures

Small excerpts of the wikitext of English Wikipedia articles (the "List of UFC events" table and
the "Bonus awards" section of event articles), used to test the bonus-award parser on real
formatting and real edge cases (two Fight of the Night pairs on one line, "None awarded" in three
spellings, the plural "Performances of the Night", a nine-name list, prose about a rescinded
award, a special one-off bonus).

- Source: <https://en.wikipedia.org/wiki/List_of_UFC_events> and the individual UFC event
  articles. Text is available under CC BY-SA 4.0 (<https://creativecommons.org/licenses/by-sa/4.0/>); see each
  article's history for authorship. The excerpts are trimmed (changes were made); nothing else is altered.
- Snapshot of 4 October 2026. Only the small excerpts needed for the tests are kept.
- The bonus awards are used only as training/evaluation labels, never as a scoring input.

The `sherdog_*.html` and `../ufc_event_times.html` files are not copies of pages: they are small hand-made
files with the same element structure the parsers read (names of rivals are placeholders), kept only to test
those parsers.
