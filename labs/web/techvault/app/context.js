/**
 * context.js — builds the per-request GraphQL context.
 * Extracts the bearer token, resolves it to a user, and exposes it to
 * every resolver as `context.currentUser`.
 */

function buildContext({ sessionModel, userModel }) {
  return ({ req }) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : null;

    let currentUser = null;
    if (token) {
      const userId = sessionModel.findUserIdByToken(token);
      if (userId) {
        currentUser = userModel.findById(userId);
      }
    }

    return { currentUser, token };
  };
}

module.exports = { buildContext };
