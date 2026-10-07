# Regression coverage for transient canonical reads and actionable S3 errors.

@unmapped
Feature: Canonical S3 read diagnostics

  Background:
    Given an upload with local edits is open in the tagging workspace
    And the connected account is ready for attribution

  Scenario: An unnamed transient HEAD denial recovers before the sync preview is shown
    Given the next canonical media HEAD fails without an S3 error code
    When the Sync dialog is opened
    Then the pending change is computed against the currently stored files
    And the Sync dialog does not show an access-denied error
