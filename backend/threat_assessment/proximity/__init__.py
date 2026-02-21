"""
Satellite Threat Assessment System.

A Bayesian inference pipeline for assessing the threat level of foreign satellites
based on proximity indicators derived from Space-Track orbital data.

Usage:
    python -m threat_assessment.main

Environment variables:
    SPACETRACK_USER   Space-Track.org account email
    SPACETRACK_PASS   Space-Track.org account password

    Note: these are intentionally different from the legacy spacetrack_loader.py
    variables (SPACETRACK_IDENTITY / SPACETRACK_PASSWORD).
"""

