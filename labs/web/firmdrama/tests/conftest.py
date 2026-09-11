"""Function-scoped clients for tests that require a reset lab database."""

import pytest

from helpers import seed_test_database, sign_in
from src.app import create_app


@pytest.fixture()
def client():
    """Reset the lab once for each test that requests an integration client."""

    seed_test_database()
    return create_app().test_client()


@pytest.fixture()
def browser_client(client):
    """Use the same reset boundary and establish the browser session cookie."""

    sign_in(client, browser=True)
    return client
