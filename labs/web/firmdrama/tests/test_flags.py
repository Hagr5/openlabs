"""Pure runtime flag contract tests that do not require MySQL."""

import re

from scripts.generate_flags import new_flag


def test_runtime_flag_shape():
    assert re.fullmatch(r"duck\{[a-z]{24}\}", new_flag())


def test_runtime_flags_are_not_constant():
    assert new_flag() != new_flag()
