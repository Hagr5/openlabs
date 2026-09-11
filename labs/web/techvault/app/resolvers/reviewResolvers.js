/**
 * reviewResolvers.js
 *
 * Public, unauthenticated product reviews. Purely flavor/storefront
 * content — no database table needed, fixed and deterministic.
 *
 * DESIGN NOTE: one review (by "alice", on LP-1301) is the intended way
 * players discover a valid, real username to use with `login` — entirely
 * in-band, via ordinary API exploration (introspection reveals `reviews`
 * exists; querying it is a completely unauthenticated, unremarkable
 * storefront feature). No out-of-band hint (README, etc.) is needed or
 * used for this. See resolver-design.md and DESIGN_DOCUMENT.md §4.
 */

const REVIEWS = [
  {
    id: 'rev-1',
    laptopId: 'LP-1401',
    author: 'omar_k',
    rating: 5,
    comment: 'Great build quality, battery lasts all day. Very happy with this purchase.',
  },
  {
    id: 'rev-2',
    laptopId: 'LP-1301',
    author: 'alice',
    rating: 4,
    comment:
      'Solid ultrabook for the price. Only complaint: I can never remember ' +
      'my password on this site and end up resetting it every single time ' +
      'I log in. Otherwise no issues with the laptop itself.',
  },
  {
    id: 'rev-3',
    laptopId: 'LP-2049',
    author: 'nadia_r',
    rating: 5,
    comment: 'The RTX 4070 handles everything I throw at it. Worth every penny.',
  },
  {
    id: 'rev-4',
    laptopId: 'LP-1501',
    author: 'tariq88',
    rating: 3,
    comment: 'Does the job for basic tasks, but the fan gets loud under load.',
  },
];

function createReviewResolvers() {
  return {
    Query: {
      reviews: () => REVIEWS,
    },
  };
}

module.exports = { createReviewResolvers };
