"""
Visualisation and output for the satellite threat assessment system.

Produces:
    - Console table: top-N threat-scored satellites
    - CSV file:      full threat score table
    - distributions.png: benign vs threat PDF curves with separation histogram
    - posteriors.png:    posterior probability curve with observed satellites

Chart design notes:
    Both charts use a log-scaled x-axis because satellite minimum separations
    span several orders of magnitude (tens of km for close approaches to tens
    of thousands of km for satellites in different orbital planes).

    distributions.png uses density=True histograms with log-spaced bins to
    give equal visual weight to each decade on the log axis.

    posteriors.png shows the theoretical posterior curve for a representative
    PRC satellite (prior=0.05) alongside actual scored satellites as a scatter
    plot.  Marker area scales with hours_within_100km to surface dwell-time
    information in the same chart.
"""

from __future__ import annotations

import csv
import logging
from dataclasses import asdict, fields
from pathlib import Path

import matplotlib
import matplotlib.pyplot as plt
import numpy as np

from threat_assessment.bayesian_scorer import ThreatScore, compute_posterior, PRIOR_ADVERSARIAL
from threat_assessment.distributions import DistributionParams, pdf_lognormal, likelihood_ratio

matplotlib.use("Agg")  # non-interactive backend — safe for headless environments

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Console table
# ---------------------------------------------------------------------------

_TABLE_HEADER = (
    f"{'Rank':>4}  {'NORAD':>6}  {'Name':<25}  {'CC':>3}  {'RCS':<6}  "
    f"{'Min Sep (km)':>12}  {'Hrs <100km':>10}  {'Prior':>6}  {'LR':>10}  {'Posterior':>9}"
)
_TABLE_DIVIDER = "-" * len(_TABLE_HEADER)


def print_top_threats(scores: list[ThreatScore], n: int = 20) -> None:
    """
    Print a formatted table of the top-n highest-threat satellites.

    Rows where propagation failed are marked with '*' after the name.
    The table is sorted by posterior probability (descending) — scores
    are assumed to arrive pre-sorted from bayesian_scorer.score_all().
    """
    print()
    print("=== SATELLITE THREAT ASSESSMENT — TOP {} RESULTS ===".format(min(n, len(scores))))
    print(_TABLE_DIVIDER)
    print(_TABLE_HEADER)
    print(_TABLE_DIVIDER)

    for rank, s in enumerate(scores[:n], start=1):
        flag = "*" if s.propagation_failed else " "
        name_field = f"{s.object_name[:24]}{flag}"
        # Handle inf separation (propagation failed / no approach)
        sep_str = f"{s.min_separation_km:>12,.1f}" if s.min_separation_km < 1e9 else f"{'N/A':>12}"
        lr_str = f"{s.likelihood_ratio:>10.4f}" if s.likelihood_ratio < 1e9 else f"{'>>1':>10}"
        print(
            f"{rank:>4}  {s.norad_cat_id:>6}  {name_field:<25}  {s.country_code:>3}  "
            f"{s.rcs_size:<6}  {sep_str}  {s.hours_within_100km:>10.2f}  "
            f"{s.prior:>6.4f}  {lr_str}  {s.posterior:>9.4f}"
        )

    print(_TABLE_DIVIDER)
    print(f"  * propagation failed — posterior equals prior (no proximity evidence)")
    print()


# ---------------------------------------------------------------------------
# CSV output
# ---------------------------------------------------------------------------


def save_csv(scores: list[ThreatScore], output_path: str = "threat_scores.csv") -> None:
    """
    Write all ThreatScore records to CSV.

    Float fields are rounded to 4 decimal places for readability.
    Column order matches the ThreatScore dataclass field declaration order.
    """
    if not scores:
        log.warning("No scores to write — skipping CSV output.")
        return

    fieldnames = [f.name for f in fields(ThreatScore)]
    path = Path(output_path)

    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for s in scores:
            row = asdict(s)
            for key, val in row.items():
                if isinstance(val, float):
                    row[key] = round(val, 4)
            writer.writerow(row)

    log.info("Saved %d threat scores to '%s'.", len(scores), output_path)


