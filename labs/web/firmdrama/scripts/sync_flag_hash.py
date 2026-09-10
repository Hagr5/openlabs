"""Update both hashes once after lab startup: python scripts/sync_flag_hash.py."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import sys


ROOT = Path(__file__).resolve().parents[1]
HASH_FIELDS = {"flag_hash", "checkpoint_flag_hash"}
HASH_LINE = re.compile(r"^(flag_hash|checkpoint_flag_hash):[ \t]*([^\r\n]*)", re.MULTILINE)
CONTAINER_READER = """
import hashlib
import json
from pathlib import Path
import re
from src.db import get_connection

content = Path('/home/olivia/DoNotOpenThisFolder/olivia.txt').read_text(encoding='utf-8')
flags = re.findall(r'duck\\{[a-z]{24}\\}', content)
assert len(flags) == 1
digest = hashlib.sha256(flags[0].encode('utf-8')).hexdigest()
with get_connection() as connection:
    with connection.cursor() as cursor:
        cursor.execute("SELECT stage, SHA2(value, 256) AS digest, reset_id FROM flags")
        rows = cursor.fetchall()
assert len(rows) == 2 and {row['stage'] for row in rows} == {'final', 'intermediate'}
assert len({row['reset_id'] for row in rows}) == 1
hashes = {row['stage']: row['digest'] for row in rows}
assert hashes['final'] == digest
print(json.dumps({'flag_hash': digest, 'checkpoint_flag_hash': hashes['intermediate']}))
"""


def validate_hashes(hashes: object) -> None:
    if not isinstance(hashes, dict) or set(hashes) != HASH_FIELDS or any(
        not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value)
        for value in hashes.values()
    ):
        raise ValueError("Expected SHA-256 digests for both final and checkpoint flags.")


def read_running_hashes() -> dict[str, str]:
    """Read both stages from one database snapshot and verify the final file."""
    try:
        result = subprocess.run(
            ["docker", "compose", "exec", "-T", "firmdrama", "python3", "-c", CONTAINER_READER],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=15,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError("Cannot read the running lab; check Docker and the firmdrama service.") from error
    try:
        if result.returncode != 0:
            raise ValueError("Container reader failed.")
        hashes = json.loads(result.stdout)
        validate_hashes(hashes)
    except ValueError as error:
        raise RuntimeError("Flags are unavailable or reset is in progress; keeping both existing hashes.") from error
    return hashes


def update_metadata(path: Path, hashes: dict[str, str]) -> bool:
    """Replace both scalars atomically, preserving comments and newline style."""
    validate_hashes(hashes)
    original = path.read_bytes()
    content = original.decode("utf-8")
    matches = list(HASH_LINE.finditer(content))
    if len(matches) != 2 or {match.group(1) for match in matches} != HASH_FIELDS:
        raise ValueError("lab.yml must contain exactly one flag_hash and one checkpoint_flag_hash field.")
    for match in reversed(matches):
        _value, separator, comment = match.group(2).partition("#")
        suffix = (" " + separator + comment) if separator else ""
        content = content[:match.start(2)] + hashes[match.group(1)] + suffix + content[match.end(2):]
    updated = content.encode("utf-8")
    if updated == original:
        return False
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".lab-", suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(updated)
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return True


def sync_flag_hashes() -> bool:
    """Read the current instance once and atomically update both host hashes."""
    return update_metadata(ROOT / "lab.yml", read_running_hashes())


def main() -> int:
    argparse.ArgumentParser(description=__doc__).parse_args()
    try:
        changed = sync_flag_hashes()
    except (OSError, ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print("Updated lab.yml with both current flag hashes." if changed
          else "lab.yml matches both flags in the running instance.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
