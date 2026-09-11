"""Reject complete flag values in packaged source without printing secrets."""

from pathlib import Path
import re
import sys

FLAG_PATTERN = re.compile(rb"duck\{[a-z]{24}\}")


def contaminated_files(roots):
    return [path for root in roots for path in root.rglob("*")
            if path.is_file() and FLAG_PATTERN.search(path.read_bytes())]


def main():
    roots = [Path("/opt/firmdrama"), Path("/opt/firmdrama-tests")]
    if any(not path.is_dir() for path in roots):
        print("Source scan roots are missing", file=sys.stderr)
        return 1
    matches = contaminated_files(roots)
    if matches:
        print("Flag-shaped source values found in: " + ", ".join(map(str, matches)), file=sys.stderr)
        return 1
    print("Packaged source flag-secrecy check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