# ---------------------------------------------------------------------------
# Chart (a): distribution overlay
# ---------------------------------------------------------------------------


def plot_distributions(
    benign_separations: np.ndarray,
    adversarial_separations: np.ndarray,
    benign_params: DistributionParams,
    threat_params: DistributionParams,
    output_path: str = "distributions.png",
) -> matplotlib.figure.Figure:
    """
    Plot benign vs threat distribution PDFs overlaid with observed histograms.

    Chart elements:
        - Histogram of benign satellite observed separations (green, density=True)
        - Histogram of adversarial satellite observed separations (blue, density=True)
        - Fitted benign log-normal PDF curve (solid green)
        - Expert-informed threat log-normal PDF curve (dashed red)
        - Vertical dashed lines at the 100 km proximity threshold

    Args:
        benign_separations:      array of min-sep values for benign sample (km)
        adversarial_separations: array of min-sep values for adversarial sats (km)
        benign_params:           fitted log-normal for benign distribution
        threat_params:           expert log-normal for threat distribution
        output_path:             file path for the saved figure

    Returns:
        matplotlib Figure object.
    """
    # Filter to finite positive values
    b_sep = benign_separations[np.isfinite(benign_separations) & (benign_separations > 0)]
    a_sep = adversarial_separations[np.isfinite(adversarial_separations) & (adversarial_separations > 0)]

    # Log-spaced bins for correct histogram appearance on a log axis
    bins = np.logspace(0, 5, 60)

    fig, ax = plt.subplots(figsize=(10, 6))

    # Histograms
    if len(b_sep) > 0:
        ax.hist(
            b_sep, bins=bins, density=True, alpha=0.35,
            color="green", label="Benign observations",
        )
    if len(a_sep) > 0:
        ax.hist(
            a_sep, bins=bins, density=True, alpha=0.45,
            color="steelblue", label="Adversarial (PRC/RUS) observations",
        )

    # PDF curves
    x = np.logspace(0, 5, 1000)
    ax.plot(
        x, pdf_lognormal(x, benign_params),
        color="green", linewidth=2.0,
        label=f"Fitted benign PDF (μ={benign_params.mu:.2f}, σ={benign_params.sigma:.2f})",
    )
    ax.plot(
        x, pdf_lognormal(x, threat_params),
        color="red", linewidth=2.0, linestyle="--",
        label=f"Threat PDF (μ={threat_params.mu:.2f}, σ={threat_params.sigma:.2f})",
    )

    # 100 km threshold marker
    ax.axvline(100.0, color="orange", linewidth=1.5, linestyle=":", label="100 km threshold")

    ax.set_xscale("log")
    ax.set_xlim(1, 1e5)
    ax.set_xlabel("Minimum Separation Distance (km)", fontsize=12)
    ax.set_ylabel("Probability Density", fontsize=12)
    ax.set_title("Separation Distance Distributions: Benign vs Threat", fontsize=13, fontweight="bold")
    ax.legend(loc="upper left", fontsize=10)
    ax.grid(True, which="both", alpha=0.3)

    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    log.info("Saved distribution plot to '%s'.", output_path)
    return fig


# ---------------------------------------------------------------------------
# Chart (b): posterior curve with scatter
# ---------------------------------------------------------------------------


