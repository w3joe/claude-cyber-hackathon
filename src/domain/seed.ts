import type { Office } from './types';

export const seedOffice: Office = {
  id: 'northstar-studio',
  name: 'Northstar Studio',
  description: 'A fictional seven-person creative studio. Policies, commitments and evidence are demonstration records, not a compliance assessment.',
  people: [
    { id: 'ava', name: 'Ava Reed', title: 'Managing Director', department: 'Leadership', active: true, skills: ['managing-director', 'head-media', 'client-lead'] },
    { id: 'maya', name: 'Maya Chen', title: 'Head of Media', department: 'Media', active: true, skills: ['head-media', 'production-lead'] },
    { id: 'theo', name: 'Theo Brooks', title: 'IT Lead', department: 'Technology', active: true, skills: ['it-lead'] },
    { id: 'priya', name: 'Priya Shah', title: 'Operations Lead / Co-founder', department: 'Operations', active: true, skills: ['operations-lead', 'business-owner', 'managing-director'] },
    { id: 'ellis', name: 'Ellis Morgan', title: 'Senior Producer', department: 'Media', active: true, skills: ['production-lead', 'head-media'] },
    { id: 'noah', name: 'Noah Clarke', title: 'Client Lead', department: 'Client services', active: true, skills: ['client-lead'] },
    { id: 'sam', name: 'Sam Patel', title: 'Studio Coordinator', department: 'Operations', active: true, skills: ['assurance-coordinator', 'head-media'] },
  ],
  roles: [
    { id: 'head-media', name: 'Head of Media', description: 'Owns material campaign approval, media licence and permission checks, and publishing administrator review.', ownerId: 'maya', deputyIds: ['ellis'], eligiblePersonIds: ['sam', 'ava'], accountableRoleId: 'managing-director' },
    { id: 'managing-director', name: 'Managing Director', description: 'Accountable for department heads and authorised to approve their handovers.', ownerId: 'ava', deputyIds: ['priya'], eligiblePersonIds: ['priya'], accountableRoleId: 'business-owner' },
    { id: 'business-owner', name: 'Business Owner', description: 'Configured final accountability point. An unfilled role requires a governance decision outside this demonstration.', ownerId: 'priya', deputyIds: [], eligiblePersonIds: [], accountableRoleId: null },
    { id: 'it-lead', name: 'IT Lead', description: 'Owns identity administration and access removal.', ownerId: 'theo', deputyIds: [], eligiblePersonIds: [], accountableRoleId: 'managing-director' },
    { id: 'operations-lead', name: 'Operations Lead', description: 'Owns recovery exercises and operational continuity.', ownerId: 'priya', deputyIds: [], eligiblePersonIds: ['ava'], accountableRoleId: 'managing-director' },
    { id: 'client-lead', name: 'Client Lead', description: 'Owns the record of customer approval before campaign release.', ownerId: 'noah', deputyIds: ['ava'], eligiblePersonIds: ['ava'], accountableRoleId: 'managing-director' },
    { id: 'production-lead', name: 'Production Lead', description: 'Owns the campaign planning workspace and production records.', ownerId: 'ellis', deputyIds: ['maya'], eligiblePersonIds: ['maya'], accountableRoleId: 'head-media' },
    { id: 'assurance-coordinator', name: 'Assurance Coordinator', description: 'A vacant planned role for a new starter. No existing control is assumed to depend on this future appointment.', ownerId: null, deputyIds: [], eligiblePersonIds: ['sam'], accountableRoleId: 'operations-lead' },
  ],
  systems: [
    { id: 'campaign-board', name: 'Campaign Board', description: 'Campaign plans, release decisions and customer approval records.', roleId: 'production-lead' },
    { id: 'asset-library', name: 'Asset Library', description: 'Licensed media assets and permission records.', roleId: 'head-media' },
    { id: 'publishing-console', name: 'Publishing Console', description: 'Customer publishing channels and their administrator access.', roleId: 'head-media' },
    { id: 'identity-console', name: 'Identity Console', description: 'Studio accounts and access-removal records.', roleId: 'it-lead' },
  ],
  controls: [
    { id: 'campaign-approval', name: 'Material campaign approval', description: 'Record the authorised media decision before releasing a material campaign.', category: 'governance', roleId: 'head-media', systemIds: ['campaign-board'], requirementIds: ['release-policy'], evidence: { status: 'current', reference: 'DEMO-REL-042: approved campaign decision', checkedAt: '2026-11-03' } },
    { id: 'media-rights', name: 'Media licence and permission checks', description: 'Record licence scope and required permissions for campaign media.', category: 'compliance', roleId: 'head-media', systemIds: ['asset-library'], requirementIds: ['media-permissions'], evidence: { status: 'current', reference: 'DEMO-LIC-018: media permission register', checkedAt: '2026-11-03' } },
    { id: 'publisher-review', name: 'Publishing administrator review', description: 'Review who can administer customer publishing channels.', category: 'risk', roleId: 'head-media', systemIds: ['publishing-console'], requirementIds: ['access-policy'], evidence: { status: 'current', reference: 'DEMO-PUB-012: publishing access review', checkedAt: '2026-11-02' } },
    { id: 'access-removal', name: 'Studio access removal', description: 'Remove a departed colleague’s studio access and retain the completion record.', category: 'risk', roleId: 'it-lead', systemIds: ['identity-console'], requirementIds: ['access-policy'], evidence: { status: 'current', reference: 'DEMO-IAM-031: completed access-removal check', checkedAt: '2026-11-03' } },
    { id: 'recovery-test', name: 'Recovery exercise', description: 'Record a successful recovery exercise for the media asset store.', category: 'risk', roleId: 'operations-lead', systemIds: ['asset-library'], requirementIds: ['recovery-policy'], evidence: { status: 'stale', reference: 'DEMO-REC-004: previous recovery exercise; refresh required', checkedAt: '2026-04-01' } },
    { id: 'customer-signoff', name: 'Customer release sign-off', description: 'Retain the customer’s approval before their campaign is published.', category: 'governance', roleId: 'client-lead', systemIds: ['campaign-board'], requirementIds: ['customer-approval'], evidence: { status: 'current', reference: 'DEMO-CLI-026: customer release approval', checkedAt: '2026-11-03' } },
  ],
  requirements: [
    { id: 'release-policy', name: 'Authorised material release', description: 'Material campaigns require a named media approver and a recorded release decision.', source: 'Internal policy', reference: 'DEMO-POL-01 §3' },
    { id: 'media-permissions', name: 'Permitted customer media use', description: 'The studio promises to record the permission and licence scope for media used in customer campaigns.', source: 'Customer commitment', reference: 'DEMO-SOW-04 §5' },
    { id: 'access-policy', name: 'Controlled account access', description: 'Named owners review publishing administrators and record removal of studio access.', source: 'Internal policy', reference: 'DEMO-POL-02 §2–4' },
    { id: 'recovery-policy', name: 'Demonstrated asset recovery', description: 'A current recovery exercise record is required for the media asset store.', source: 'Internal policy', reference: 'DEMO-POL-03 §2' },
    { id: 'customer-approval', name: 'Customer approval before release', description: 'The studio promises to retain customer sign-off before publishing their campaign.', source: 'Customer commitment', reference: 'DEMO-SOW-04 §4' },
  ],
};
