"""
Bayesian threat scoring for the satellite threat assessment system.

The Bayesian update rule used here is the standard two-hypothesis form:

    P(threat | x) = P(x | threat) * P(threat)
                    ──────────────────────────────────────
                    P(x | threat) * P(threat) + P(x | benign) * P(benign)

Equivalently, using the likelihood ratio LR = P(x|threat) / P(x|benign):

    P(threat | x) =        LR * prior
                    ──────────────────────────────
                    LR * prior + (1 - prior)

Prior assignment:
    The prior P(threat) is a function of observable satellite characteristics:

    1. Country of origin:
        PRC, RUS → base prior 0.05  (1-in-20 satellites assessed as potentially
                                     threatening before any proximity evidence)
        Others   → base prior 0.005 (baseline for non-adversarial operators)

    2. RCS size:
        SMALL satellites have a lower radar cross-section, making them harder
        to track and inspect.  Inspector satellites often have smaller RCS.
        SMALL → multiply base prior by 1.5x (clamped to 1.0)

    Note on prior magnitude: A prior of 0.05 is intentionally conservative.
    The system is designed to surface candidates for further investigation,
    not to assign definitive threat labels.  The posterior should be read as
    "probability of being a threat-class proximity satellite" given the prior
    assumptions and the observed separation data.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from threat_assessment.data_pipeline import ProximityResult
from threat_assessment.distributions import (
    DistributionParams,
    likelihood_ratio as compute_lr,
)

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration constants
# ---------------------------------------------------------------------------

# Base prior for adversarial-nation satellites
PRIOR_ADVERSARIAL: float = 0.05

# Base prior for all other nations
PRIOR_BENIGN: float = 0.005

# Country codes that receive the adversarial base prior.
# The GP catalog uses "PRC" for China and "CIS" for Russia/former Soviet states.
ADVERSARIAL_COUNTRIES: frozenset[str] = frozenset({"PRC", "CIS"})

# Multiplier applied to prior when RCS_SIZE == "SMALL"
SMALL_RCS_MULTIPLIER: float = 1.5


# ---------------------------------------------------------------------------
# Dataclass
# ---------------------------------------------------------------------------


@dataclass
class ThreatScore:
    """
    Full Bayesian threat assessment result for one satellite.

    Fields:
        norad_cat_id:      NORAD catalog number
        object_name:       object name from Space-Track catalog
        country_code:      country of origin (e.g. "PRC", "RUS")
        rcs_size:          radar cross-section size class ("SMALL", "MEDIUM", "LARGE", "")
        min_separation_km: minimum separation from any target satellite over 30-day window
        hours_within_100km: cumulative hours any target was within 100 km threshold
        prior:             P(threat) before proximity evidence
        likelihood_ratio:  LR = P(x | threat) / P(x | benign)
        posterior:         P(threat | x) after Bayesian update
        propagation_failed: True if SGP4 failed for all timesteps (posterior = prior)
    """

    norad_cat_id: int
    object_name: str
    country_code: str
    rcs_size: str
    min_separation_km: float
    hours_within_100km: float
    prior: float
    likelihood_ratio: float
    posterior: float
    propagation_failed: bool


# ---------------------------------------------------------------------------
# Prior and posterior computation
# ---------------------------------------------------------------------------


def compute_prior(country_code: str, rcs_size: str) -> float:
    """
    Compute the prior probability P(threat) for a satellite.

    Args:
        country_code: Space-Track COUNTRY_CODE field (e.g. "PRC", "USA")
        rcs_size:     Space-Track RCS_SIZE field ("SMALL", "MEDIUM", "LARGE", "")

    Returns:
        Prior probability in (0, 1].
    """
    base = PRIOR_ADVERSARIAL if country_code in ADVERSARIAL_COUNTRIES else PRIOR_BENIGN
    if rcs_size == "SMALL":
        base = min(base * SMALL_RCS_MULTIPLIER, 1.0)
    return base


def compute_posterior(prior: float, lr: float) -> float:
    """
    Bayesian update: compute P(threat | x) from prior and likelihood ratio.

    Formula:
        posterior = (LR * prior) / (LR * prior + (1 - prior))

    Args:
        prior: P(threat) — value in [0, 1]
        lr:    likelihood ratio LR = P(x|threat) / P(x|benign)

    Returns:
        Posterior probability clamped to [0.0, 1.0].
    """
    if prior <= 0.0:
        return 0.0
    if prior >= 1.0:
        return 1.0

    numerator = lr * prior
    denominator = numerator + (1.0 - prior)

    if denominator == 0.0:
        # Only occurs if prior == 0 (handled above) or lr == 0 and prior == 1
        return 0.0

    posterior = numerator / denominator
    # Clamp to [0, 1] to guard against floating-point edge cases
    return float(max(0.0, min(1.0, posterior)))


# ---------------------------------------------------------------------------
# Individual and batch scoring
# ---------------------------------------------------------------------------


def score_satellite(
    result: ProximityResult,
    benign_params: DistributionParams,
    threat_params: DistributionParams,
) -> ThreatScore:
    """
    Compute the full Bayesian threat score for one satellite.

    If propagation failed (all SGP4 timesteps returned errors), the satellite
    cannot be assessed on proximity evidence.  In this case the posterior equals
    the prior (LR = 1.0, no evidence update), which is the correct Bayesian
    treatment of a missing observation.

    Args:
        result:        ProximityResult from data_pipeline.run_pipeline()
        benign_params: fitted log-normal parameters for P(x | benign)
        threat_params: expert log-normal parameters for P(x | threat)

    Returns:
        ThreatScore dataclass.
    """
    prior = compute_prior(result.country_code, result.rcs_size)

    if result.propagation_failed:
        # No proximity evidence available — posterior equals prior
        lr = 1.0
        posterior = prior
    else:
        lr = compute_lr(result.min_separation_km, benign_params, threat_params)
        posterior = compute_posterior(prior, lr)

    return ThreatScore(
        norad_cat_id=result.norad_cat_id,
        object_name=result.object_name,
        country_code=result.country_code,
        rcs_size=result.rcs_size,
        min_separation_km=result.min_separation_km,
        hours_within_100km=result.hours_within_100km,
        prior=prior,
        likelihood_ratio=lr,
        posterior=posterior,
        propagation_failed=result.propagation_failed,
    )


def score_all(
    adversarial_results: list[ProximityResult],
    benign_params: DistributionParams,
    threat_params: DistributionParams,
) -> list[ThreatScore]:
    """
    Score all adversarial satellites and return them sorted by posterior (descending).

    Args:
        adversarial_results: ProximityResult list for PRC/RUS satellites
        benign_params:       fitted log-normal for the benign distribution
        threat_params:       expert log-normal for the threat distribution

    Returns:
        list of ThreatScore, sorted by posterior probability descending.
    """
    scores = [
        score_satellite(result, benign_params, threat_params)
        for result in adversarial_results
    ]
    scores.sort(key=lambda s: s.posterior, reverse=True)
    log.info(
        "Scored %d adversarial satellites. Top posterior: %.4f (NORAD %d).",
        len(scores),
        scores[0].posterior if scores else 0.0,
        scores[0].norad_cat_id if scores else -1,
    )
    return scores
