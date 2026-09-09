// In-memory "database" for the AEGIS internal portal.
// Reset on process restart -> satisfies deterministic reset requirement.

const challengeState = require('./state');

function freshEmployees() {
  return [
    {
      employee_id: 76,
      username: 'alex',
      password: 'Winter2024!', // starting attacker credentials (given in README)
      display_name: 'Alex Carter',
      department: 'Engineering',
      access_tier: 'user'
    },
    {
      employee_id: 84,
      username: 'sara',
      password: 'HrPortal!2024',
      display_name: 'Sara Youssef',
      department: 'Human Resources',
      access_tier: 'user'
    },
    {
      employee_id: 62,
      username: 'admin',
      // Historical migration bug: this account's access tier was reset to
      // "user" during an HR system migration and was never corrected,
      // because the real admin panel authorizes off this same internal
      // field - there is no separate "role" column in the real schema.
      // Note: low employee IDs correspond to accounts created early in the
      // company's history - a common real-world signal that an ID in this
      // range may belong to a founding/administrative account.
      //
      // The real password is the concatenation of all three recovery
      // fragments (see src/state.js). It is unguessable without solving
      // all three vulnerabilities and cannot be reached by any shortcut
      // (e.g. an empty/null credential) the way it could in an earlier
      // revision of this challenge.
      password: challengeState.combinedPassword(),
      display_name: 'System Administrator',
      department: 'IT',
      access_tier: 'user'
    }
  ];
}

let employees = freshEmployees();

function reset() {
  employees = freshEmployees();
}

function findByUsername(username) {
  return employees.find(e => e.username === username);
}

function findById(id) {
  return employees.find(e => e.employee_id === Number(id));
}

// Display-only role, derived from the real internal field. Never stored
// directly - this is what makes `role` a decoy for naive mass-assignment
// attempts.
function displayRole(employee) {
  return /admin/i.test(employee.access_tier || '') ? 'admin' : 'employee';
}

module.exports = { employees, reset, findByUsername, findById, displayRole };
