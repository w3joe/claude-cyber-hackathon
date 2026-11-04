# MVP verification — 4 November 2026

## Automated checks

- `npm test`: 70 tests passed across six files.
- `npm run build`: TypeScript and production bundle passed.
- Eighteen role, control and filter map candidates passed Archify showcase validation and delivery.
- The checked Head of Media example passed all nine artifact checks with zero errors or warnings. Its exact hashes are in `diagrams/mandate-head-media.receipt.json`.
- Archify browser evidence passed the required desktop sizes: 1440×900, 1600×1000, 1920×1080 and 2048×1320. Captures and results are beside the example.
- The production-preview map endpoint rendered and served the checked example (HTTP 200). Malformed and different-origin requests were rejected (403); a non-JSON request was rejected (415).

## Browser interactions checked

The app was exercised in an isolated local browser origin, separate from the user’s current scenario:

- Departure, joining and role-change scenarios; baseline comparison.
- Proposed versus confirmed handovers, incomplete confirmation rejection and clearing evidence when the authoriser changes.
- Evidence report export, including retention of stale recovery evidence after a valid handover.
- Plan export and re-import.
- Canvas node selection opening the relevant control/inspector, question-driven responsibility selection, and clearing old focus for unsupported questions.
- Full Archify viewer, node search and light/dark themes.

The app and standalone desktop layouts were visually reviewed. The full viewer provides a readable overview; the embedded canvas starts zoomed for readable labels and offers pan, zoom and Fit map. Narrow mobile layouts have not received a separate browser acceptance pass.

## Limits of this evidence

These checks use fictional data and synthetic approval/evidence records. They do not establish live access removal, real authority, actual control performance, regulatory compliance or production readiness. “Verified in plan” means the required assertions were recorded and accepted by the local rules. No paid AI service or company system was used.


## ODRL profile migration — 4 November 2026

This is a separate verification pass for the rule-layer change; the earlier browser evidence above does not verify the new rule-card layouts.

- `npm test`: 104 tests passed across ten files, including the existing scenario/storage checks and new ODRL, policy graph and server-rendered React presentation checks.
- `npm run build`: TypeScript and the production bundle passed.
- Independent `jsonld` expansion confirmed the exported ODRL Set, Duty, assignee, action and typed-constraint RDF terms without any remote context fetch.
- Canonical JSON-LD round trips, unsupported expression rejection, grounded source quotes, reference cycles, conflict handling and unconfirmed alignments are covered.
- Derived links match the six prior control-to-requirement links. Existing baseline and every person's departure requirement statuses match the prior aggregation when the deliberately added retention gap is excluded.
- The profile Turtle parsed as 38 RDF triples using rdflib.
- A fresh local Vite server accepted the migrated Maya-departure media-rights map through `POST /api/archify/render` (200) and served the delivered map (200). The delivered HTML contained the rule-coverage subtitle. Archify passed all nine showcase checks with zero errors and zero warnings. Specification SHA-256: `12870608b05260d0a801ed1d20ca40a772a701ed83a0bf2d5cc5a09f300e64bf`.
- Inspector/report markup and HTML escaping were tested through React server rendering. Interactive browser and visual layout checks could not be completed because the browser-control host was unavailable. Download clicks were not exercised in a browser.

The retention gap intentionally leaves media-permissions coverage unknown after a valid handover, while the existing mapped control recovers. Policy expression support does not establish rule fulfilment or real-world compliance; conditions and action performance remain unevaluated. No independent ODRL certification or full general-purpose evaluator conformance is claimed.
