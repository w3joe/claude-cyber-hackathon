# Archify runtime bundled with Mandate

This directory contains the unmodified architecture renderer, shared runtime,
HTML viewer, schemas, artifact checker and delivery CLI from Archify
`2.17.0-dev.1`, as packaged in the local Codex Archify adaptation.

Upstream: https://github.com/tt-a1i/archify

The MIT licence and third-party notices are retained alongside this notice.
The bundled font has its own OFL licence in `assets/JetBrainsMono-OFL.txt`.

Mandate's integration is outside this directory, in `server/archify.mjs` and
`src/domain/archify-map.ts`. No installed skill, account, paid API or network
request is needed to render its maps.
