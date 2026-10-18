# Issue #536: Focus divider correctness and accessibility

The divider consumes resize keys without navigating images, supports Home/End, and exposes its orientation, current pixel value, bounds, instructions, and controlled pane to assistive technology.

Saved width and height preferences remain independent. A ResizeObserver clamps the displayed size to the current container without overwriting the preferred size during viewport changes. When a short window cannot fit both pane minimums, the split scrolls; the species viewport also scrolls at its minimum size so controls remain reachable.

Pointer capture keeps each drag local to its initiating pointer. Touch scrolling is disabled on the divider itself. Pointer cancellation, lost capture, breakpoint changes, and unmount stop the drag without leaving global pointer listeners behind.

Coverage includes mouse bounds, keyboard image-identity preservation, horizontal scrolling at minimum width, independent preferences across viewport changes and reload, short-window scrolling, real Chrome touch input, cancellation, and Focus closing during a drag.

## Validation

- All 33 H1 browser scenarios passed in independent Google Chrome on port 5339.
- The final two keyboard/pointer tests also passed after adding all-four-arrow, unrelated-pointer, and lost-capture assertions.
- All 294 Tagger unit tests, TypeScript, production build, and diff checks passed (existing bundle-size warning).
- The full Tagger BDD suite was not rerun for this follow-up.
