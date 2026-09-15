import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parents[1] / "notebooks"))

from connection_defaults import initial_connection


class InitialConnectionTest(unittest.TestCase):
    def setUp(self):
        self.remembered = SimpleNamespace(
            endpoint="remembered.example",
            access_key="remembered-access",
            secure=True,
        )

    def test_complete_environment_connection_takes_precedence(self):
        connection = initial_connection(
            "environment.example", "environment-access", "environment-secret", False, self.remembered
        )

        self.assertEqual(
            connection,
            {
                "endpoint": "environment.example",
                "access": "environment-access",
                "secret": "environment-secret",
                "secure": False,
                "remember": False,
            },
        )

    def test_partial_environment_does_not_mix_secret_with_remembered_connection(self):
        connection = initial_connection("", "", "environment-secret", False, self.remembered)

        self.assertEqual(connection["endpoint"], "remembered.example")
        self.assertEqual(connection["access"], "remembered-access")
        self.assertEqual(connection["secret"], "")
        self.assertTrue(connection["secure"])
        self.assertTrue(connection["remember"])
