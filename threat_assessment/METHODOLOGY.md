# Bayesian Inference Methodology

This document describes the statistical framework used to compute posterior threat probability scores for satellites tracked near a target constellation.

---

## Problem statement

Given an observed minimum separation distance *x* between a foreign satellite and the target constellation over a 30-day window, what is the probability that the satellite is behaving in a manner consistent with an inspector or proximity-operations platform, rather than routine operations?

This is a binary hypothesis testing problem:

- **H₀ (benign):** The satellite is operating normally. Its close approach to the target constellation is incidental, driven by orbital mechanics.
- **H₁ (threat):** The satellite is conducting deliberate proximity operations against the target constellation.

---

## Bayes' theorem

The posterior probability of the threat hypothesis given observation *x* is:

```
P(H₁ | x) =        P(x | H₁) · P(H₁)
             ──────────────────────────────────────────────
             P(x | H₁) · P(H₁) + P(x | H₀) · P(H₀)
```

Dividing numerator and denominator by P(x | H₀) and substituting the **likelihood ratio** LR = P(x | H₁) / P(x | H₀):

```
P(H₁ | x) =        LR · prior
             ──────────────────────────────
             LR · prior + (1 − prior)
```

where `prior` = P(H₁) before any proximity evidence is observed.

This is implemented in `bayesian_scorer.compute_posterior()`.

---

## The likelihood ratio

The likelihood ratio LR quantifies how much more probable the observed separation *x* is under H₁ than under H₀:

```
LR(x) = P(x | threat) / P(x | benign)
```

- **LR >> 1:** the observation is far more consistent with threat behaviour — the posterior is pushed well above the prior.
- **LR ≈ 1:** the observation provides no discriminating information — the posterior equals the prior.
- **LR << 1:** the observation is more consistent with benign behaviour — the posterior is pushed below the prior.

Both distributions are modelled as log-normals. The LR is computed pointwise at the observed minimum separation in `distributions.likelihood_ratio()`.

---

## P(x | benign) — the benign distribution

### Why log-normal

Minimum separation distances between satellites are strictly positive and span several orders of magnitude — from a few km for deliberate rendezvous to tens of thousands of km for satellites in completely different orbital regimes. The log-normal is the natural choice: it is the maximum-entropy distribution for a positive, multiplicatively-varying quantity, and it fits orbital separation data well empirically.

### Empirical fitting

A random sample of 500 active payload satellites from non-adversarial nations (US, UK, JPN, ESA, FR) is propagated over the same 30-day window against the target constellation. The minimum separation of each satellite against the constellation is computed. These 500 values constitute an empirical sample of "what close approaches look like for random, uninteresting satellites."

A log-normal is fit to this sample via **maximum likelihood estimation** using `scipy.stats.lognorm.fit()` with the location fixed at zero (`floc=0`). The zero-location constraint is physically correct: separation distance cannot be negative.

The scipy parameterisation:

```
shape, loc, scale = lognorm.fit(data, floc=0)

mu    = log(scale)   # mean of log(x)
sigma = shape        # std dev of log(x)
```

From the actual run on Space-Track data (Feb 2026):

```
Fitted benign: LogNormal(mu=5.063, sigma=1.369, median=158 km, mean=404 km)
```

The median of ~158 km reflects that even random, non-threatening satellites occasionally pass within a few hundred km of the target due to shared orbital inclinations. The large sigma reflects the wide spread from tens of km (coincidentally similar orbits) to tens of thousands of km (different planes entirely).

### What the benign distribution tells us

A satellite with minimum separation of, say, 5 km is in the extreme left tail of the benign distribution. The benign PDF at 5 km is very small — such close approaches almost never happen by chance for unrelated satellites. The threat PDF at 5 km, by contrast, is relatively large. The LR at 5 km is therefore high, driving the posterior well above the prior.

A satellite at 5,000 km is near the mode of the benign distribution. It is exactly what you expect from a random satellite. The LR at 5,000 km is near 1, and the posterior sits close to the prior.

---

## P(x | threat) — the threat distribution

### Motivation

There is no large empirical sample of confirmed hostile inspector satellites to fit a distribution from. The threat distribution is therefore an **expert-informed prior** based on open-source reporting of known proximity operations:

- The Russian Kosmos inspector satellite series (e.g. Kosmos 2542/2543) operated at stand-off distances of roughly 150–300 km in the initial approach phase, closing to tens of km during the inspection phase.
- Chinese SJ (Shijian) proximity operations satellites have demonstrated similar patterns.
- Published analyses of co-orbital anti-satellite (ASAT) activities place operationally significant approach distances in the 1–500 km range, with the most diagnostically meaningful activity below 100 km.

### Parameters

A log-normal with:

```
mu    = 3.5   →  median = exp(3.5) ≈ 33 km
sigma = 1.2
```

