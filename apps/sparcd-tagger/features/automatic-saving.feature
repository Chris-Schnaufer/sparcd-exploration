@H3
Feature: Completed collection edits save automatically with one-level Undo
  Background:
    Given an upload with existing identifications is open in the tagging workspace

  Scenario: A species saves without a dialog and can be undone after reload
    When Coyote is applied for automatic saving
    Then the Coyote is saved without manual controls or per-edit snapshots
    When the automatically saved upload is reloaded
    And the latest automatic action is undone
    Then the Coyote addition is reversed and its audit history remains

  Scenario: A later edit is retained while an earlier automatic save is in flight
    When two species edits straddle an automatic save
    Then both species edits reach shared storage

  Scenario: Offline standalone editing is paused and pending work recovers
    When a completed edit loses connectivity before automatic saving
    Then further collection edits and Undo are disabled
    When the connection returns
    Then the Coyote is saved without manual controls or per-edit snapshots

  Scenario: A review can be undone without deleting its provenance
    When an existing identification is reviewed and automatically saved
    And the latest automatic action is undone
    Then its review is reversed with the original event and identifier retained
