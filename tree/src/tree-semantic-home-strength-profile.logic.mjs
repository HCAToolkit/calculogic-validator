// Tree Stage 2 Semantic Home strength profile (Tree slice spec S2.7; calculogic-validator#102 Q4).
// Facets that describe an outcome and never change one, computed from the members C definitely holds
// after attribution. Never a single score, and never compared across candidates.

import { SEMANTIC_HOME_CHANNELS } from './tree-semantic-home-reasoning.knowledge.mjs';

const ratio = (numerator, denominator) => (denominator === 0 ? null : numerator / denominator);

const channelCounts = (members, channel) => {
  const counts = { match: 0, foreign: 0, notEvaluated: 0 };
  for (const member of members) {
    const { result } = member.channels[channel];
    if (result === 'match') counts.match += 1;
    else if (result === 'foreign') counts.foreign += 1;
    else counts.notEvaluated += 1;
  }
  return counts;
};

// Q4: same governing channel and same claim value (the root, or the full label token sequence).
export const claimOf = (candidate, governingChannel) => ({
  channel: governingChannel,
  value: governingChannel === SEMANTIC_HOME_CHANNELS.prefix ? candidate.labelTokens.join('\u0000') : candidate.lexicalRoot,
});

export const buildStrengthProfile = ({ candidate, governingChannel, definiteMembers, undeterminedMemberCount, reattributedMemberCount, rootReading }) => {
  const governing = channelCounts(definiteMembers, governingChannel);
  const supporting = definiteMembers.filter((member) => member.channels[governingChannel].result === 'match');
  const otherChannel = governingChannel === SEMANTIC_HOME_CHANNELS.prefix ? SEMANTIC_HOME_CHANNELS.root : null;
  const disagreeing = otherChannel
    ? definiteMembers.filter(
        (member) => (member.channels[governingChannel].result === 'match') !== (member.channels[otherChannel].result === 'match'),
      ).length
    : 0;
  return {
    coverage: ratio(governing.match + governing.foreign, definiteMembers.length),
    supportShare: ratio(governing.match, governing.match + governing.foreign),
    support: {
      singular: supporting.filter((member) => member.channels[governingChannel].ambiguity === 'singular').length,
      ambiguous: supporting.filter((member) => member.channels[governingChannel].ambiguity === 'ambiguous').length,
      direct: supporting.filter((member) => member.channels[governingChannel].position === 'direct').length,
      descendant: supporting.filter((member) => member.channels[governingChannel].position === 'descendant').length,
      supportingBranchCount: new Set(supporting.map((member) => member.branch)).size,
    },
    otherChannel: otherChannel ? { channel: otherChannel, ...channelCounts(definiteMembers, otherChannel) } : null,
    channelDisagreementMemberCount: disagreeing,
    reattributedMemberCount,
    attributionUndeterminedMemberCount: undeterminedMemberCount,
    rootAncestry: candidate.rootAncestry,
    bounded: candidate.bounded === true,
    ...(rootReading ? { rootReading } : {}),
  };
};
