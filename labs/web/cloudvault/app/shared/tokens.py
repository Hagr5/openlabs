"""
Single source of truth for the synthetic worker token, shared between
metadata-service (issues it) and internal-vault-api (validates it -- V5).

Previously this constant was duplicated separately in each service.
Moved here for the same reason shared/validation.py exists: two
independent copies of a value that MUST agree can silently drift, and
that drift would itself become an unintended bug (either V5 stops
validating correctly, or metadata-service and internal-vault-api
disagree about what a "valid" token even is).

This is a synthetic, CTF-local, disposable value -- never a real secret,
never derived from anything real, deterministic across resets (DESIGN.md
determinism requirement). Its value being fixed is not itself a
vulnerability; V5's own genuine check of it is what matters.
"""

WORKER_ROLE = "cloudvault-import-worker"
WORKER_TOKEN = "CV-LOCAL-EPHEMERAL-TOKEN-a1e9c3"
