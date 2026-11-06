# Verification record

Observed on November 6, 2026. All planner data used for these checks was synthetic.

## Automated checks

The current check log records 51 passing tests and zero failures. It includes DOM interactions and recovery behavior, local HTTP serving and access restrictions, scheduling invariants, a 40-case single-window exhaustive oracle, and 22 additional independent multi-day/window oracle tests. The added oracle enumerates legal schedules without using the solver's pruning, masks or scoring helpers.

The final combined run produced the complete test and benchmark log. Its session's final shell exit status was not recovered. The earlier full run, the focused interface regression run and the added oracle run each returned exit 0. No failed test result was replaced or omitted.

The fixed benchmark uses seed 20261028, 60 synthetic weeks, 16 tasks per week and beam width 96. It records 51 higher scores and nine ties against the included earliest-deadline baseline: 244,310 versus 231,220 total planning points. A gain can reflect energy fit. Retaining the baseline guarantees no lower returned score. These checks do not measure grades, productivity or student wellbeing.

## Real desktop browser

| Flow | Observed result |
| --- | --- |
| Initial plan | Ten synthetic tasks, nine scheduled, 14h of 21h available. |
| Close Thursday morning | Eight scheduled; the update identifies the displaced seminar chapter. |
| Undo | Original plan restored; focus returns to the initiating availability control. |
| Keyboard | Tab reaches successive window controls; Space toggles the focused window; Escape closes the dialog and returns focus. |
| Close Saturday morning | Eight scheduled, 3490 points versus baseline 2680. This is a separate example, not an additional benchmark case. |
| Invalid prerequisite cycle | Error is shown and the existing plan is retained. |
| Remove unfinished prerequisite | Blocked with the name of its dependent task. |
| Finish and Undo | Completion removes prerequisite references; Undo restores the task, its links and focus. |
| Empty/add/edit/remove/reset | Empty state disables calendar export; a new block is scheduled after a window opens; duration edits, removal and resetting the demo work. |
| JSON download | The actual downloaded JSON contains the synthetic test block and its chosen availability. |
| Calendar download | The actual ICS contains one event for the synthetic block, 09:00-10:00 in floating local time. |

The screenshots are unedited captures of the original connected desktop browser. Their file dimensions are 3434 x 1966 pixels. The browser applied dark colors; this does not verify the intended light palette or contrast compliance. Independent visual review found no blocking overlap or clipping at that size.

Narrow/mobile layout remains unverified. The local server's frame protection prevents an iframe-based narrow-viewport check, and one ordinary supported zoom-key dispatch produced no visible layout change. No substitute mobile rendering is claimed. Assistive technology, print, reduced-motion behavior, real browser file import and opening the ICS in a calendar application were not tested.

## Reproduction

Run `npm start` with Node.js 20 or later to use the app. No runtime dependency installation is required. Run `npm ci` followed by `npm run check` to reproduce the development checks. The package smoke record documents a separate extraction and localhost HTTP test without installing dependencies.