The 5th–95th percentile range under this distribution is approximately **2 km to 500 km**, which is consistent with the range of operationally reported stand-off distances. The distribution deliberately places substantial probability mass below 100 km, where routine non-threatening satellites almost never go relative to an unrelated constellation.

These parameters are configurable in `distributions.py` (`THREAT_MU`, `THREAT_SIGMA`).

---

## The prior P(H₁)

The prior represents the probability of H₁ before examining any proximity evidence. It is assigned from observable satellite metadata.

### Country of origin

```
P(threat) = 0.05   if country ∈ {PRC, CIS}
P(threat) = 0.005  otherwise
```

A prior of 0.05 means that, absent any proximity evidence, 1 in 20 PRC/CIS payloads is assessed as potentially operating in a threat-class mode. This is conservative: it means the vast majority of Chinese and Russian satellites are presumed benign by default, and substantial proximity evidence is required to push the posterior to materially elevated levels.

The asymmetry between adversarial (0.05) and non-adversarial (0.005) priors reflects documented patterns of deliberate proximity operations — such programmes are disproportionately associated with certain state actors in the open-source record.

### RCS size modifier

```
if RCS_SIZE == "SMALL":
    prior = min(prior × 1.5, 1.0)
```

Inspector satellites often have a smaller radar cross-section than their stated mission would suggest. Small RCS can indicate a compact, manoeuvrable bus consistent with a proximity operations platform. The 1.5× multiplier is modest, reflecting weak but non-negligible correlation.

### Prior table

| Country | RCS | Prior |
|---|---|---|
| PRC / CIS | not SMALL | 0.0500 |
| PRC / CIS | SMALL | 0.0750 |
| Other | not SMALL | 0.0050 |
| Other | SMALL | 0.0075 |

---

## Worked example

**COSMOS 2567** (NORAD 55978) — the top-scoring satellite in the Feb 2026 run:

| Field | Value |
|---|---|
| Country | CIS |
| RCS size | LARGE |
| Min separation | 4.4 km |
| Prior | 0.0500 |

Step 1 — evaluate P(x | threat) at x = 4.4 km:
```
P(4.4 | threat) = lognorm.pdf(4.4, s=1.2, scale=exp(3.5)) ≈ 0.0372
```

Step 2 — evaluate P(x | benign) at x = 4.4 km:
```
P(4.4 | benign) = lognorm.pdf(4.4, s=1.369, scale=exp(5.063)) ≈ 0.00219
```

Step 3 — likelihood ratio:
```
LR = 0.0372 / 0.00219 ≈ 8.48
```

Step 4 — posterior:
```
posterior = (8.48 × 0.05) / (8.48 × 0.05 + 0.95) ≈ 0.3087
```

A close approach of 4.4 km to the target constellation raises the probability of threat-class behaviour from the 5% prior to **31%** — a 6× increase driven entirely by the proximity evidence.

---

## Handling missing observations

Where SGP4 propagation fails for a satellite (stale or malformed TLE), no proximity evidence is available. The correct Bayesian treatment of a missing observation is to leave the posterior equal to the prior: LR is set to 1.0, which leaves the update equation unchanged. These satellites appear in the output table marked with `*` and their posterior equals their prior exactly.

---

## Limitations

**Single indicator.** The current implementation uses proximity (minimum separation) as the sole observable. A more complete model would incorporate additional indicators — e.g. manoeuvre history, RCS changes, co-orbital phasing — each contributing their own likelihood ratio in a compound Bayesian update.

**Independence assumption.** The Bayesian update treats the minimum separation observation as a single summary statistic drawn independently from the distribution. In reality, the minimum separation is a function of correlated orbital mechanics over the full 30-day window. The true sufficient statistic for this problem is the full trajectory, not just its minimum. The single-statistic approximation is conservative and operationally useful but not theoretically exact.

**Benign baseline geometry.** The benign distribution is fitted from a random sample of satellites without controlling for orbital regime. A benign satellite in a near-identical orbit (similar inclination, altitude, RAAN) will have a smaller minimum separation than one in a completely different plane, and will receive an inflated LR and posterior. Conditioning the benign sample on orbital similarity to the target constellation would reduce this effect at the cost of a smaller fitting sample.

**Prior subjectivity.** The country-of-origin prior and threat distribution parameters are expert judgements, not empirically calibrated values. They encode assumptions about the base rate of hostile proximity operations that are inherently uncertain. Sensitivity analysis — running the model over a range of prior values and threat distribution parameters — is recommended before drawing operational conclusions.

**Posterior calibration.** A posterior of 0.31 does not mean there is a 31% chance the satellite is actively hostile. It means the model, given its prior assumptions and the proximity evidence, assigns 31% probability to the threat hypothesis. The absolute magnitude of the posterior is sensitive to the prior. The *relative* ordering of satellites by posterior is more reliable than the absolute values.
