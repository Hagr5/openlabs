#!/usr/bin/env python3
"""Check a flag against a lab's hashes.

Usage:
    python3 scripts/check.py labs/web/duck-cross
    python3 scripts/check.py          # run from inside a lab directory

Zero dependencies. A valid `flag_hash` prints `solved` and exits 0. An
optional `checkpoint_flag_hash` prints `checkpoint solved` and exits 0.
Malformed hash fields and usage errors exit 2. A non-matching flag exits 1.

Hash fields must use the exact form `field_name: <64 lowercase hex characters>`.
Quoted values, inline comments, duplicate fields, and extra text are rejected.
"""

import hashlib
import hmac
import re
import sys
from pathlib import Path

FINAL_HASH_FIELD = "flag_hash"
CHECKPOINT_HASH_FIELD = "checkpoint_flag_hash"
HASH_LINE_RE = re.compile(r"^(flag_hash|checkpoint_flag_hash): ([0-9a-f]{64})$")
HASH_FIELD_PREFIX_RE = re.compile(r"^[ \t]*(flag_hash|checkpoint_flag_hash)\b")


def read_flag_hashes(lab: Path) -> dict[str, str]:
    """Read one strict final hash and an optional strict checkpoint hash."""
    hashes: dict[str, str] = {}
    metadata = lab / "lab.yml"

    for line_number, line in enumerate(metadata.read_text(encoding="utf-8").splitlines(), start=1):
        field = HASH_FIELD_PREFIX_RE.match(line)
        if field is None:
            continue

        key = field.group(1)
        match = HASH_LINE_RE.fullmatch(line)
        if match is None:
            raise ValueError(
                f"lab.yml in {lab} has invalid {key} on line {line_number}; "
                f"expected `{key}: <64 lowercase hex characters>`"
            )
        if key in hashes:
            raise ValueError(f"lab.yml in {lab} has duplicate {key} on line {line_number}")
        hashes[key] = match.group(2)

    if FINAL_HASH_FIELD not in hashes:
        raise ValueError(f"lab.yml in {lab} has no {FINAL_HASH_FIELD}")
    return hashes


def flag_stage(flag: str, hashes: dict[str, str]) -> str | None:
    """Return the matched stage without retaining or displaying the flag."""
    digest = hashlib.sha256(flag.encode("utf-8")).hexdigest()
    checkpoint = hashes.get(CHECKPOINT_HASH_FIELD)
    if checkpoint is not None and hmac.compare_digest(digest, checkpoint):
        return "checkpoint"
    if hmac.compare_digest(digest, hashes[FINAL_HASH_FIELD]):
        return "final"
    return None


def main() -> int:
    if len(sys.argv) > 2:
        print("usage: check.py [lab directory]")
        return 2

    lab = Path(sys.argv[1]) if len(sys.argv) == 2 else Path(".")
    metadata = lab / "lab.yml"
    if not metadata.is_file():
        print(f"no lab.yml in {lab}")
        return 2

    try:
        hashes = read_flag_hashes(lab)
    except OSError:
        print(f"could not read {metadata}")
        return 2
    except UnicodeError:
        print(f"lab.yml in {lab} is not valid UTF-8")
        return 2
    except ValueError as error:
        print(str(error))
        return 2

    try:
        flag = input("flag: ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        print("flag input cancelled")
        return 2

    try:
        stage = flag_stage(flag, hashes)
    except UnicodeError:
        print("flag input could not be encoded as UTF-8")
        return 2

    if stage == "checkpoint":
        print("checkpoint solved")
        return 0
    if stage == "final":
        print("solved")
        return 0

    print("not solved")
    return 1


if __name__ == "__main__":
    sys.exit(main())
