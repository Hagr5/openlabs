"""
Phase 7/8: unit tests for shared.validation's blocklist.

metadata-service stays blocked (its ONLY protection is hostname-hiding
via this blocklist -- V4). internal-vault-api is deliberately NOT
blocked (Phase 8, DESIGN.md section 9) -- its protection is a genuine
Bearer-token auth boundary (V5), not hostname-hiding; hiding it too
would just repeat the V3 lesson rather than teach V6. sample-library is
likewise deliberately not blocked (that omission is V3's mechanism).
"""

import pytest

from shared.validation import SourceValidationError, validate_source


def test_metadata_service_is_blocked():
    with pytest.raises(SourceValidationError):
        validate_source("http://metadata-service:9100/metadata/identity")


def test_internal_vault_api_is_allowed():
    # REST, not GraphQL -- see DESIGN.md section 9's transport decision.
    # Not blocked: see module docstring above.
    result = validate_source("http://internal-vault-api:9300/vault/assume-worker")
    assert result == "http://internal-vault-api:9300/vault/assume-worker"


def test_sample_library_is_allowed():
    # Not an oversight -- see shared/validation.py's BLOCKED_HOSTNAMES
    # comment and DESIGN.md section 6/7.
    result = validate_source("http://sample-library:9200/library/sample.pdf")
    assert result == "http://sample-library:9200/library/sample.pdf"


def test_localhost_is_still_blocked():
    with pytest.raises(SourceValidationError):
        validate_source("http://localhost/whatever")
