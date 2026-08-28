# Proving PRs earn their green: three workflow options

## The problem

CI today runs the full BDD suite at PR HEAD and proves it passes. It proves
nothing about whether the PR's new scenarios would have failed without the
code change, and nothing stops a PR from deleting or hollowing out scenarios
to get green. We want the property "the new BDD surface actually tests the
new behavior" checked somewhere, without slowing reviews down.

Shared across all three options:

- A `no-bdd` PR label opts out for genuinely untestable changes (refactors,
  styling, dependency bumps). Its presence is loud in the PR.
- Scenario deletion never blocks. CI warns; Greptile (configured to skip
  draft PRs) asks for justification when a deletion looks like weakening.

---

## Option 1: the two-push PR (record the red)

The PR's own push history is the proof. This is the "first commit is the
failing BDD" idea, enforced on what CI observed rather than on commit
archaeology, so merge commits and never-rebasing stay fine.

How a PR goes:

1. You open a **draft** PR containing only the new/edited feature files and
   steps. CI runs the changed scenarios, they fail, and CI records that red
   result (a small JSON artifact keyed to the PR).
2. You push the implementation commits. The changed scenarios go green.
3. You mark the PR ready for review. The gate check passes only if every
   scenario that is new relative to main has at least one recorded red run
   earlier in this PR and passes now.

Why it's attractive: no synthetic environments, no overlays, no tags. The
gate just replays what already happened, so there is almost nothing to game.
A vacuous scenario never records a red (it passes even before the code
exists), so the gate refuses it, which forces test-first for humans and
agents alike. Draft-first also lines up with Greptile skipping drafts.

Costs: it demands the two-stage push habit. If you push everything at once,
recovery is clumsy (temporarily revert the src changes, push, revert back,
or fall back to the `no-bdd` label with a reviewer's blessing). A scenario
that records red once due to flake counts as proven. Small implementation:
one workflow that runs changed scenarios per push and uploads results, one
gate job that aggregates the PR's artifacts.

## Option 2: advisory delta report + Greptile (no hard gate)

CI computes and posts a sticky PR comment: scenarios added, modified, and
deleted versus main, with the gherkin diff inline. Optionally it also runs
the added scenarios against main's app code and reports "these N scenarios
already pass without this change" as information, not as a failure.
Enforcement is entirely social: Greptile rules flag deletions, weakened
scenarios, and app-code PRs with no BDD delta; the reviewer glances at the
report and decides.

Why it's attractive: cheapest to build, nothing ever blocks a legitimate
PR, and it matches an approve-fast review culture. The report alone changes
behavior, because the BDD delta is visible instead of buried in the file
diff.

Costs: a determined or careless author can still merge a vacuous test if
the reviewer and Greptile both miss it. This is a mirror, not a gate.

## Option 3: overlay red-green (prototyped, measured)

CI rebuilds main's app code in a temp worktree, overlays the PR's
`features/` directories on top, runs the changed scenarios there, and
requires every added scenario to fail. Green at HEAD stays the existing job.

We built and tested this (script and scratch branches live in
`.claude/worktrees/agent-a41778e4e03fb78d7`, branches `rg/case-a..g`). It
catches everything it was designed to catch, including a vacuous scenario
hidden next to a genuine one. Targeted runs cost ~35s; naive whole-file
runs hit 15+ minutes on a real PR. The catch: matching scenarios by title
is fragile (outlines, duplicates, renames, Background edits), and "the base
run crashed" must count as a gate error, not as red, or breaking the test
harness buys a free pass. Making it robust requires tagging new scenarios
(e.g. `@red-green`) so selection is explicit, which adds a convention of
its own.

Costs: the most CI machinery of the three, and an adversarial review
concluded it should stay advisory unless the tag convention is adopted.

---

## Comparison

|                        | 1: two-push        | 2: delta report | 3: overlay          |
| ---------------------- | ------------------ | --------------- | ------------------- |
| Proves tests were red  | yes, observed      | no (reports it) | yes, synthetic      |
| Blocks vacuous tests   | yes                | review-dependent| yes (with tags)     |
| New author habit       | draft-first pushes | none            | tag new scenarios   |
| Gaming surface         | minimal            | n/a, no gate    | needed hardening    |
| Build cost             | medium             | small           | medium, half exists |
| CI time per PR         | ~35s per push      | ~35s optional   | ~35s targeted       |

## Recommendation

Start with option 2 this week: the delta report plus Greptile rules is a
day of work and immediately makes BDD changes visible. If we then want real
enforcement, layer option 1 on top; the recording workflow reuses the same
changed-scenario runner, and the two-push habit is exactly the "failing BDD
first" discipline we wanted, applied where CI can see it. Keep option 3 as
the fallback if draft-first pushing turns out to be unpopular; the
prototype and its measurements are done.
