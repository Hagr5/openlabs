/**
 * previewResolvers.js
 * Wires the `generatePreview` GraphQL mutation. No injection logic here —
 * fully contained in previewService.js (single source of truth).
 */

function requireAuth(context) {
  if (!context.currentUser) {
    throw new Error('Not authenticated');
  }
  return context.currentUser;
}

function createPreviewResolvers({ previewService }) {
  return {
    Mutation: {
      generatePreview: async (_parent, { sourceUrl, format }, context) => {
        const user = requireAuth(context);
        return previewService.generate({
          ownerUserId: user.id,
          sourceUrl,
          format,
        });
      },
    },
  };
}

module.exports = { createPreviewResolvers };
