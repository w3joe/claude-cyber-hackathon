# Mandate — GRC impact canvas

**Work in progress.** This checkpoint implements the local interactive canvas, scenario engine, proposed and verified handovers, local graph questions, plan import/export and printable reports. The requested Archify renderer is being integrated in a separate update.

A planning tool for a fictional small office. It connects people, roles, systems, controls and requirements so a team can explore someone joining, changing role or leaving. Proposed repairs remain pending until the required authority, acceptance and evidence are recorded.

## Run locally

Requires Node.js 22.12 or later.

```sh
npm install
npm run dev
```

```sh
npm test
npm run build
```

## Scope

- Fictional sample data, browser-local planning and reports.
- No changes to external accounts or permissions.
- No paid AI calls. The question panel uses explicit rules and graph evidence.
- Recorded checks are planning assertions, not independent regulatory certification.

Current verification: 56 focused tests and the production build pass. Browser review and Archify integration are in progress.
