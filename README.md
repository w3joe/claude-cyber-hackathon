# Mandate — GRC impact canvas

Explore what happens to a small office when someone joins, changes role or leaves. Mandate connects people, responsibilities, systems, controls and requirements on an interactive Archify canvas. It makes ownership gaps visible and proposes handovers with an explicit approval and evidence record.

This is a local MVP using **fictional Northstar Studio data**. It does not change company accounts, send handover messages or certify regulatory compliance.

## Run locally

Requires Node.js 22.12 or newer and npm.

```sh
npm ci
npm start
```

Open **http://127.0.0.1:4173/**. On macOS, double-click `Start Mandate.command` as an alternative. The launcher installs locked dependencies if they are missing, reuses an existing local Mandate server and opens the app. Internet access is needed for the initial dependency installation; the app and questions run locally afterwards.

For development or a built preview:

```sh
npm run dev -- --port 4173 --strictPort
npm test
npm run build
npm run preview -- --port 4174 --strictPort
```

The Archify renderer is served by the included Vite plugin in both development and preview. Serving `dist/` as static files alone will not provide the map-rendering endpoint.

## Try the complete loop

1. Choose **Someone leaves → Maya Chen**, the Head of Media. Inspect the missing owner, affected controls and configured accountability route.
2. Switch between responsibilities and control details on the Archify canvas. Select a node to inspect its evidence and connected records. Open the full viewer for search and route tracing.
3. Open **Repair plan** and propose Ellis, the recorded media deputy. A proposal does not appoint an owner or close the gap.
4. Record an eligible independent decision-maker, acceptance, authority, readiness and an evidence reference to confirm a handover in the plan. Missing or invalid checks prevent confirmation.
5. Review **Evidence report**. It separates covered, proposed, verified-in-plan, unknown and unresolved records. The stale recovery evidence remains visible after a media handover.
6. Try a new starter or role change, compare the baseline, or ask **“What happens if the head of media leaves?”** in the question panel.

The question panel uses local rules and the current graph. It supports ownership, impact, handover and evidence questions; it is not an unrestricted AI chat. A hypothetical question offers a preview before changing the scenario.

## What “self-healing” means here

Mandate traces gaps and offers candidates from recorded deputies, eligibility and the configured accountability chain. Suggested repairs remain proposals. Confirmation records a human assertion within the plan; it does not independently check a company system.

Seniority alone does not create authority. An unresolved chain remains unresolved, and a candidate cannot authorise their own appointment. Changing an owner or authoriser clears the relevant confirmation fields. Existing stale or missing control evidence cannot be repaired merely by assigning a new person.

## Plans, exports and scope

- A plan contains one active join, move or leave scenario and its handovers. Starting another scenario replaces the active scenario; Undo retains recent changes during the session.
- Plans autosave in browser local storage. Use the same browser and address to return to them; `localhost` and `127.0.0.1` have separate storage. Download JSON for a portable copy.
- Imports are schema-checked. Unreadable saved data is retained in a recovery copy before replacement; if recovery storage fails, overwriting is blocked.
- Export a printable HTML or Markdown evidence report, or the editable Archify JSON for the current map.
- The sample commitments are internal policy/customer examples, not a complete legal or regulatory control library.
- No authentication, shared workspace, immutable audit log, HR/identity integration or independent evidence verification is implemented. A real deployment would need those capabilities and an organisation-specific authority and control model.

## Implementation and validation

React and TypeScript provide the interface. A deterministic rules engine evaluates scenarios and handovers. Archify renders typed architecture specifications locally and requires all nine showcase validation checks with no errors or warnings before displaying a new map. Failed renders show an error rather than an older scenario’s map.

Tests cover scenario propagation, authority and approval rules, evidence states, questions, reports, plan import/recovery and map generation. Run `npm test` and `npm run build` for the current checks.

The example source, checked standalone HTML and delivery receipt are kept in `docs/diagrams/`. These describe the fictional office model; diagram validation establishes layout and specification quality, not business compliance.

## Archify attribution

The portable renderer is included in `vendor/archify/`, based on the installed Archify skill (upstream `tt-a1i/archify`, version `2.17.0-dev.1`). Its MIT licence, third-party notices and adaptation note are included there. No separately installed skill, API key or paid AI service is required to run this repository.
