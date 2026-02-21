"""
Statistical distribution models for the satellite threat assessment system.

Two distributions are used to characterise minimum separation distances
between satellites and the target constellation:

Benign distribution — P(x | benign)
    Fitted empirically from the observed minimum separations of a large
    random sample of non-adversarial satellites vs the target constellation.
    A log-normal model is used because orbital separations are strictly
    positive and typically span several orders of magnitude. The log-normal
    is fit via scipy MLE with the location fixed at zero (floc=0), which is
    the physically correct constraint (separation cannot be negative).

Threat distribution — P(x | threat)
    Expert-informed log-normal representing the expected separation distribution
    for an adversarial inspector satellite conducting proximity operations.
    Parameters are drawn from open-source analysis of known co-orbital
    inspection campaigns (e.g. Russian Kosmos series, Chinese SJ satellites):

        mu    = 3.5   → median separation ≈ exp(3.5) ≈ 33 km
        sigma = 1.2   → log-space std dev giving 5th–95th percentile range
                        roughly 2–500 km, consistent with operational stand-off
                        distances observed in reported inspection events.

    Both mu and sigma are module-level constants and can be overridden
    at call time without modifying this file.

scipy lognormal parameterisation mapping:
    Given our (mu, sigma) — the mean and std of log(x) — the scipy call is:
        lognorm.pdf(x, s=sigma, scale=exp(mu), loc=0)
    And for fitting:
        shape, loc, scale = lognorm.fit(data, floc=0)
        sigma = shape
        mu    = log(scale)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
from scipy.stats import lognorm

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Expert-informed threat distribution parameters (configurable)
# ---------------------------------------------------------------------------

# mu: mean of log(separation_km); exp(3.5) ≈ 33 km median
THREAT_MU: float = 3.5

# sigma: std dev of log(separation_km); wider distribution = more uncertainty
THREAT_SIGMA: float = 1.2


# ---------------------------------------------------------------------------
# Dataclass
# ---------------------------------------------------------------------------


@dataclass
class DistributionParams:
    """
    Parameters for a zero-location log-normal distribution.

    Attributes:
        mu:    mean of log(x)         — equivalently, log(median)
        sigma: std dev of log(x)      — shape parameter in scipy lognorm

    scipy call:
        lognorm.pdf(x, s=sigma, scale=exp(mu), loc=0)
    """

    mu: float
    sigma: float

    @property
    def median(self) -> float:
        """Median of the distribution (exp(mu))."""
        return float(np.exp(self.mu))

    @property
    def mean(self) -> float:
        """Mean of the distribution (exp(mu + sigma^2 / 2))."""
        return float(np.exp(self.mu + 0.5 * self.sigma ** 2))

    def __str__(self) -> str:
        return (
            f"LogNormal(mu={self.mu:.4f}, sigma={self.sigma:.4f}, "
            f"median={self.median:.1f} km, mean={self.mean:.1f} km)"
        )


# ---------------------------------------------------------------------------
# Fitting and parameterisation
# ---------------------------------------------------------------------------


def fit_benign_distribution(min_separations_km: np.ndarray) -> DistributionParams:
    """
    Fit a log-normal distribution to observed benign minimum separations.

    Uses scipy MLE with the location fixed at zero (floc=0).  The zero-location
    constraint is physically motivated: separation distances are strictly positive
    and the distribution should have no left-shift.

    Args:
        min_separations_km: array of minimum separation distances (km) from the
                            benign sample against the target constellation.
                            May contain NaN (failed propagations) and will be
                            filtered before fitting.

    Returns:
        DistributionParams with fitted mu and sigma.

    Raises:
        ValueError: if fewer than 10 valid (finite, positive) samples remain
                    after filtering — not enough data to fit reliably.
    """
    # Remove NaN, inf, and non-positive values
    valid = min_separations_km[np.isfinite(min_separations_km) & (min_separations_km > 0)]
    if len(valid) < 10:
        raise ValueError(
            f"Only {len(valid)} valid benign separation values after filtering; "
            "need at least 10 to fit the benign distribution. "
            "Check that the benign sample propagated successfully."
        )

    # scipy MLE fit with fixed location=0
    # shape=sigma (std dev of log(x)), loc=0 (fixed), scale=exp(mu)
    shape, _loc, scale = lognorm.fit(valid, floc=0)
    mu = float(np.log(scale))
    sigma = float(shape)

    params = DistributionParams(mu=mu, sigma=sigma)
    log.info(
        "Fitted benign distribution from %d samples: %s",
        len(valid), params,
    )
    return params


def get_threat_distribution(
    mu: float = THREAT_MU,
    sigma: float = THREAT_SIGMA,
) -> DistributionParams:
    """
    Return the expert-informed threat distribution parameters.

    No empirical fitting — these are informed priors based on open-source
    analysis of known inspector satellite operational patterns.

    Args:
        mu:    mean of log(separation_km), default 3.5 → median ≈ 33 km
        sigma: std dev of log(separation_km), default 1.2

    Returns:
        DistributionParams
    """
    params = DistributionParams(mu=mu, sigma=sigma)
    log.info("Threat distribution (expert-informed): %s", params)
    return params


# ---------------------------------------------------------------------------
# PDF evaluation
# ---------------------------------------------------------------------------


def pdf_lognormal(x: np.ndarray | float, params: DistributionParams) -> np.ndarray:
    """
    Evaluate log-normal PDF at x.

    Args:
        x:      separation distance(s) in km (scalar or array)
        params: DistributionParams from fit_benign_distribution() or
                get_threat_distribution()

    Returns:
        PDF values, same shape as x.  Values at x <= 0 are 0.0.
    """
    x_arr = np.atleast_1d(np.asarray(x, dtype=np.float64))
    # Clamp to a small positive value to avoid log(0) internally
    x_safe = np.where(x_arr > 0, x_arr, 1e-6)
    result = lognorm.pdf(x_safe, s=params.sigma, scale=np.exp(params.mu), loc=0)
    # Zero out any positions where x was actually <= 0
    result = np.where(x_arr > 0, result, 0.0)
    return result


# ---------------------------------------------------------------------------
# Likelihood ratio
# ---------------------------------------------------------------------------


def likelihood_ratio(
    x: float,
    benign_params: DistributionParams,
    threat_params: DistributionParams,
    epsilon: float = 1e-12,
) -> float:
    """
    Compute the likelihood ratio LR = P(x | threat) / P(x | benign).

    A large LR means x is much more consistent with threat behaviour than
    benign behaviour and will drive the posterior upward from the prior.

    Args:
        x:             observed minimum separation in km
        benign_params: fitted log-normal parameters for benign distribution
        threat_params: expert-informed log-normal parameters for threat distribution
        epsilon:       minimum denominator value (prevents division by zero when
                       the benign PDF is effectively zero at very small separations)

    Returns:
        LR as a float.  Returns 0.0 for x <= 0 (impossible observation).
    """
    if x <= 0:
        return 0.0

    threat_pdf = float(pdf_lognormal(x, threat_params)[0])
    benign_pdf = float(pdf_lognormal(x, benign_params)[0])

    # Clamp denominator to epsilon to avoid division by zero
    # (can occur if x is in a very low-density region of the benign distribution)
    lr = threat_pdf / max(benign_pdf, epsilon)
    return lr
