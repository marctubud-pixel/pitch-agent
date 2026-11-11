# F05-A · F05-B · F06-A

Three fixes only, on the accepted F05–F07 version. Frontend code, tests and text only. No backend code, API contract, service interface, database, approval rule, business gate or task progression was changed. Editing, review, approval and adoption behaviour is unchanged.

All verification used **demo data** on an isolated Vite dev server (port 5307), plus the e2e script's own server. No real project, model, paid service or backend job was involved.

## Changed files

| File | Fix | Change |
|---|---|---|
| `src/views/stages/ContentReviewStage.tsx` | F05-A | Index comment updated; the index no longer claims who changed a passage. |
| `src/i18n/messages/{en,zh-CN,ja,ko,fr,es}.ts` | F05-A, F05-B | `pw.rev.passages` now reads "{count} changed passages" (all six languages). Added `pw.rev.findMatch` and `pw.rev.matching`; removed `pw.rev.usedIn` and `pw.rev.yourIdea`, which are no longer used. Parity: 0 mismatches. |
| `src/proposal/revisions.ts` | F05-B | `ideaUsedIn` replaced by `matchingTextIn`, which returns identical-text matches only and makes no claim of adoption or authorship. |
| `src/proposal/revisions.test.ts` | F05-B | A new idea that matches existing copy still matches, and stays "new". |
| `src/views/project/ProposalArea.tsx` | F05-B | The idea list shows a neutral "Find matching text: direction X, copy lines" link. The recorded status and response are shown as before. |
| `src/views/stages/ThemesStage.tsx` | F05-B | No "Your idea" marker. Only when arriving from a match link is the identical line marked "Matching text". |
| `src/styles/refine.css` | F05-B | Marker style renamed (`data-match`). |
| `src/workbot/WorkBot.tsx` | F06-A | The docked tab is placed where it covers nothing; it steps aside while the page scrolls. |
| `src/styles/workbot.css` | F06-A | Slim handle size; the "aside" state (off the edge, no taps; keyboard focus brings it back). |
| `docs/fixes/tab-overlap.mjs`, `docs/fixes/accept-f05ab-f06a.mjs` (new) | checks | Strict overlap measurement and acceptance script. |
| `docs/fixes/accept-f05-f07.mjs` | checks | Three assertions that encoded the old wording now encode the corrected wording. Nothing else changed. |

Full diff: [`f05ab-f06a.patch`](./f05ab-f06a.patch).

## F05-A: manual edits are no longer described as review changes

**Before.** After editing "Opening" with the wording editor, the index said "3 passages changed by the review", although no review ran.

**Now.** The index reads "**3 changed passages**". Each passage keeps its recorded reason exactly as stored ("Edited by you.", "Too long; …"), its struck-through earlier wording and its link. The data has no field that records who changed a passage, so the index makes no distinction. Nothing parses the reason text.

![F05-A](./img-f05ab-f06a/F05A-index-after-edit.png)

## F05-B: identical text is not adoption or authorship

**Before.** Submitting "Same path. Colder air." (already in direction A) produced a "New" idea with "See where it is used: direction A". Opening that link labelled A's line, and C's existing line, "Your idea".

**Now:**
- **The idea list.** Every idea whose text appears word for word in a direction shows "**Find matching text: direction A, copy lines**". This is navigation only. The idea's own recorded status and response are shown unchanged: the new one stays "New", and the seeded one keeps "Used · Used as a secondary line for C."
- **No usage claims.** The data has no structured record of where an idea was used, so no "used in" relationship is shown anywhere.
- **The copy lines.** No line is ever marked as yours. Arriving from a match link marks the identical line "Matching text"; opening the copy lines any other way marks nothing.

![F05-B new idea](./img-f05ab-f06a/F05B-new-idea.png) ![F05-B matching line](./img-f05ab-f06a/F05B-matching-line.png)

## F06-A: the docked tab covers nothing on screen

**Before.** At 375×760 on Visual development, the docked tab overlapped the stage link "6 Content review", and pointer hits there went to the tab. A strict check also found an overlap at 390×844 with the direction A card.

**Now:**
- **Placement.** When the page is still (after scrolling, a resize, a route change or new content), WorkBot measures every control and every painted line of text on screen. It places the tab at the lowest point on the right edge where the tab's rectangle intersects none of them: full size first, then a 16px handle.
- **While scrolling.** The tab slides off the edge and takes no taps, then settles again about 160 ms after scrolling stops.
- **Fallback.** If nothing were free, the tab would stay aside, and keyboard focus still brings it into view. In the scan below this never happened.
- **Unchanged:** hiding during input and dialogs, the docked state after reload, focus moving to and from the tab, and the conversation and unsent questions.
- **No layout changes:** no page whitespace was added.

![F06-A 375: before | after](./img-f05ab-f06a/compare-F06A-375.png)

390: [before | after](./img-f05ab-f06a/compare-F06A-390.png) · [dialog open](./img-f05ab-f06a/375-F06A-2-dialog.png) · [docked on Overview, 375](./img-f05ab-f06a/375-F06A-3-docked-overview.png) · [390](./img-f05ab-f06a/390-F06A-3-docked-overview.png)

**How overlap is measured** (`tab-overlap.mjs`): it does not look at control centres or the page end. It intersects the tab's rectangle with:
- the client rectangles of every visible control;
- every painted text line (using `Range.getClientRects`, and confirming with `elementsFromPoint` that the text is not clipped away);
- a pointer hit-test every 3px across the whole tab.

The acceptance script also checks every visible stage link at 4px steps, to confirm the pointer resolves to the link and never to the tab.

## Verification results (actually run)

| Check | Result |
|---|---|
| Reproduction before the fix (same script) | all three reproduced (F06-A at 375 and at 390) |
| Reproduction after the fix | F05-A neutral, F05-B neutral link with no marker, F06-A no overlaps and no hits at 375 and 390 |
| `accept-f05ab-f06a.mjs` (desktop, 375×760, 390×844) | 42 of 42 |
| Docked-tab scan: 13 pages, every half-screen, settled, 375×760 and 390×844 | 361 positions: 0 overlaps, 0 pointer hits, 0 times aside, 0 times slim |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 62 of 62 |
| `node scripts/e2e.mjs` | 54 of 54 |
| F01–F04 acceptance | 52 of 52 |
| F01 in-flight edit test | 18 of 18 |
| F05–F07 acceptance (three assertions updated to the corrected wording) | 78 of 78; tab now passes over nothing while settled at 375 or 390 |
| i18n parity · build | 0 mismatches · succeeds |

On the first run of the new acceptance script, two checks failed because my "Your idea" pattern also matched the existing heading "Your ideas for this stage". The pattern was tightened to the marker alone and rerun; no product change was involved.

## Limits of this verification

- **Demo data, Chromium only.** Safari, Firefox, real phones and on-screen keyboards were not tested. Typing behaviour was tested with focus, not a soft keyboard resizing the viewport.
- **Tab placement is checked on settled pages.** While scrolling, the tab is deliberately aside and takes no taps; that state is checked, but not frame by frame.
- **The "nothing free" fallback never occurred,** so it was not observed in use. It is covered by code, not by an observed case.
- **No manual screen-reader pass.**
- **Data the backend would need** for the distinctions this fix declines to make: who changed a passage (review or person), and where an adopted idea was used (direction or slide and field).
