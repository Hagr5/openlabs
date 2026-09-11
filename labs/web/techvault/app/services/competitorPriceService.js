/**
 * competitorPriceService.js
 *
 * Step 6 — Blind SSRF.
 *
 * Design contract (resolver-design.md §3):
 *   - INTENDED behavior: given a competitor "target" reference, check their
 *     price for a product.
 *   - INTENTIONAL VULNERABILITY: `target` is treated as a raw URL and
 *     fetched server-side with NO allow-list on scheme/host — including no
 *     check against private IP ranges or internal DNS suffixes
 *     (e.g. `.techvault.local`). This lets an attacker-supplied `target`
 *     reach services on the internal Docker network that are not otherwise
 *     reachable from outside (e.g. billing-core).
 *   - BLIND: the caller only ever receives { success, checkedAt } — the
 *     response body is never echoed back directly.
 *   - SIDE EFFECT: on a successful fetch, the raw response body is stored
 *     through the SAME artifactService used by previewService (step 3/4),
 *     tagged with source: 'competitor_check' and owned by the SAME user
 *     who called this mutation — this is what lets the player later find
 *     it via `myPreviewArtifacts`.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

function fetchRaw(target, { timeoutMs = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(target);
    } catch (_) {
      reject(new Error('Malformed target'));
      return;
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(
      parsed,
      { timeout: timeoutMs },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', reject);
  });
}

function createCompetitorPriceService({ artifactService }) {
  return {
    /**
     * @param {string} ownerUserId
     * @param {string} productId
     * @param {string} target - attacker-influenceable; NOT validated
     *        against an allow-list (this is the intended vulnerability).
     */
    async check({ ownerUserId, productId, target }) {
      const checkedAt = new Date().toISOString();

      // -----------------------------------------------------------------
      // INTENTIONAL VULNERABILITY: no host/scheme allow-list. A production
      // implementation would restrict `target` to a fixed set of approved
      // competitor domains (or resolve+check the IP against private
      // ranges) before ever issuing this request. Neither check exists
      // here — see resolver-design.md §3 and the official remediation.
      // -----------------------------------------------------------------
      let result;
      try {
        result = await fetchRaw(target);
      } catch (err) {
        return { success: false, checkedAt, note: null };
      }

      // Create the artifact regardless of what was fetched — from the
      // player's point of view this mutation is (and must stay) blind;
      // the only observable signal is whether it succeeded at all.
      const artifact = artifactService.create({
        ownerUserId,
        title: `Competitor Check — ${productId}`,
        source: 'competitor_check',
      });
      artifactService.complete(artifact.id, result.body);

      // Soft, in-band hint (INTENTIONAL DESIGN — see resolver-design.md
      // §3 "note field"): confirms results are archived, without ever
      // exposing the fetched content itself. This nudges a player who has
      // reached this far toward checking the same artifact store used by
      // generatePreview, rather than leaving the blind response as a dead
      // end with no discoverable next step.
      return { success: true, checkedAt, note: 'Result archived in your reports' };
    },
  };
}

module.exports = { createCompetitorPriceService, fetchRaw };
