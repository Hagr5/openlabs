/**
 * previewService.js
 *
 * Step 4 — Preview generation.
 * Called EXCLUSIVELY from the `generatePreview` GraphQL mutation resolver
 * (there is no REST route anywhere in this app — see resolver-design.md
 * and the project constraint: GraphQL API only).
 *
 * Design contract (resolver-design.md §2):
 *   - INTENDED behavior: fetch `sourceUrl` and render a short preview.
 *   - INTENTIONAL VULNERABILITY: `sourceUrl` is interpolated into a shell
 *     command string instead of being passed as a properly escaped
 *     argument. A partial filter exists (rejects `;`, `|`, and a few
 *     literal dangerous commands) but does NOT account for command
 *     substitution syntax ($(...) / backticks) — this is the intended
 *     bypass, not an oversight to "fix" here.
 *   - Do NOT sanitize this further — it is the challenge.
 */

const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

// Deliberately partial denylist — documented here so the filter's exact
// boundary is fixed and deterministic across resets (resolver-design.md
// sanity check: "filter behavior must be documented precisely").
const BLOCKED_PATTERNS = [
  ';',
  '|',
  '&&',
  '\n',
  'rm ',
  'wget ',
  'curl ',
];

function isObviouslyBlocked(input) {
  const lower = input.toLowerCase();
  return BLOCKED_PATTERNS.some((p) => lower.includes(p));
  // NOTE (intentional gap): does not check for `$(`, '`', or other shell
  // substitution syntax. This is the documented, intended bypass vector.
}

function createPreviewService({ artifactService }) {
  return {
    /**
     * Kicks off preview generation. Returns immediately with the created
     * (PENDING) artifact id + a short synchronous `message` (first line of
     * output, if the underlying command completes quickly) per the
     * `GeneratePreviewResult` GraphQL type.
     */
    async generate({ ownerUserId, sourceUrl, format = 'html' }) {
      const artifact = artifactService.create({
        ownerUserId,
        title: `Preview: ${sourceUrl.slice(0, 60)}`,
        source: 'preview',
      });

      if (isObviouslyBlocked(sourceUrl)) {
        artifactService.fail(artifact.id, 'Invalid characters in source');
        return {
          artifactId: artifact.id,
          status: 'FAILED',
          message: 'Invalid characters in source',
        };
      }

      try {
        // -----------------------------------------------------------------
        // INTENTIONAL VULNERABILITY: sourceUrl is embedded directly into a
        // shell command string via `sh -c`, rather than being passed as an
        // isolated argument to a fixed program. `execFile('sh', ['-c', ...])`
        // still creates a real shell, so `$(...)`/backticks inside
        // `sourceUrl` are evaluated by /bin/sh before the "fetch" tool ever
        // sees them — this is the intended command-injection primitive.
        // -----------------------------------------------------------------
        const shellCommand = `/app/tools/preview-render.sh --format=${format} --source="${sourceUrl}"`;
        const { stdout } = await execFileAsync('sh', ['-c', shellCommand], {
          timeout: 5000,
          maxBuffer: 1024 * 1024,
        });

        const content = stdout || '(no output)';
        artifactService.complete(artifact.id, content);

        return {
          artifactId: artifact.id,
          status: 'COMPLETED',
          message: content.split('\n')[0]?.slice(0, 200) ?? null,
        };
      } catch (err) {
        // Command failures (including a nonexistent `preview-render` binary
        // in dev) still surface partial stdout/stderr — kept generic here;
        // exact wording is finalized once billing-core / seed data exist.
        const output = (err.stdout || err.message || 'Preview failed').toString();
        artifactService.complete(artifact.id, output);
        return {
          artifactId: artifact.id,
          status: 'COMPLETED',
          message: output.split('\n')[0]?.slice(0, 200) ?? null,
        };
      }
    },
  };
}

module.exports = { createPreviewService, isObviouslyBlocked, BLOCKED_PATTERNS };
