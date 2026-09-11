#!/usr/bin/env python3
"""Check one firmdrama flag against the current hashes in a lab's ``lab.yml``.

Usage:

    python scripts/check.py
    python scripts/check.py path/to/firmdrama

Zero dependencies. Prompts for one captured flag. Prints ``checkpoint solved``
for the intermediate flag or ``solved`` for the final flag, and exits 0 on a
match. Prints ``not solved`` and exits 1 otherwise.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
import re
import sys


HASH_FIELDS = {"flag_hash", "checkpoint_flag_hash"}
HASH_LINE_RE = re.compile(
    r"^(flag_hash|checkpoint_flag_hash):[ \t]*([0-9a-f]{64})[ \t]*(?:#.*)?$",
    re.MULTILINE,
)


def read_flag_hashes(lab: Path) -> dict[str, str]:
    """Read exactly one valid final and checkpoint digest from lab metadata."""
    text = (lab / "lab.yml").read_text(encoding="utf-8")
    matches = list(HASH_LINE_RE.finditer(text))
    hashes = {match.group(1): match.group(2) for match in matches}
    if len(matches) != 2 or set(hashes) != HASH_FIELDS:
        raise ValueError("lab.yml must contain one valid flag_hash and checkpoint_flag_hash.")
    return hashes


def flag_stage(flag: str, hashes: dict[str, str]) -> str | None:
    """Return the matched stage without retaining or displaying the flag."""
    digest = hashlib.sha256(flag.encode("utf-8")).hexdigest()
    if digest == hashes["checkpoint_flag_hash"]:
        return "checkpoint"
    if digest == hashes["flag_hash"]:
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
    except (OSError, ValueError) as error:
        print(str(error))
        return 2

    try:
        flag = input("flag: ").strip()
    except EOFError:
        print()
        return 2

    stage = flag_stage(flag, hashes)
    if stage == "checkpoint":
        print("checkpoint solved")
        return 0
    if stage == "final":
        print("solved")
        return 0

    print("not solved")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
