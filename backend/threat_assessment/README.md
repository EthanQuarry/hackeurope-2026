# LEO Defence — Satellite Proximity Threat Assessment

A Bayesian inference pipeline for assessing the threat level of foreign satellites based on proximity to a target CubeSat constellation. Uses live orbital data from Space-Track.org and SGP4 orbit propagation to score satellites by how likely their observed close-approach behaviour is consistent with an inspector/interceptor rather than routine operations.

---

## How it works

### 1. Data ingestion
Current GP (General Perturbations) orbital elements are pulled from Space-Track.org for all active payload objects. API responses are cached locally to respect Space-Track rate limits (GP: 1 request/hour, SATCAT: 1 request/day).

### 2. Orbit propagation
For each satellite under assessment, positions are propagated forward over a **30-day window at 10-minute intervals** (4,320 timesteps) using the SGP4 algorithm. This gives a dense picture of orbital geometry including any close-approach windows driven by the relative precession of orbital planes.

### 3. Proximity metrics
Two metrics are computed for each foreign satellite against the target constellation:
- **Minimum separation** — closest approach distance (km) to any target satellite over the window
- **Dwell time** — cumulative hours any target satellite was within 100 km

### 4. Bayesian scoring

The system models two hypotheses for each observed minimum separation *x*:

| Distribution | Description |
|---|---|
| **P(x \| benign)** | Empirically fitted log-normal from ~500 random non-adversarial satellites (US, UK, JPN, ESA, FR) propagated against the same targets |
| **P(x \| threat)** | Expert-informed log-normal (μ=3.5, σ=1.2) placing most mass between 1–500 km, representing known inspector satellite operational stand-off distances |

The **likelihood ratio** LR = P(x | threat) / P(x | benign) quantifies how much more consistent the observation is with threat behaviour than routine operations.

The **prior** P(threat) is assigned from observable satellite characteristics before any proximity evidence is considered:

| Factor | Value |
|---|---|
| Country: PRC or CIS (Russia) | 0.05 |
| Country: all others | 0.005 |
| RCS size: SMALL | ×1.5 multiplier |

The **posterior** is computed via Bayes' rule:

```
P(threat | x) = LR × prior / (LR × prior + (1 − prior))
```

---

## Outputs

| File | Description |
|---|---|
| `threat_scores.csv` | Full ranked table of all assessed adversarial satellites |
| `distributions.png` | Benign vs threat PDF curves overlaid with observed separation histograms |
| `posteriors.png` | Posterior probability curve with scored satellites as a scatter plot |

The console prints the top 20 highest-threat satellites and a summary including the fitted benign distribution parameters.

---

## Setup

**Requirements:** Python 3.11+

```bash
pip install -r requirements.txt
```

**Environment variables:**

```bash
export SPACETRACK_USER=your@email.com
export SPACETRACK_PASS=yourpassword
```

> These are separate from the variables used by the legacy `spacetrack_loader.py` (`SPACETRACK_IDENTITY` / `SPACETRACK_PASSWORD`).

**Run:**

```bash
python -m threat_assessment.main
```

---

## Configuration

All key parameters are module-level constants at the top of [threat_assessment/data_pipeline.py](threat_assessment/data_pipeline.py):

| Constant | Default | Description |
|---|---|---|
| `TARGET_NORAD_IDS` | 5 CubeSats | NORAD IDs of the constellation to protect |
| `ADVERSARIAL_COUNTRIES` | `{"PRC", "CIS"}` | Country codes assessed for threat scoring |
| `BENIGN_COUNTRIES` | `{"US", "UK", "JPN", "ESA", "FR"}` | Country codes used to fit the benign distribution |
| `WINDOW_DAYS` | 30 | Propagation window length |
| `INTERVAL_MINUTES` | 10 | Propagation timestep cadence |
| `PROXIMITY_THRESHOLD_KM` | 100 | Distance threshold for dwell-time computation |

Threat distribution parameters are in [threat_assessment/distributions.py](threat_assessment/distributions.py):

| Constant | Default | Description |
|---|---|---|
| `THREAT_MU` | 3.5 | Mean of log(separation\_km) — median ≈ 33 km |
| `THREAT_SIGMA` | 1.2 | Std dev of log(separation\_km) |

Prior values are in [threat_assessment/bayesian_scorer.py](threat_assessment/bayesian_scorer.py):

| Constant | Default | Description |
|---|---|---|
| `PRIOR_ADVERSARIAL` | 0.05 | Base prior for PRC/CIS satellites |
| `PRIOR_BENIGN` | 0.005 | Base prior for all others |
| `SMALL_RCS_MULTIPLIER` | 1.5 | Prior multiplier for SMALL RCS satellites |

---

## Package structure

```
threat_assessment/
├── data_pipeline.py    — Space-Track fetch, caching, SGP4 propagation, proximity metrics
├── distributions.py    — Log-normal fitting (benign) and expert parameterisation (threat)
├── bayesian_scorer.py  — Prior assignment, Bayesian update, ThreatScore dataclass
├── visualisation.py    — Console table, CSV writer, distribution and posterior plots
└── main.py             — Orchestrator entry point
```

---

## Caveats and assumptions

- **Proximity ≠ intent.** A high posterior score surfaces a satellite for further investigation; it does not constitute a determination of hostile intent. Many legitimate operations (rendezvous, inspection of own assets, formation flying) produce close approaches.
- **Benign baseline.** The benign distribution is fitted from minimum separations of a random sample of non-adversarial satellites against the target constellation over a 30-day window. Satellites in similar orbital regimes will naturally have smaller minimum separations. The pipeline does not account for orbital plane alignment — a benign satellite in a near-identical orbit will receive an artificially elevated score.
- **TLE age.** SGP4 accuracy degrades with TLE age, particularly for high-drag LEO objects. The `epoch > now-30` filter applied during the GP fetch limits elements to those updated within the last 30 days, but predicted positions at the end of the 30-day window will carry more uncertainty than those at the start.
- **Country code as prior.** The prior is a blunt instrument — it reflects historical patterns of proximity operations, not individual satellite purpose. Many PRC and CIS satellites are unambiguously non-threatening (weather satellites, GNSS, comms).
- **Target constellation.** The five hardcoded NORAD IDs are placeholders. Replace `TARGET_NORAD_IDS` in `data_pipeline.py` with the IDs of your actual constellation.
