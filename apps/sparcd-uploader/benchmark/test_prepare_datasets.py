import subprocess
import tempfile
import unittest
from pathlib import Path

from prepare_datasets import (
    pad_jpeg,
    pad_mp4,
    select_images,
    write_manifests,
    write_json,
)


class PrepareDatasetsTest(unittest.TestCase):
    def test_select_images_is_nearest_then_name(self):
        blobs = [
            {"name": "b.JPG", "size": 260},
            {"name": "c.JPG", "size": 255},
            {"name": "a.JPG", "size": 260},
        ]
        self.assertEqual(
            [item["name"] for item in select_images(blobs, 2, 256)], ["c.JPG", "a.JPG"]
        )

    def test_pad_jpeg_keeps_file_decodable_and_exact(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "image.jpg"
            subprocess.run(
                [
                    "ffmpeg",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=red:s=32x32",
                    "-frames:v",
                    "1",
                    str(path),
                ],
                check=True,
            )
            target = path.stat().st_size + 70_003
            pad_jpeg(path, target, "test-jpeg")
            self.assertEqual(path.stat().st_size, target)
            subprocess.run(
                ["identify", "-ping", str(path)], check=True, stdout=subprocess.DEVNULL
            )

    def test_pad_jpeg_preserves_source_trailing_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "image.jpg"
            subprocess.run(
                [
                    "ffmpeg",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=blue:s=32x32",
                    "-frames:v",
                    "1",
                    str(path),
                ],
                check=True,
            )
            trailing = b"camera metadata after EOI"
            with path.open("ab") as output:
                output.write(trailing)
            target = path.stat().st_size + 70_003
            pad_jpeg(path, target, "test-trailing-jpeg")
            self.assertEqual(path.stat().st_size, target)
            self.assertTrue(path.read_bytes().endswith(trailing))
            subprocess.run(
                ["identify", "-ping", str(path)], check=True, stdout=subprocess.DEVNULL
            )

    def test_manifest_verify_detects_media_change(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "datasets" / "S1" / "image.jpg"
            source.parent.mkdir(parents=True)
            subprocess.run(
                [
                    "ffmpeg",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=green:s=32x32",
                    "-frames:v",
                    "1",
                    str(source),
                ],
                check=True,
            )
            for dataset in ("S2", "S3", "S4", "S5"):
                destination = root / "datasets" / dataset / "image.jpg"
                destination.parent.mkdir(parents=True)
                destination.hardlink_to(source)
            write_json(
                root / "state" / "file-metadata.json",
                {
                    "S1/image.jpg": {
                        "capture_time": "2026-01-01T00:00:00Z",
                        "provenance": "test",
                    }
                },
            )
            write_manifests(root, workers=1, decode=False, write=True)
            write_manifests(root, workers=1, decode=False, write=False)
            with source.open("ab") as output:
                output.write(b"changed")
            with self.assertRaisesRegex(RuntimeError, "manifest mismatch"):
                write_manifests(root, workers=1, decode=False, write=False)

    def test_pad_mp4_adds_valid_free_box_and_exact_size(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "video.mp4"
            subprocess.run(
                [
                    "ffmpeg",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "testsrc=size=64x64:rate=5",
                    "-t",
                    "1",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:v",
                    "libx264",
                    str(path),
                ],
                check=True,
            )
            target = path.stat().st_size + 100_003
            pad_mp4(path, target, "test-video")
            self.assertEqual(path.stat().st_size, target)
            subprocess.run(["ffprobe", "-v", "error", str(path)], check=True)


if __name__ == "__main__":
    unittest.main()
