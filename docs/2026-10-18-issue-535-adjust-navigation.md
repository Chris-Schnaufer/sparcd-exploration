# Issue #535: Adjust navigation defaults

PR #570 is rebased onto PR #569 head 5569dbb and retains its single-instance responsive Adjust placement and breakpoint coverage. PR #569 remains a merge dependency.

Keep values defaults to off. Moving to another image resets adjustments unless Keep values is checked. Turning the checkbox off preserves current adjustments and affects the next image change. The reset runs before paint when the image key changes. Leaving Focus discards both adjustment values and the Keep values preference.

The checkbox has visible explanatory text associated with aria-describedby. BDD checks its accessible description, neutral slider values and image filter, preserved slider values when keeping adjustments, next and previous navigation, turning Keep values off before navigation, and fresh defaults after leaving and reopening Focus.

## Validation

- All 33 H1 browser scenarios passed in independent Google Chrome on isolated port 5339.
- All 294 Tagger unit tests passed.
- TypeScript and production build passed (existing bundle-size warning).
- The full Tagger BDD suite was not rerun for this follow-up.
