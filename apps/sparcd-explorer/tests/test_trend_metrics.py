import unittest

import polars as pl

from notebook_cells import _defining


def trend_builder():
    """Load the pure trend-metrics helper from its marimo cell."""
    cell = _defining("build_trend_metrics")
    value, _scope = cell.fn(pl)
    return value[0]


def frame(rows, columns):
    return pl.DataFrame(rows, schema=columns, orient="row")


DEPLOYMENT_COLUMNS = ["bucket", "upload", "deployment_id", "location_id"]
MEDIA_COLUMNS = ["bucket", "upload", "deployment_id", "timestamp"]
OBSERVATION_COLUMNS = [
    "bucket", "upload", "deployment_id", "timestamp", "scientific_name", "count", "tags"
]


class TrendMetricsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.build = staticmethod(trend_builder())

    def test_composite_upload_provenance_prevents_deployment_id_collisions(self):
        deployments = frame([
            ["bucket-a", "upload-a", "same-id", "A01"],
            ["bucket-b", "upload-b", "same-id", "B01"],
        ], DEPLOYMENT_COLUMNS)
        media = frame([
            ["bucket-a", "upload-a", "same-id", "2024-06-01T08:00:00-07:00"],
            ["bucket-b", "upload-b", "same-id", "2024-06-01T09:00:00-07:00"],
        ], MEDIA_COLUMNS)
        observations = frame([
            ["bucket-a", "upload-a", "same-id", "2024-06-01T08:00:00-07:00", "Puma concolor", "1", ""],
        ], OBSERVATION_COLUMNS)

        result, reason = self.build(observations, media, deployments)

        self.assertIsNone(reason)
        row = result.filter(pl.col("year") == 2024).row(0, named=True)
        self.assertEqual(row["total_detections"], 1)
        self.assertEqual(row["sites_with_detections"], 1)
        self.assertEqual(row["monitored_sites"], 2)
        self.assertEqual(row["camera_days"], 2)

    def test_camera_days_include_untagged_media(self):
        deployments = frame([["bucket-a", "upload-a", "dep-a", "A01"]], DEPLOYMENT_COLUMNS)
        media = frame([
            ["bucket-a", "upload-a", "dep-a", "2024-06-01T08:00:00-07:00"],
            ["bucket-a", "upload-a", "dep-a", "2024-06-02T08:00:00-07:00"],
        ], MEDIA_COLUMNS)
        observations = frame([
            ["bucket-a", "upload-a", "dep-a", "2024-06-01T08:00:00-07:00", "Puma concolor", "1", ""],
        ], OBSERVATION_COLUMNS)

        result, _reason = self.build(observations, media, deployments)

        row = result.filter(pl.col("year") == 2024).row(0, named=True)
        self.assertEqual(row["camera_days"], 2)
        self.assertEqual(row["relative_abundance_index_per_100_camera_days"], 50.0)

    def test_repeated_uploads_of_one_site_day_are_counted_once(self):
        deployments = frame([
            ["bucket-a", "upload-a", "dep-a", "A01", "Alpha", "32.0", "-110.0"],
            ["bucket-a", "upload-b", "dep-b", "A01", "Alpha", "32.0", "-110.0"],
        ], ["bucket", "upload", "deployment_id", "location_id", "location_name", "latitude", "longitude"])
        media = frame([
            ["bucket-a", "upload-a", "dep-a", "2024-06-01T08:00:00-07:00"],
            ["bucket-a", "upload-b", "dep-b", "2024-06-01T09:00:00-07:00"],
        ], MEDIA_COLUMNS)
        observations = frame([
            ["bucket-a", "upload-a", "dep-a", "2024-06-01T08:00:00-07:00", "Puma concolor", "1", ""],
        ], OBSERVATION_COLUMNS)

        result, _reason = self.build(observations, media, deployments)

        row = result.filter(pl.col("year") == 2024).row(0, named=True)
        self.assertEqual(row["monitored_sites"], 1)
        self.assertEqual(row["camera_days"], 1)

    def test_common_name_target_and_count_are_supported(self):
        deployments = frame([["bucket-a", "upload-a", "dep-a", "A01"]], DEPLOYMENT_COLUMNS)
        media = frame([["bucket-a", "upload-a", "dep-a", "2024-06-01"]], MEDIA_COLUMNS)
        observations = frame([
            ["bucket-a", "upload-a", "dep-a", "2024-06-01", "", "2", "[COMMONNAME:Mountain lion]"],
        ], OBSERVATION_COLUMNS)

        result, reason = self.build(observations, media, deployments, target="common:Mountain lion")

        self.assertIsNone(reason)
        self.assertEqual(result.filter(pl.col("year") == 2024).row(0, named=True)["total_detections"], 2)

    def test_years_are_continuous_and_invalid_dates_are_ignored(self):
        deployments = frame([["bucket-a", "upload-a", "dep-a", "A01"]], DEPLOYMENT_COLUMNS)
        media = frame([
            ["bucket-a", "upload-a", "dep-a", "2020-01-01"],
            ["bucket-a", "upload-a", "dep-a", "2022-01-01"],
        ], MEDIA_COLUMNS)
        observations = frame([
            ["bucket-a", "upload-a", "dep-a", "2017-01-01", "Puma concolor", "1", ""],
            ["bucket-a", "upload-a", "dep-a", "not-a-date", "Puma concolor", "1", ""],
            ["bucket-a", "upload-a", "dep-a", "2022-01-01", "Puma concolor", "1", ""],
        ], OBSERVATION_COLUMNS)

        result, reason = self.build(observations, media, deployments)

        self.assertIsNone(reason)
        self.assertEqual(result["year"].to_list(), [2018, 2019, 2020, 2021, 2022])
        self.assertEqual(result.filter(pl.col("year") == 2022).row(0, named=True)["total_detections"], 1)
        self.assertEqual(result.filter(pl.col("year") == 2020).row(0, named=True)["camera_days"], 1)

    def test_removed_or_blank_identifications_do_not_create_detections(self):
        deployments = frame([["bucket-a", "upload-a", "dep-a", "A01"]], DEPLOYMENT_COLUMNS)
        media = frame([["bucket-a", "upload-a", "dep-a", "2024-06-01"]], MEDIA_COLUMNS)
        observations = frame([
            ["bucket-a", "upload-a", "dep-a", "2024-06-01", "", "", "[REMOVED:Puma concolor]"],
            ["bucket-a", "upload-a", "dep-a", "2024-06-01", "", "", ""],
        ], OBSERVATION_COLUMNS)

        result, reason = self.build(observations, media, deployments)

        self.assertEqual(result.height, 0)
        self.assertEqual(reason, "no dated identifications from 2018 onward")


if __name__ == "__main__":
    unittest.main()
