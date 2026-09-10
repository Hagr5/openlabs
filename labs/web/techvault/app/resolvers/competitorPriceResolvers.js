/**
 * competitorPriceResolvers.js
 * Wires the `fetchCompetitorPrice` GraphQL mutation. No SSRF logic here —
 * fully contained in competitorPriceService.js (single source of truth).
 */

function requireAuth(context) {
  if (!context.currentUser) {
    throw new Error('Not authenticated');
  }
  return context.currentUser;
}

function createCompetitorPriceResolvers({ competitorPriceService }) {
  return {
    Mutation: {
      fetchCompetitorPrice: async (_parent, { productId, target }, context) => {
        const user = requireAuth(context);
        return competitorPriceService.check({
          ownerUserId: user.id,
          productId,
          target,
        });
      },
    },
  };
}

module.exports = { createCompetitorPriceResolvers };
