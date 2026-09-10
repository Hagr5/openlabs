"""Host reset ordering, failure handling, and real OS-lock regression checks."""

from contextlib import ExitStack
from io import StringIO
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import reset


class HostResetTests(unittest.TestCase):
    def test_os_lock_rejects_overlap_and_releases_after_error(self):
        with tempfile.TemporaryDirectory() as directory:
            lock = Path(directory) / "reset.lock"
            with self.assertRaisesRegex(ValueError, "simulated failure"):
                with reset.reset_lock(lock):
                    with self.assertRaisesRegex(RuntimeError, "already running"):
                        with reset.reset_lock(lock):
                            self.fail("Overlapping reset acquired the lock")
                    raise ValueError("simulated failure")
            with reset.reset_lock(lock):
                pass

    def test_lock_rejection_does_not_touch_running_lab(self):
        with patch.object(reset, "reset_lock", side_effect=RuntimeError("already running")), \
             patch.object(reset, "reset_lab") as run, patch.object(sys, "argv", ["reset.py"]), \
             patch.object(sys, "stderr", StringIO()):
            self.assertEqual(reset.main(), 1)
            run.assert_not_called()

    def test_failures_close_ingress_and_never_report_success(self):
        for failing_stage in ("app", "state", "hash", "ingress", "health"):
            with self.subTest(stage=failing_stage), ExitStack() as stack:
                events = []
                def docker(*args):
                    events.append(args)
                    stage = ("app" if args[-1] == "firmdrama" else "ingress") if args[0] == "up" else "state" if args[0] == "exec" else "stop"
                    if stage == failing_stage:
                        raise RuntimeError("simulated failure")
                def publish(*args):
                    if failing_stage == "hash":
                        raise ValueError("simulated failure")
                stack.enter_context(patch.object(reset, "docker", side_effect=docker))
                stack.enter_context(patch.object(reset, "read_running_hashes", return_value={}))
                stack.enter_context(patch.object(reset, "update_metadata", side_effect=publish))
                stack.enter_context(patch.object(reset, "verify_endpoint", side_effect=RuntimeError("simulated failure") if failing_stage == "health" else None))
                output = stack.enter_context(patch.object(sys, "stdout", StringIO()))
                stack.enter_context(patch.object(sys, "stderr", StringIO()))
                with self.assertRaises((RuntimeError, ValueError)):
                    reset.reset_lab()
                self.assertEqual(events[-1], ("stop", "--timeout", "5", "firmdrama_ingress"))
                self.assertNotIn("reset complete", output.getvalue())
                if failing_stage in {"app", "state", "hash"}:
                    self.assertFalse(any(e[0] == "up" and e[-1] == "firmdrama_ingress" for e in events))

    def test_hashes_are_published_before_reopening_and_no_images_are_downloaded(self):
        events = []
        with patch.object(reset, "docker", side_effect=lambda *args: events.append(args)), \
             patch.object(reset, "read_running_hashes", return_value={}), \
             patch.object(reset, "update_metadata", side_effect=lambda *args: events.append(("hashes",))), \
             patch.object(reset, "verify_endpoint", side_effect=lambda: events.append(("health",))), \
             patch.object(sys, "stdout", StringIO()):
            reset.reset_lab()
        starts = [e for e in events if e[0] == "up"]
        self.assertEqual([e[-1] for e in starts], ["firmdrama", "firmdrama_ingress"])
        for command in starts:
            self.assertIn("--no-build", command)
            self.assertIn("--force-recreate", command)
            self.assertEqual(command[command.index("--pull") + 1], "never")
        self.assertLess(events.index(("hashes",)), events.index(starts[1]))
        self.assertEqual(events[-1], ("health",))


if __name__ == "__main__":
    unittest.main()