def plot_posteriors(
    scores: list[ThreatScore],
    benign_params: DistributionParams,
    threat_params: DistributionParams,
    output_path: str = "posteriors.png",
) -> matplotlib.figure.Figure:
    """
    Plot posterior threat probability vs minimum separation distance.

    Chart elements:
        - Smooth theoretical posterior curve for a PRC satellite (prior=0.05)
        - Scatter of all scored satellites, colour-coded by country origin
        - Marker area scales with hours_within_100km (highlights dwell time)
        - Top-5 highest-posterior satellites annotated with NORAD IDs

    Args:
        scores:        list of ThreatScore from bayesian_scorer.score_all()
        benign_params: fitted log-normal for benign distribution
        threat_params: expert log-normal for threat distribution
        output_path:   file path for the saved figure

    Returns:
        matplotlib Figure object.
    """
    fig, ax = plt.subplots(figsize=(11, 7))

    # Theoretical posterior curve (representative PRC prior)
    x_curve = np.logspace(0, 5, 1000)
    posterior_curve = np.array([
        compute_posterior(
            PRIOR_ADVERSARIAL,
            likelihood_ratio(xi, benign_params, threat_params),
        )
        for xi in x_curve
    ])
    ax.plot(
        x_curve, posterior_curve,
        color="red", linewidth=2.0, alpha=0.8, zorder=2,
        label=f"Theoretical posterior (prior={PRIOR_ADVERSARIAL})",
    )

    # Scatter of actual scored satellites
    if scores:
        valid_scores = [s for s in scores if not s.propagation_failed and s.min_separation_km < 1e9]
        failed_scores = [s for s in scores if s.propagation_failed]

        # Colour mapping
        country_colour = {"PRC": "red", "CIS": "darkorange"}

        def _scatter_group(group: list[ThreatScore], colour: str, label: str) -> None:
            if not group:
                return
            xs = np.array([s.min_separation_km for s in group])
            ys = np.array([s.posterior for s in group])
            # Marker size: base 20 + scale by dwell time (min 20 to stay visible)
            sizes = np.maximum(np.array([s.hours_within_100km for s in group]), 1.0) * 15.0
            ax.scatter(xs, ys, c=colour, s=sizes, alpha=0.7, edgecolors="white",
                       linewidths=0.5, zorder=3, label=label)

        prc_valid = [s for s in valid_scores if s.country_code == "PRC"]
        rus_valid = [s for s in valid_scores if s.country_code == "CIS"]
        other_valid = [s for s in valid_scores if s.country_code not in ("PRC", "CIS")]

        _scatter_group(prc_valid, "red", "PRC")
        _scatter_group(rus_valid, "darkorange", "CIS (Russia)")
        _scatter_group(other_valid, "steelblue", "Other")

        # Failed-propagation satellites at y=prior (no x evidence)
        if failed_scores:
            ys_failed = np.array([s.prior for s in failed_scores])
            # Place at the right edge of the plot as they have no separation data
            xs_failed = np.full(len(failed_scores), 5e4)
            ax.scatter(
                xs_failed, ys_failed,
                c="grey", s=30, alpha=0.5, marker="x", zorder=3,
                label="Propagation failed (posterior=prior)",
            )

        # Annotate top-5 highest-posterior satellites
        top5 = [s for s in scores if not s.propagation_failed and s.min_separation_km < 1e9][:5]
        for s in top5:
            ax.annotate(
                str(s.norad_cat_id),
                xy=(s.min_separation_km, s.posterior),
                xytext=(8, 4),
                textcoords="offset points",
                fontsize=8,
                color=country_colour.get(s.country_code, "black"),
                fontweight="bold",
            )

    # 100 km threshold marker
    ax.axvline(100.0, color="orange", linewidth=1.5, linestyle=":", label="100 km threshold")

    ax.set_xscale("log")
    ax.set_xlim(1, 1e5)
    ax.set_ylim(-0.02, 1.02)
    ax.set_xlabel("Minimum Separation Distance (km)", fontsize=12)
    ax.set_ylabel("Posterior Threat Probability  P(threat | x)", fontsize=12)
    ax.set_title("Bayesian Posterior Threat Assessment", fontsize=13, fontweight="bold")
    ax.legend(loc="upper right", fontsize=10)
    ax.grid(True, which="both", alpha=0.3)

    # Footnote explaining marker size
    fig.text(
        0.5, 0.01,
        "Marker area ∝ hours within 100 km threshold",
        ha="center", fontsize=9, color="grey",
    )

    fig.tight_layout(rect=[0, 0.03, 1, 1])
    fig.savefig(output_path, dpi=150)
    log.info("Saved posterior plot to '%s'.", output_path)
    return fig
