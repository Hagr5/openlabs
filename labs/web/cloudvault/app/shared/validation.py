"""
Shared URL validation policy for CloudVault.

Used at TWO separate points, on purpose:

  1. cloudvault-api's GraphQL resolvers (this phase, schema.py) -- decides
     whether a submitted source URL is acceptable to record as "validated"
     at create/update time.
  2. import-worker (Phase 4) -- will call this exact same function against
     the INITIAL URL it's about to fetch, as its first line of defense,
     before making any network request.

Sharing the function keeps both call sites consistently strict. There is
no reason for the API's opinion of "is this an acceptable source" to
differ from the worker's opinion of the same question -- if they drifted
apart, that drift itself would become an unintended vulnerability.

IMPORTANT: this function is NOT the SSRF defense by itself. It only
inspects the URL text you hand it -- it never makes a network request and
never resolves DNS. Phase 4 introduces a second, deliberately SEPARATE
concern: what the worker's HTTP client does AFTER the initial request,
specifically whether it follows a redirect to somewhere this function
would have rejected. Do not "fix" that here by making this function
redirect-aware -- it structurally can't be, and it must stay that way.
See DESIGN.md section 6 for why that separation is load-bearing for the
intended challenge.
"""

import ipaddress
from urllib.parse import urlparse

ALLOWED_SCHEMES = {"http", "https"}

# Exact-match internal hostnames rejected outright. Phase 7 locked these
# in per DESIGN.md section 6's "hard-block literal internal
# hostnames/IPs" decision.
#
# `sample-library` is DELIBERATELY ABSENT from this set. That omission,
# not anything else in this file, is the entire mechanism behind the
# redirect-based SSRF bypass (V3): a blocklist can only reject names its
# author thought to include, and a narratively-legitimate partner
# content host was never flagged as sensitive. Do not add
# `sample-library` here -- doing so would break the intended chain, not
# fix a vulnerability.
BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata-service",
    # internal-vault-api deliberately NOT blocked (Phase 8, DESIGN.md section 9):
    # its protection is a genuine Bearer-token auth boundary (V5), not
    # hostname-hiding. Hiding it behind a second SSRF redirect would just
    # repeat the V3 lesson rather than teach V6. This was previously
    # blocked as a placeholder before the container existed -- removed
    # once Phase 8 actually started, per this file's own docstring
    # principle that the API's and worker's opinion of "acceptable
    # source" must never silently drift from the design doc.
}


class SourceValidationError(ValueError):
    """
    Raised for any rejected source URL. The message must stay generic --
    never leak internal topology, DNS behavior, or which specific rule
    fired. A normal user should be able to act on it ("use an http(s)
    URL"); an attacker should not learn anything about the internal
    network from it.
    """


def _is_blocked_ip(literal: str) -> bool:
    try:
        ip = ipaddress.ip_address(literal)
    except ValueError:
        return False
    return (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_unspecified
        or ip.is_reserved
        or ip.is_multicast
    )


def validate_source(raw_url: str) -> str:
    """
    Validates `raw_url` against CloudVault's source policy and returns a
    normalized URL string on success. Raises SourceValidationError on any
    rejection.

    This is a LITERAL, static check only:
      - scheme must be http or https
      - a hostname must be present
      - the hostname must not be a known-blocked literal (localhost, etc.)
      - if the hostname IS a literal IP address, it must not be
        loopback / private / link-local / unspecified / reserved /
        multicast

    This function does NOT perform DNS resolution and does NOT follow
    redirects -- see the module docstring for why that boundary matters.
    """
    if not isinstance(raw_url, str) or not raw_url.strip():
        raise SourceValidationError("Source must be a non-empty URL.")

    try:
        parsed = urlparse(raw_url.strip())
    except Exception as exc:
        raise SourceValidationError("Source could not be parsed as a URL.") from exc

    scheme = (parsed.scheme or "").lower()
    if scheme not in ALLOWED_SCHEMES:
        raise SourceValidationError("Source must use http or https.")

    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise SourceValidationError("Source must include a hostname.")

    if hostname in BLOCKED_HOSTNAMES:
        raise SourceValidationError("Source host is not permitted.")

    if _is_blocked_ip(hostname):
        raise SourceValidationError("Source host is not permitted.")

    normalized = parsed._replace(scheme=scheme, netloc=parsed.netloc.lower())
    return normalized.geturl()
