# DRAFT — for review, not yet agreed. Generated 2026-09-11 from apps/sparcd-tagger (src/sections/Settings.tsx, src/lib/formatting.ts, src/components/PerImageTime.tsx, src/components/Overview.tsx, src/store.ts).

@unmapped
Feature: Choose how dates, times and distances are displayed

  """
  As-built: date and time format are per-browser display preferences in
  Settings — they never touch the stored ISO timestamps, only how the Focus
  view and the Overview list render them. A distance-units preference is also
  offered, ahead of a location/elevation display that does not exist yet.
  """

  Background:
    Given an upload is open in the tagging workspace

  @unmapped
  Scenario: Dates and times default to a plain ISO-style display
    When Settings is opened
    Then the date format defaults to YYYY-MM-DD
    And the time format defaults to 24-hour

  @unmapped
  Scenario: Switching the date format changes every displayed timestamp
    Given the date format is switched to MM/DD/YYYY in Settings
    And an image is focused
    When the enlarged Focus view is opened
    Then the focused image's corrected time is shown in that date order
    When the detailed Overview list is opened
    Then the Overview list shows capture times in that date order

  @unmapped
  Scenario: Switching the time format changes every displayed timestamp
    Given the time format is switched to 12-hour in Settings
    And an image is focused
    When the enlarged Focus view is opened
    Then the focused image's corrected time carries an AM/PM marker

  @unmapped
  Scenario: A distance-units choice is offered ahead of a location display
    When Settings is opened
    Then a choice of meters or feet is offered for distance units
    # Not consumed anywhere yet — no location/elevation display exists in the
    # tagger. This sets the unit ahead of that future feature.
