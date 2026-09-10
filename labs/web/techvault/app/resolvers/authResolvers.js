/**
 * authResolvers.js
 * Wires the `login` mutation to authService. No vulnerability logic lives
 * here — it's fully contained in authService.js (single source of truth,
 * documented in resolver-design.md §1).
 */

function createAuthResolvers({ authService }) {
  return {
    Mutation: {
      login: (_parent, { username, password }) => {
        const result = authService.login(username, password);
        if (!result) {
          // Deliberately generic — does not distinguish "wrong password"
          // from "fell through every branch" (keeps error messages
          // consistent per resolver-design.md sanity checks).
          throw new Error('Invalid credentials');
        }
        return {
          token: result.token,
          user: result.user,
        };
      },
    },
  };
}

module.exports = { createAuthResolvers };
