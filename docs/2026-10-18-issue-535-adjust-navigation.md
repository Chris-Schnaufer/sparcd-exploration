# Issue #535: Adjust navigation defaults

PR #570 is rebased onto PR #569 head 5569dbb and retains its single-instance responsive Adjust placement and breakpoint coverage. PR #569 remains a merge dependency.

Keep values defaults to off. Moving to another image resets adjustments unless Keep values is checked. Turning the checkbox off preserves current adjustments and affects the next image change. The reset runs before paint when the image key changes. Leaving Focus discards both adjustment values and the Keep values preference.

The checkbox has visible explanatory text associated with aria-describedby. BDD checks its accessible description, neutral slider values and image filter, preserved slider values when keeping adjustments, next and previous navigation, turning Keep values off before navigation, and fresh defaults after leaving and reopening Focus.

## Validation

- All 33 H1 browser scenarios passed in independent Google Chrome on isolated port 5339.
- All 294 Tagger unit tests passed.
- TypeScript and production build passed (existing bundle-size warning).
- The full Tagger BDD suite was not rerun for this follow-up.

## Navigation assertion follow-up

Both next and previous adjustment-navigation helpers now require the image URL and filename (alt text) to change, then wait for a successfully loaded image. The forward setup for previous-image cases uses the same assertions. This prevents unchanged images from passing the preserved-adjustment checks.

All six focused adjustment navigation/default scenarios passed in independent Google Chrome on port 5339; TypeScript and diff checks passed. Production code is unchanged in this follow-up.
