"""Host-only checks: python -m unittest discover -s docs/tools -p test_sync_flag_hash.py."""

from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts import sync_flag_hash as sync


class FlagHashSyncTests(unittest.TestCase):
    hashes = {"flag_hash": "a" * 64, "checkpoint_flag_hash": "b" * 64}

    def test_preserves_metadata_comments_and_crlf_without_rewriting_unchanged_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lab.yml"
            original = b"name: firmdrama\r\n# operator comment\r\nflag_hash: old-final # final only\r\ncheckpoint_flag_hash: old-checkpoint # checkpoint\r\ntechniques: [ssti]\r\n"
            path.write_bytes(original)
            self.assertTrue(sync.update_metadata(path, self.hashes))
            self.assertEqual(path.read_bytes(), original.replace(b"old-final", b"a" * 64).replace(b"old-checkpoint", b"b" * 64))
            with patch.object(sync.os, "replace") as replace:
                self.assertFalse(sync.update_metadata(path, self.hashes))
                replace.assert_not_called()

    def test_rejects_invalid_digest_and_ambiguous_metadata_without_modification(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lab.yml"
            for original, hashes in [
                (b"flag_hash: old\ncheckpoint_flag_hash: old\n", {**self.hashes, "checkpoint_flag_hash": "invalid"}),
                (b"flag_hash: old\ncheckpoint_flag_hash: old\n", {"flag_hash": "a" * 64}),
                (b"name: firmdrama\n", self.hashes),
                (b"flag_hash: old\n", self.hashes),
                (b"flag_hash: one\nflag_hash: two\ncheckpoint_flag_hash: old\n", self.hashes),
                (b"flag_hash: old\ncheckpoint_flag_hash: one\ncheckpoint_flag_hash: two\n", self.hashes),
            ]:
                path.write_bytes(original)
                with self.assertRaises(ValueError):
                    sync.update_metadata(path, hashes)
                self.assertEqual(path.read_bytes(), original)

    def test_exports_only_two_valid_digests_and_rejects_docker_failure(self):
        valid = json.dumps(self.hashes)
        for code, output in [
            (0, valid), (1, valid), (0, "unexpected output"),
            (0, json.dumps({"flag_hash": "a" * 64})),
            (0, json.dumps({**self.hashes, "checkpoint_flag_hash": None})),
            (0, json.dumps({**self.hashes, "unexpected": "extra"})),
            (0, "null"),
        ]:
            with patch.object(sync.subprocess, "run", return_value=subprocess.CompletedProcess([], code, output, "")):
                if code == 0 and output == valid:
                    self.assertEqual(sync.read_running_hashes(), self.hashes)
                else:
                    with self.assertRaises(RuntimeError):
                        sync.read_running_hashes()

    def test_failed_atomic_write_preserves_both_old_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lab.yml"
            original = b"flag_hash: old-final\ncheckpoint_flag_hash: old-checkpoint\n"
            path.write_bytes(original)
            with patch.object(sync.os, "replace", side_effect=OSError("Write failed")):
                with self.assertRaises(OSError):
                    sync.update_metadata(path, self.hashes)
            self.assertEqual(path.read_bytes(), original)
            self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_one_time_sync_reads_and_updates_once(self):
        with patch.object(sync, "read_running_hashes", return_value=self.hashes) as read, \
             patch.object(sync, "update_metadata", return_value=True) as update:
            self.assertTrue(sync.sync_flag_hashes())
            read.assert_called_once_with()
            update.assert_called_once_with(sync.ROOT / "lab.yml", self.hashes)

    def test_unavailable_instance_fails_without_writing_or_retrying(self):
        with patch.object(sys, "argv", ["sync_flag_hash.py"]), \
             patch.object(sync, "read_running_hashes", side_effect=RuntimeError("Unavailable")) as read, \
             patch.object(sync, "update_metadata") as update, patch("builtins.print"):
            self.assertEqual(sync.main(), 1)
            read.assert_called_once_with()
            update.assert_not_called()

    def test_matching_hashes_exit_successfully_without_background_work(self):
        with patch.object(sys, "argv", ["sync_flag_hash.py"]), \
             patch.object(sync, "sync_flag_hashes", return_value=False) as synchronize, \
             patch("builtins.print") as output:
            self.assertEqual(sync.main(), 0)
            synchronize.assert_called_once_with()
            output.assert_called_once_with("lab.yml matches both flags in the running instance.")


if __name__ == "__main__":
    unittest.main()
