"""Command line: backfill, ingest-latest, ingest-bonuses, ingest-segments, ingest-context,
ingest-fighters, fit-scoring, rescore.

Exit codes: 0 = ok, 1 = the run finished but reported errors (unscored fights, failed or
overdue events), 2 = bad configuration or unusable input (nothing meaningful was done).
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import logging
import tempfile
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from pathlib import Path

from blindcard_ingest.bonus_pipeline import BonusSource, run_ingest_bonuses
from blindcard_ingest.context_pipeline import run_ingest_context
from blindcard_ingest.db.repository import PostgresRepository, Repository, RepositoryError
from blindcard_ingest.fighters_pipeline import run_ingest_fighters
from blindcard_ingest.fit.run import run_fit_scoring
from blindcard_ingest.http.cache import HtmlCache
from blindcard_ingest.http.client import FetchError, PoliteClient
from blindcard_ingest.logging_setup import configure_logging
from blindcard_ingest.pipeline import (
    DEFAULT_SINCE_DAYS,
    IngestReport,
    run_backfill,
    run_ingest_latest,
    run_rescore,
)
from blindcard_ingest.scoring.config import ScoringConfigError
from blindcard_ingest.scoring.scorer import ScoringError
from blindcard_ingest.segment_pipeline import run_ingest_segments
from blindcard_ingest.settings import Settings, SettingsError, load_settings
from blindcard_ingest.sources.base import FightDataSource
from blindcard_ingest.sources.sherdog import SherdogClient
from blindcard_ingest.sources.ufcstats.dataset import SOURCE_NAME, DatasetError
from blindcard_ingest.sources.ufcstats.source import UfcStatsCsvSource
from blindcard_ingest.sources.wikidata import WikidataClient
from blindcard_ingest.sources.wikipedia.client import WikipediaClient, WikipediaError

logger = logging.getLogger("blindcard_ingest.cli")

EXIT_OK = 0
EXIT_RUN_ERRORS = 1
EXIT_BAD_CONFIG = 2


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--dry-run", action="store_true", help="read and parse everything, write nothing"
    )
    common.add_argument(
        "--log-level", help="DEBUG, INFO, WARNING, ... (default: LOG_LEVEL or INFO)"
    )
    common.add_argument("--cache-dir", type=Path, help="raw download cache (default: CACHE_DIR)")

    parser = argparse.ArgumentParser(
        prog="blindcard-ingest", description="Ingest fight data and compute excitement scores."
    )
    commands = parser.add_subparsers(dest="command", required=True)

    backfill = commands.add_parser(
        "backfill", parents=[common], help="ingest all completed events from a year on"
    )
    backfill.add_argument("--from", dest="from_year", type=int, required=True, metavar="YEAR")

    latest = commands.add_parser(
        "ingest-latest", parents=[common], help="ingest recent events that are not complete yet"
    )
    latest.add_argument(
        "--since-days",
        type=int,
        default=DEFAULT_SINCE_DAYS,
        help=f"only events newer than this many days (default {DEFAULT_SINCE_DAYS})",
    )

    bonuses = commands.add_parser(
        "ingest-bonuses",
        parents=[common],
        help="label fights with Fight/Performance of the Night (from Wikipedia)",
    )
    bonuses.add_argument("--from", dest="from_year", type=int, default=2015, metavar="YEAR")

    segments = commands.add_parser(
        "ingest-segments",
        parents=[common],
        help="store which part of the card (main / prelims / early prelims) each fight was on",
    )
    segments.add_argument("--from", dest="from_year", type=int, default=2015, metavar="YEAR")

    commands.add_parser(
        "ingest-upcoming",
        parents=[common],
        help="store the announced cards of the coming events (pre-fight facts, from Wikipedia)",
    )

    commands.add_parser(
        "predict-upcoming",
        parents=[common],
        help="store an expected rating for every announced bout (public data only)",
    )

    evaluate = commands.add_parser(
        "evaluate-predictions",
        parents=[common],
        help="walk-forward check of the prediction against two baselines (writes nothing)",
    )
    evaluate.add_argument("--test-from", dest="test_from_year", type=int, default=2018)

    commands.add_parser(
        "ingest-judges",
        parents=[common],
        help="store how often each judge scores against the final result (public aggregates only)",
    )

    videos = commands.add_parser(
        "ingest-videos",
        parents=[common],
        help="link five-star fights to their official full-fight video on the UFC YouTube channel",
    )
    videos.add_argument("--min-stars", type=float, default=5.0, metavar="STARS")
    videos.add_argument("--handle", default="UFC", help="channel handle (default UFC)")

    commands.add_parser(
        "ingest-context",
        parents=[common],
        help="store rematch, win streaks and unbeaten status (from earlier bouts) on each fight",
    )

    fighters = commands.add_parser(
        "ingest-fighters",
        parents=[common],
        help="store each fighter's country and the records going into every bout (Wikipedia)",
    )
    fighters.add_argument("--from", dest="from_year", type=int, default=2015, metavar="YEAR")
    fighters.add_argument(
        "--only-missing",
        action="store_true",
        help="only look up the bouts that still have no record, and leave stored records alone",
    )
    fighters.add_argument(
        "--sherdog-only",
        action="store_true",
        help="only look up fighters that still have no record, on Sherdog (no Wikipedia pass)",
    )

    fit = commands.add_parser(
        "fit-scoring",
        parents=[common],
        help="fit a new score version to the bonus labels and write its config file",
    )
    fit.add_argument("--version", type=int, required=True, metavar="N")
    fit.add_argument(
        "--test-from",
        dest="test_from_year",
        type=int,
        default=2024,
        metavar="YEAR",
        help="judge on events from this year on, fit on the years before (default 2024)",
    )
    fit.add_argument("--l2", type=float, default=5.0, help="ridge penalty (default 5.0)")
    fit.add_argument(
        "--finish-leak",
        type=float,
        default=0.30,
        metavar="AUC",
        help=(
            "how far above 0.5 the public stars may predict 'finished' (default 0.30); "
            "higher gives finishes more credit and tells more about the result"
        ),
    )
    fit.add_argument(
        "--force", action="store_true", help="replace an existing scoring_vN.toml (never v1)"
    )

    rescore = commands.add_parser(
        "rescore", parents=[common], help="rebuild the reference and rescore all fights"
    )
    rescore.add_argument("--version", type=int, required=True, metavar="N")
    rescore.add_argument(
        "--activate",
        action="store_true",
        help="make this the active version (the first version always activates itself)",
    )
    return parser


@contextmanager
def _open_repository(settings: Settings) -> Iterator[Repository]:
    repo = PostgresRepository(settings.require_database_url())
    try:
        yield repo
    finally:
        repo.close()


@contextmanager
def _open_source(settings: Settings) -> Iterator[FightDataSource]:
    with PoliteClient(
        settings.require_user_agent(),
        HtmlCache(settings.cache_dir),
        min_interval_seconds=settings.request_interval_seconds,
    ) as client:
        yield UfcStatsCsvSource(client)


@contextmanager
def _open_fighter_sources(
    settings: Settings,
) -> Iterator[tuple[WikipediaClient, WikidataClient, SherdogClient]]:
    """Clients for the fighter pages. Their raw replies are thrown away afterwards: the pages are
    long and only the few facts read from them are kept."""
    with (
        tempfile.TemporaryDirectory(prefix="blindcard-wiki-") as scratch,
        PoliteClient(
            settings.require_user_agent(),
            HtmlCache(Path(scratch)),
            min_interval_seconds=settings.request_interval_seconds,
        ) as client,
    ):
        yield WikipediaClient(client), WikidataClient(client), SherdogClient(client)


@contextmanager
def _open_wikipedia(settings: Settings) -> Iterator[BonusSource]:
    with PoliteClient(
        settings.require_user_agent(),
        HtmlCache(settings.cache_dir),
        min_interval_seconds=settings.request_interval_seconds,
    ) as client:
        yield WikipediaClient(client)


def _today() -> dt.date:
    return dt.datetime.now(dt.UTC).date()


def _finish(report: IngestReport) -> int:
    for error in report.errors:
        logger.error("%s", error)
    return EXIT_RUN_ERRORS if report.has_errors else EXIT_OK


def _run(args: argparse.Namespace, settings: Settings) -> int:
    if args.command == "rescore":
        with _open_repository(settings) as repo:
            rescore = run_rescore(
                repo,
                settings.scoring_config_dir,
                args.version,
                activate=args.activate,
                dry_run=args.dry_run,
            )
        logger.info(
            "rescore v%d done: %d fights scored, %d unscorable%s",
            rescore.version,
            rescore.pool_size,
            rescore.unscorable,
            " (dry run)" if args.dry_run else "",
        )
        return EXIT_OK

    if args.command == "fit-scoring":
        with _open_repository(settings) as repo:
            run_fit_scoring(
                repo,
                settings.scoring_config_dir,
                args.version,
                source_name=SOURCE_NAME,
                test_from_year=args.test_from_year,
                l2=args.l2,
                finish_leak=args.finish_leak,
                dry_run=args.dry_run,
                overwrite=args.force,
            )
        return EXIT_OK

    if args.command == "predict-upcoming":
        from blindcard_ingest.predict.pipeline import run_predict_upcoming

        with _open_repository(settings) as repo:
            run_predict_upcoming(repo, dry_run=args.dry_run)
        return EXIT_OK

    if args.command == "evaluate-predictions":
        from blindcard_ingest.predict.dataset import build_examples
        from blindcard_ingest.predict.evaluate import report as evaluation_report
        from blindcard_ingest.predict.evaluate import walk_forward

        with _open_repository(settings) as repo:
            examples, _ = build_examples(repo.prediction_fights())
        print(evaluation_report(walk_forward(examples, test_from_year=args.test_from_year)))
        return EXIT_OK

    # Fail on missing configuration before anything is fetched.
    settings.require_database_url()
    settings.require_user_agent()

    if args.command == "ingest-bonuses":
        with _open_repository(settings) as repo, _open_wikipedia(settings) as wiki:
            bonus_report = run_ingest_bonuses(
                wiki,
                repo,
                source_name=SOURCE_NAME,
                from_year=args.from_year,
                report_path=settings.cache_dir.parent / "bonus_report.json",
                dry_run=args.dry_run,
            )
        if bonus_report.labeled_share < 0.9:
            logger.warning(
                "only %.0f%% of events are labelled; see the local bonus_report.json",
                100 * bonus_report.labeled_share,
            )
        return EXIT_OK

    if args.command == "ingest-fighters":
        with (
            _open_repository(settings) as repo,
            _open_fighter_sources(settings) as (
                wiki,
                wikidata,
                sherdog,
            ),
        ):
            run_ingest_fighters(
                wiki,
                repo,
                source_name=SOURCE_NAME,
                from_year=args.from_year,
                countries_source=None if args.sherdog_only else wikidata,
                sherdog=sherdog,
                only_missing=args.sherdog_only or args.only_missing,
                use_wikipedia=not args.sherdog_only,
                dry_run=args.dry_run,
            )
        return EXIT_OK

    if args.command == "ingest-upcoming":
        from blindcard_ingest.upcoming_pipeline import run_ingest_upcoming

        with _open_repository(settings) as repo, _open_wikipedia(settings) as wiki:
            run_ingest_upcoming(wiki, repo, today=_today(), dry_run=args.dry_run)
        return EXIT_OK

    if args.command == "ingest-judges":
        from blindcard_ingest.judges_pipeline import run_ingest_judges

        with _open_repository(settings) as repo:
            run_ingest_judges(repo, dry_run=args.dry_run)
        return EXIT_OK

    if args.command == "ingest-videos":
        from blindcard_ingest.sources.youtube import YouTubeClient
        from blindcard_ingest.videos_pipeline import run_ingest_videos

        with _open_repository(settings) as repo:
            run_ingest_videos(
                YouTubeClient(settings.require_youtube_api_key()),
                repo,
                handle=args.handle,
                min_stars=args.min_stars,
                dry_run=args.dry_run,
            )
        return EXIT_OK

    if args.command == "ingest-context":
        with _open_repository(settings) as repo:
            run_ingest_context(repo, source_name=SOURCE_NAME, dry_run=args.dry_run)
        return EXIT_OK

    if args.command == "ingest-segments":
        with _open_repository(settings) as repo, _open_wikipedia(settings) as wiki:
            segment_report = run_ingest_segments(
                wiki,
                repo,
                source_name=SOURCE_NAME,
                from_year=args.from_year,
                report_path=settings.cache_dir.parent / "segment_report.json",
                dry_run=args.dry_run,
            )
        if segment_report.segmented_share < 0.9:
            logger.warning(
                "only %.0f%% of events got card segments; see the local segment_report.json",
                100 * segment_report.segmented_share,
            )
        return EXIT_OK

    with _open_repository(settings) as repo, _open_source(settings) as source:
        if args.command == "backfill":
            report = run_backfill(
                source, repo, from_year=args.from_year, today=_today(), dry_run=args.dry_run
            )
            logger.info("next: `blindcard-ingest rescore --version 1` to (re)build the scores")
        else:
            report = run_ingest_latest(
                source, repo, today=_today(), since_days=args.since_days, dry_run=args.dry_run
            )
    return _finish(report)


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = load_settings()
    if args.cache_dir is not None:
        settings = dataclasses.replace(settings, cache_dir=args.cache_dir.resolve())
    configure_logging(args.log_level or settings.log_level)
    try:
        return _run(args, settings)
    except RepositoryError as exc:
        logger.error("%s", exc)  # already stripped of row data
        return EXIT_RUN_ERRORS
    except WikipediaError as exc:
        logger.error("%s", exc)
        return EXIT_RUN_ERRORS
    except (
        SettingsError,
        ScoringConfigError,
        ScoringError,
        DatasetError,
        FetchError,
    ) as exc:
        logger.error("%s: %s", type(exc).__name__, exc)
        return EXIT_BAD_CONFIG
