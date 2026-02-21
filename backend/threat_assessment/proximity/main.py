"""
Satellite Threat Assessment System — main entry point.

Run as:
    python -m threat_assessment.main

Required environment variables:
    SPACETRACK_USER   Space-Track.org account email
    SPACETRACK_PASS   Space-Track.org account password

Outputs:
    threat_scores.csv   — full ranked threat table (all adversarial satellites)
    distributions.png   — benign vs threat PDF overlay with observed histogram
    posteriors.png      — Bayesian posterior curve with satellite scatter plot

Console:
    Top-20 threat table
    Summary: satellites assessed, benign distribution parameters, top-5 threats
"""

from __future__ import annotations

import logging
import sys

import numpy as np

from threat_assessment.bayesian_scorer import score_all
from threat_assessment.data_pipeline import run_pipeline
from threat_assessment.distributions import fit_benign_distribution, get_threat_distribution
from threat_assessment.visualisation import (
    plot_distributions,
    plot_posteriors,
    print_top_threats,
    save_csv,
)

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """
    Orchestrate the full threat assessment pipeline.

    Steps:
        1. Pull GP + SATCAT data (with caching) and propagate all satellites
        2. Fit the empirical benign distribution
        3. Score all adversarial satellites via Bayesian inference
        4. Print ranked table, save CSV, save plots
        5. Print summary
    """
    log.info("=== Satellite Threat Assessment System starting ===")

    # ------------------------------------------------------------------
    # Step 1: Data pipeline
    # ------------------------------------------------------------------
    try:
        adversarial_results, benign_results = run_pipeline()
    except ValueError as exc:
        log.error("Configuration error: %s", exc)
        sys.exit(1)
    except RuntimeError as exc:
        log.error("Pipeline error: %s", exc)
        sys.exit(1)
    except Exception as exc:
        log.exception("Unexpected error in data pipeline: %s", exc)
        sys.exit(1)

    if not adversarial_results:
        log.error("No adversarial satellites found in GP data. Check country code filters.")
        sys.exit(1)

    if not benign_results:
        log.error("No benign satellite results — cannot fit benign distribution.")
        sys.exit(1)

    # ------------------------------------------------------------------
    # Step 2: Fit benign distribution
    # ------------------------------------------------------------------
    benign_min_seps = np.array([
        r.min_separation_km for r in benign_results
        if not r.propagation_failed and np.isfinite(r.min_separation_km)
    ])

    try:
        benign_params = fit_benign_distribution(benign_min_seps)
    except ValueError as exc:
        log.error("Failed to fit benign distribution: %s", exc)
        sys.exit(1)

    threat_params = get_threat_distribution()

    # ------------------------------------------------------------------
    # Step 3: Score adversarial satellites
    # ------------------------------------------------------------------
    scores = score_all(adversarial_results, benign_params, threat_params)

    # ------------------------------------------------------------------
    # Step 4: Output
    # ------------------------------------------------------------------
    print_top_threats(scores, n=20)
    save_csv(scores, "threat_scores.csv")

    adv_min_seps = np.array([
        s.min_separation_km for s in scores
        if not s.propagation_failed and np.isfinite(s.min_separation_km)
    ])

    plot_distributions(
        benign_separations=benign_min_seps,
        adversarial_separations=adv_min_seps,
        benign_params=benign_params,
        threat_params=threat_params,
        output_path="distributions.png",
    )

    plot_posteriors(
        scores=scores,
        benign_params=benign_params,
        threat_params=threat_params,
        output_path="posteriors.png",
    )

    # ------------------------------------------------------------------
    # Step 5: Summary
    # ------------------------------------------------------------------
    n_assessed = len(scores)
    n_failed = sum(1 for s in scores if s.propagation_failed)
    top5 = scores[:5]

    print()
    print("=" * 60)
    print("ASSESSMENT SUMMARY")
    print("=" * 60)
    print(f"  Satellites assessed:        {n_assessed}")
    print(f"  Propagation failures:       {n_failed} (posterior = prior)")
    print(f"  Benign sample size:         {len(benign_results)}")
    print(f"  Benign distribution:        {benign_params}")
    print(f"  Threat distribution:        {threat_params}")
    print()
    print("  Top 5 highest-threat satellites:")
    for rank, s in enumerate(top5, start=1):
        flag = " [FAILED]" if s.propagation_failed else ""
        sep_str = f"{s.min_separation_km:,.1f} km" if s.min_separation_km < 1e9 else "N/A"
        print(
            f"    {rank}. NORAD {s.norad_cat_id:>6}  {s.object_name:<25}"
            f"  {s.country_code}  sep={sep_str}  posterior={s.posterior:.4f}{flag}"
        )
    print("=" * 60)
    print()
    log.info("=== Assessment complete. Outputs: threat_scores.csv, distributions.png, posteriors.png ===")


if __name__ == "__main__":
    main()
