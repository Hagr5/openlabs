/**
 * authService.js
 *
 * Step 2 — Authentication service.
 *
 * Design contract (see resolver-design.md §1):
 *   - The INTENDED path verifies `password.value` as a plain string against
 *     the stored bcrypt hash.
 *   - A LEGACY fallback path exists for delegated/SSO-style logins, kept for
 *     backward compatibility with old mobile clients that used to send
 *     `password.username` + `password.ssoProvider` instead of a raw secret.
 *   - The fallback is real, functional code — not a decorative bug — but it
 *     trusts client-supplied fields it should not trust, which is the
 *     intentional vulnerability.
 */

function createAuthService({ userModel, sessionModel }) {
  return {
    /**
     * @param {string} username
     * @param {{ value?: string, username?: string, ssoProvider?: string }} password
     * @returns {{ token: string, user: object } | null}
     */
    login(username, password) {
      const user = userModel.findByUsername(username);
      if (!user) {
        return null; // same generic failure as a wrong password
      }

      // ---- INTENDED path: plain-password verification ----
      if (typeof password?.value === 'string' && password.value.length > 0) {
        const ok = userModel.verifyPassword(user, password.value);
        if (!ok) return null;
        return this._issueSession(user);
      }

      // ---- LEGACY fallback path: delegated / SSO-style login ----
      // Historically used by older mobile clients: instead of a secret,
      // they'd send back the provider's confirmed username plus a provider
      // tag, and the backend trusted the upstream IdP to have done the real
      // authentication.
      //
      // INTENTIONAL FLAW: this backend never actually calls out to an IdP.
      // It only checks that the client-supplied `password.username` matches
      // the `username` field of the very same request — both of which are
      // attacker-controlled. No real identity check occurs.
      if (typeof password?.username === 'string') {
        if (password.username === username) {
          return this._issueSession(user);
        }
        return null;
      }

      return null;
    },

    _issueSession(user) {
      const token = sessionModel.create(user.id);
      return { token, user };
    },
  };
}

module.exports = { createAuthService };
