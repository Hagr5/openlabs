/**
 * artifactResolvers.js
 * `previewArtifact` and `myPreviewArtifacts` — the convergence-point queries.
 * Auth guard: both require an authenticated session (context.currentUser).
 */

function requireAuth(context) {
  if (!context.currentUser) {
    throw new Error('Not authenticated');
  }
  return context.currentUser;
}

function createArtifactResolvers({ artifactService }) {
  return {
    Query: {
      myPreviewArtifacts: (_parent, { limit = 10 }, context) => {
        const user = requireAuth(context);
        return artifactService.listForOwner(user.id, limit);
      },

      previewArtifact: (_parent, { id }, context) => {
        const user = requireAuth(context);
        const artifact = artifactService.getContentForOwner(id, user.id);
        // Deliberately return null (not an error) for both "not found" and
        // "belongs to someone else" — consistent with resolver-design.md's
        // requirement to avoid leaking which case occurred.
        return artifact ?? null;
      },
    },
  };
}

module.exports = { createArtifactResolvers };
