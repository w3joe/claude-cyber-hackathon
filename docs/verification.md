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
