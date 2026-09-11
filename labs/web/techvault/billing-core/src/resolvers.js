const { ACCOUNTS } = require('./data');

const resolvers = {
  Query: {
    healthCheck: () => 'ok',

    accountBalance: (_parent, { accountId }) => {
      return ACCOUNTS[accountId] || null;
    },
  },
};

module.exports = { resolvers };
