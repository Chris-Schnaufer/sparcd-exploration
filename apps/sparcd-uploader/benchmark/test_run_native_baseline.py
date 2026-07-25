import os
import tempfile
import unittest
from pathlib import Path

from run_native_baseline import redact, rotated_orders, timed_run


class NativeBaselineTest(unittest.TestCase):
    def test_rotates_client_order(self):
        self.assertEqual(
            rotated_orders(["rclone", "mc", "aws"], 5),
            [
                ["rclone", "mc", "aws"],
                ["mc", "aws", "rclone"],
                ["aws", "rclone", "mc"],
                ["rclone", "mc", "aws"],
                ["mc", "aws", "rclone"],
            ],
        )

    def test_timed_run_returns_measurement(self):
        with tempfile.TemporaryDirectory() as directory:
            timing = timed_run(
                ["true"],
                os.environ.copy(),
                Path(directory) / "run.log",
                "ACCESS",
                "SECRET",
            )
            self.assertGreaterEqual(timing["elapsed_seconds"], 0)
            with self.assertRaisesRegex(RuntimeError, "upload failed"):
                timed_run(
                    ["false"],
                    os.environ.copy(),
                    Path(directory) / "failed.log",
                    "ACCESS",
                    "SECRET",
                )

    def test_redacts_exact_and_url_encoded_credentials(self):
        text = "access=ACCESS123 secret=SECRET/456 encoded=SECRET%2F456"
        self.assertEqual(
            redact(text, "ACCESS123", "SECRET/456"),
            "access=<REDACTED_ACCESS_KEY> secret=<REDACTED_SECRET_KEY> "
            "encoded=<REDACTED_SECRET_KEY>",
        )


if __name__ == "__main__":
    unittest.main()
