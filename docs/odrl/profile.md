# Mandate ODRL profile, version 1

Profile IRI: `urn:mandate:profile:1`

Vocabulary namespace: `urn:mandate:vocab:`

Machine-readable vocabulary: [profile.ttl](profile.ttl)

Complete seeded JSON-LD export: [policies.example.jsonld](policies.example.jsonld)

Mandate expresses seeded policies using the [W3C ODRL Information Model 2.2](https://www.w3.org/TR/odrl-model/) and [Vocabulary and Expression 2.2](https://www.w3.org/TR/odrl-vocab/). This document defines its application profile and supported expression subset. It is not a claim of W3C certification or support for every ODRL expression.

## Expression contract

- Each document is an `odrl:Set` with an absolute policy IRI, this profile IRI, and `odrl:conflict odrl:invalid`.
- A Set contains at least one rule. Rules have unique absolute IRIs and exactly one assignee, action and target in this profile.
- `obligation` contains `odrl:Duty` rules (must); `permission` contains `odrl:Permission` rules (may); `prohibition` contains `odrl:Prohibition` rules (must not).
- An assignee is an organisational role, represented as an ODRL Party. Mandate's scenario model determines the current role-holder; the expression itself does not assign the rule to a named employee or grant access.
- A target is an office system represented as an ODRL Asset. The target includes the records/resources managed by that system as described in the quoted clause. Version 1 aligns these target IRIs directly to systems. Definitions provide authored vocabulary and explanatory context, not automatic semantic inference.
- All actions below are atomic, domain-specific `odrl:Action` instances. There are no action implication or inclusion relationships in version 1.
- Constraints have one left operand, one operator and one typed literal right operand. Multiple constraints are conjunctive. Only the combinations below are supported.
- An empty constraint list expresses no conditions. It does not establish performance of an action.
- Source metadata uses `dcterms:source` (provision IRI), `dcterms:title` (policy title), and the four literal quote properties defined below. Provision hierarchy, cross-references and definitions remain in the authored policy graph. They are not exported as ODRL inheritance.

The canonical export is a JSON array of policy objects, each with a complete inline JSON-LD context. The context, action/operand vocabularies and expression shape are intentionally bounded. `parsePolicies` accepts this form only, including equivalent context key ordering; it is not a general JSON-LD importer. It rejects remote/changed contexts, unsupported profiles, unknown properties, unsupported actions/constraints, duplicate identities and unsupported constructs. It returns expressions, never confirmed office alignments. There is currently no policy import/editor UI or policy persistence; the existing plan import remains a separate format.

## Action vocabulary

| Local action name | Meaning |
| --- | --- |
| `approveCampaign` | Authorise a material campaign release and record the decision. |
| `checkMediaRights` | Check and record media permissions and licence scope. |
| `reviewAdministratorAccess` | Review and record administrator access to publishing channels. |
| `removeAccess` | Remove a departed colleague's studio access and record completion. |
| `testRecovery` | Perform a recovery exercise and retain its evidence. |
| `recordCustomerApproval` | Record a customer's campaign approval. |
| `retainPermissionRecords` | Retain the media permission records in the target system. |
| `administerPublishing` | Administer the target publishing channels. |
| `publishUnapprovedCampaign` | Publish a campaign for which required approval is absent. |

## Constraint vocabulary

All operand names below use the Mandate namespace. Operators and datatypes use the ODRL and XML Schema namespaces respectively.

| Left operand | Operator | Right operand | Meaning |
| --- | --- | --- | --- |
| `maximumReviewInterval` | `odrl:lteq` | Positive whole-month `xsd:duration`, e.g. `P3M` | Elapsed interval between successive reviews must not exceed this calendar-month duration. An initial review date and an assessment time are also needed to evaluate it. |
| `retentionPeriod` | `odrl:gteq` | Positive whole-month `xsd:duration`, e.g. `P24M` | Permission records must be retained for at least this calendar-month duration from their creation. |
| `beforeRelease` | `odrl:eq` | `true`, typed `xsd:boolean` | The rule's action occurs before the associated campaign release. Requires linked action and release events. |

The reader recognises these expressions; **the coverage engine does not evaluate their values**. Unsupported temporal forms are rejected, rather than silently treated as satisfied.

## Provenance vocabulary

`mandate:quote` is the verbatim source clause, or the relevant wording on a constraint. `mandate:assigneeQuote`, `mandate:actionQuote` and `mandate:targetQuote` preserve the corresponding source spans on a rule. `validatePolicyGraph` checks all quotes against the authored provision. Parsing an exported expression alone cannot authenticate its source document.

## Coverage versus ODRL evaluation

The office assessment is separate from the ODRL expression. Each alignment records a rule ID, role, supporting systems, controls and a confirmation state. Only confirmed alignments contribute control links and coverage. All listed controls and systems are required; alternatives are not inferred. A missing, suggested or unmatched alignment has unknown coverage.

The engine checks assignee, target and supporting controls, preserving ownership proposals and stale/missing evidence. Requirement views aggregate their provision's descendant rules and explicit references. A visited set prevents cross-reference loops. All rule kinds contribute to **coverage** counts; a permission's optional exercise is never treated as an outstanding duty.

Rule evaluation is always `not-evaluated` in this release:

- Duty coverage does not prove that the action was performed or the duty fulfilled.
- Permission coverage does not grant access or establish that its conditions apply. Not exercising a permission is not a failure.
- Prohibition coverage does not prove absence of forbidden activity or establish infringement.

A permission and prohibition with the same assignee, target and atomic action in a document are treated as a potential conflict. Because conditions are not evaluated, Mandate conservatively marks the entire document's rule assessment unknown pending review. It does not choose a winning rule. Cross-document conflict resolution, arbitrary inference, nested permission duties, remedies, consequences, refinements, logical constraints and policy inheritance are unsupported.

## Verification and demo

`npm test` includes independent JSON-LD expansion using `jsonld`, canonical round trips, negative validation cases, source/alignment integrity, cyclic references, conflict handling and regression checks against the former authored control links. `jsonld` is a development dependency; normal app operation remains offline.

1. Select a requirement on the map to inspect Must / May / Must not cards and quoted sources.
2. Preview Maya leaving: POL-01 §3 and POL-02 §3 lose their assignee coverage.
3. Inspect SOW-04 §5.2: the retention obligation has no mapped control.
4. Confirm an eligible handover: ownership coverage recovers, while the retention gap and stale recovery evidence remain open.
5. Open Evidence report to download ODRL JSON-LD or HTML/Markdown reports containing the rule table.

The existing five requirements and six control links are retained. The added retention rule deliberately makes media-permissions coverage unknown even after a successful handover; the mapped media-rights control still recovers normally. Existing plan storage remains `mandate-grc-plan-v1` because policies are source-authored in this release.
