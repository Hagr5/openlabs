// Central challenge-state manager.
// Each protocol reports its own completion independently and in any order -
// including gRPC, which is no longer gated behind REST/GraphQL. The only
// gate in this design is on the FINAL flag reveal on the admin dashboard,
// which requires all three to be true regardless of how the player got
// there or in what order.

const FRAGMENTS = {
  rest: 'BOLA_',
  graphql: 'GRAPHQL_',
  grpc: 'GRPC_CHA1N'
};

// The flag is deliberately a fixed, independent value - NOT derived from
// or embedding the password fragments. Knowing the password (or the
// fragments) gives no information about the flag's content, and vice
// versa. The flag is only ever revealed via the admin dashboard once all
// three stages are complete.
const FLAG = 'AEGIS{CH41N3D_API_TRUST_BR34CH}';

// Fixed priority used to pick a hint target when more than one
// vulnerability is still outstanding after the player completes one.
const HINT_PRIORITY = ['rest', 'graphql', 'grpc'];

const HINTS = {
  rest: 'There is a routine profile management feature on this portal that might be worth a closer look - not everything it accepts behaves the way the interface suggests.',
  graphql: 'Legacy service interfaces used for internal migrations may still be reachable and were not covered by the latest hardening pass.',
  grpc: 'Some services listen through separate channels from the usual interfaces you have seen so far, and were never meant to be reachable from outside.'
};

const state = {
  rest_completed: false,
  graphql_completed: false,
  grpc_completed: false
};

function reset() {
  state.rest_completed = false;
  state.graphql_completed = false;
  state.grpc_completed = false;
}

// Returns the hint text to show after `justCompleted` finishes, pointing
// toward whichever outstanding vulnerability comes first in HINT_PRIORITY
// (excluding the one just completed). Returns null once everything is done.
function nextHint(justCompleted) {
  const completedMap = {
    rest: state.rest_completed,
    graphql: state.graphql_completed,
    grpc: state.grpc_completed
  };
  const candidate = HINT_PRIORITY.find(key => key !== justCompleted && !completedMap[key]);
  return candidate ? HINTS[candidate] : null;
}

function completeRest() {
  const first = !state.rest_completed;
  state.rest_completed = true;
  return { first, fragment: FRAGMENTS.rest, hint: nextHint('rest') };
}

function completeGraphql() {
  const first = !state.graphql_completed;
  state.graphql_completed = true;
  return { first, fragment: FRAGMENTS.graphql, hint: nextHint('graphql') };
}

function completeGrpc() {
  const first = !state.grpc_completed;
  state.grpc_completed = true;
  return { first, fragment: FRAGMENTS.grpc, hint: nextHint('grpc') };
}

// The three fragments concatenated together form the literal password an
// attacker needs to log in as the admin account through the normal login
// form, once they have all three.
function combinedPassword() {
  return `${FRAGMENTS.rest}${FRAGMENTS.graphql}${FRAGMENTS.grpc}`;
}

function flag() {
  return FLAG;
}

function allComplete() {
  return state.rest_completed && state.graphql_completed && state.grpc_completed;
}

function status() {
  return {
    rest_completed: state.rest_completed,
    graphql_completed: state.graphql_completed,
    grpc_completed: state.grpc_completed,
    fragments: {
      rest: state.rest_completed ? FRAGMENTS.rest : null,
      graphql: state.graphql_completed ? FRAGMENTS.graphql : null,
      grpc: state.grpc_completed ? FRAGMENTS.grpc : null
    }
  };
}

module.exports = {
  state,
  reset,
  completeRest,
  completeGraphql,
  completeGrpc,
  combinedPassword,
  allComplete,
  flag,
  status
};
