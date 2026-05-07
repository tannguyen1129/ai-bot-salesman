export const QueueNames = {
  DISCOVERY: 'discovery',
  ENRICHMENT: 'enrichment',
  AI: 'ai',
  OUTREACH: 'outreach'
} as const;

export const WorkflowEvents = {
  DiscoveryQueued: 'discovery.queued',
  DiscoveryCompleted: 'discovery.completed',
  CandidateScored: 'candidate.scored',
  OutreachDraftReady: 'outreach.draft.ready'
} as const;
