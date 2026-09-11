/**
 * artifactService.js
 *
 * Step 3 — Unified artifact storage service.
 *
 * This is the convergence point of the attack chain (see resolver-design.md
 * §4 "Dependency Chain"): BOTH `generatePreview` (command-injection surface,
 * step 4) and the billing-core SSRF side effect (step 7) write through this
 * SAME service, into the SAME `preview_artifacts` table.
 *
 * Design contract:
 *   - `create()` / `complete()` / `fail()` are the only write paths.
 *   - `listForOwner()` returns METADATA ONLY (no `content`) — matches the
 *     `PreviewArtifact` GraphQL type (list view).
 *   - `getContentForOwner()` is the ONLY read path that returns `content`,
 *     and it is ownership-checked via artifactModel.findByIdForOwner().
 *     There is no other function in this service (or anywhere else) that
 *     exposes `content` without that check — this is the single choke
 *     point that keeps `previewArtifact(id)` free of IDOR.
 */

function createArtifactService({ artifactModel }) {
  return {
    /**
     * Creates a PENDING artifact and returns it immediately (synchronous
     * creation; completion happens via complete()/fail() once the
     * underlying work — preview render or billing-core call — finishes).
     *
     * @param {string} ownerUserId
     * @param {string} title
     * @param {'preview'|'competitor_check'} source - internal bookkeeping
     *        only, never exposed through the GraphQL schema.
     */
    create({ ownerUserId, title, source }) {
      return artifactModel.create({ ownerUserId, title, source, status: 'PENDING' });
    },

    complete(artifactId, content) {
      return artifactModel.update(artifactId, { status: 'COMPLETED', content });
    },

    fail(artifactId, reason = null) {
      return artifactModel.update(artifactId, { status: 'FAILED', content: reason });
    },

    /**
     * List view for `myPreviewArtifacts` — metadata only, current user's
     * artifacts, most recent first. No content field is ever attached here.
     */
    listForOwner(ownerUserId, limit = 10) {
      return artifactModel.listByOwner(ownerUserId, limit).map((a) => ({
        id: a.id,
        createdAt: a.created_at,
        status: a.status,
        title: a.title,
      }));
    },

    /**
     * Content retrieval for `previewArtifact(id)` — the ONLY function that
     * returns `content`. Ownership-checked at the model layer; returns
     * `undefined` uniformly whether the artifact doesn't exist or belongs
     * to someone else (no distinguishing information leak).
     */
    getContentForOwner(artifactId, ownerUserId) {
      const artifact = artifactModel.findByIdForOwner(artifactId, ownerUserId);
      if (!artifact) return undefined;
      return {
        id: artifact.id,
        createdAt: artifact.created_at,
        status: artifact.status,
        title: artifact.title,
        content: artifact.content,
      };
    },
  };
}

module.exports = { createArtifactService };
