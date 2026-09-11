"""Host-only checks: python -m unittest discover -s docs/tools -p test_*.py."""

from __future__ import annotations

import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts import check


def digest(flag: str) -> str:
    return hashlib.sha256(flag.encode("utf-8")).hexdigest()


class FlagCheckerTests(unittest.TestCase):
    checkpoint = "duck{" + "a" * 24 + "}"
    final = "duck{" + "b" * 24 + "}"

    def make_lab(self, directory: str) -> Path:
        lab = Path(directory)
        (lab / "lab.yml").write_text(
            "name: firmdrama\n"
            f"flag_hash: {digest(self.final)} # final\n"
            f"checkpoint_flag_hash: {digest(self.checkpoint)} # checkpoint\n",
            encoding="utf-8",
        )
        return lab

    def run_checker(self, lab: Path, flag: str) -> tuple[int, list[str]]:
        messages: list[str] = []
        with patch.object(sys, "argv", ["check.py", str(lab)]), \
             patch("builtins.input", return_value=flag), \
             patch("builtins.print", side_effect=lambda message="": messages.append(str(message))):
            return check.main(), messages

    def test_reports_checkpoint_and_final_stages(self):
        with tempfile.TemporaryDirectory() as directory:
            lab = self.make_lab(directory)
            self.assertEqual(self.run_checker(lab, self.checkpoint), (0, ["checkpoint solved"]))
            self.assertEqual(self.run_checker(lab, self.final), (0, ["solved"]))

    def test_rejects_an_incorrect_flag_without_disclosing_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            lab = self.make_lab(directory)
            self.assertEqual(self.run_checker(lab, "duck{" + "c" * 24 + "}"), (1, ["not solved"]))

    def test_rejects_missing_or_ambiguous_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            lab = Path(directory)
            with patch.object(sys, "argv", ["check.py", str(lab)]), patch("builtins.print") as output:
                self.assertEqual(check.main(), 2)
                output.assert_called_once_with(f"no lab.yml in {lab}")

            (lab / "lab.yml").write_text("flag_hash: " + "a" * 64 + "\n", encoding="utf-8")
            with patch.object(sys, "argv", ["check.py", str(lab)]), patch("builtins.print") as output:
                self.assertEqual(check.main(), 2)
                output.assert_called_once_with("lab.yml must contain one valid flag_hash and checkpoint_flag_hash.")


if __name__ == "__main__":
    unittest.main()
