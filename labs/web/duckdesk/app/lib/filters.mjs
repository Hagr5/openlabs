import Database from 'better-sqlite3';

const AGENT_COLUMNS = [
  'displayName',
  'email',
  'department',
  'role',
  'isActive',
  'hireDate',
  'passwordHash'
];

function escapeLike(value) {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function buildAgentWhere(filter) {
  if (!filter) return { sql: '', params: [] };

  const conditions = [];
  const params = [];

  if (filter.displayName) {
    const f = filter.displayName;
    if (f.eq !== undefined && f.eq !== null) {
      conditions.push('displayName = ?');
      params.push(f.eq);
    }
    if (f.ne !== undefined && f.ne !== null) {
      conditions.push('displayName != ?');
      params.push(f.ne);
    }
    if (f.contains !== undefined && f.contains !== null) {
      conditions.push('displayName LIKE ? ESCAPE \'\\\'');
      params.push(`%${escapeLike(f.contains)}%`);
    }
    if (f.startsWith !== undefined && f.startsWith !== null) {
      conditions.push('displayName LIKE ? ESCAPE \'\\\'');
      params.push(`${escapeLike(f.startsWith)}%`);
    }
    if (f.endsWith !== undefined && f.endsWith !== null) {
      conditions.push('displayName LIKE ? ESCAPE \'\\\'');
      params.push(`%${escapeLike(f.endsWith)}`);
    }
  }

  if (filter.email) {
    const f = filter.email;
    if (f.eq !== undefined && f.eq !== null) {
      conditions.push('email = ?');
      params.push(f.eq);
    }
    if (f.ne !== undefined && f.ne !== null) {
      conditions.push('email != ?');
      params.push(f.ne);
    }
    if (f.contains !== undefined && f.contains !== null) {
      conditions.push('email LIKE ? ESCAPE \'\\\'');
      params.push(`%${escapeLike(f.contains)}%`);
    }
    if (f.startsWith !== undefined && f.startsWith !== null) {
      conditions.push('email LIKE ? ESCAPE \'\\\'');
      params.push(`${escapeLike(f.startsWith)}%`);
    }
    if (f.endsWith !== undefined && f.endsWith !== null) {
      conditions.push('email LIKE ? ESCAPE \'\\\'');
      params.push(`%${escapeLike(f.endsWith)}`);
    }
  }

  if (filter.department) {
    const f = filter.department;
    if (f.eq !== undefined && f.eq !== null) {
      conditions.push('department = ?');
      params.push(f.eq);
    }
    if (f.ne !== undefined && f.ne !== null) {
      conditions.push('department != ?');
      params.push(f.ne);
    }
    if (f.contains !== undefined && f.contains !== null) {
      conditions.push('department LIKE ? ESCAPE \'\\\'');
      params.push(`%${escapeLike(f.contains)}%`);
    }
    if (f.startsWith !== undefined && f.startsWith !== null) {
      conditions.push('department LIKE ? ESCAPE \'\\\'');
      params.push(`${escapeLike(f.startsWith)}%`);
    }
    if (f.endsWith !== undefined && f.endsWith !== null) {
      conditions.push('department LIKE ? ESCAPE \'\\\'');
      params.push(`%${escapeLike(f.endsWith)}`);
    }
  }

  if (filter.role) {
    const f = filter.role;
    if (f.eq !== undefined && f.eq !== null) {
      conditions.push('role = ?');
      params.push(f.eq);
    }
  }

  if (filter.isActive !== undefined && filter.isActive !== null) {
    conditions.push('isActive = ?');
    params.push(filter.isActive ? 1 : 0);
  }

  if (filter.hiredAfter) {
    conditions.push('hireDate > ?');
    params.push(filter.hiredAfter);
  }

  if (filter.hiredBefore) {
    conditions.push('hireDate < ?');
    params.push(filter.hiredBefore);
  }

  if (filter.passwordHash) {
    const f = filter.passwordHash;
    if (f.eq !== undefined && f.eq !== null) {
      conditions.push('passwordHash = ?');
      params.push(f.eq);
    }
    if (f.ne !== undefined && f.ne !== null) {
      conditions.push('passwordHash != ?');
      params.push(f.ne);
    }
    if (f.contains !== undefined && f.contains !== null) {
      conditions.push('passwordHash LIKE ? ESCAPE \'\\\'');
      params.push(`%${escapeLike(f.contains)}%`);
    }
    if (f.startsWith !== undefined && f.startsWith !== null) {
      conditions.push('passwordHash LIKE ? ESCAPE \'\\\'');
      params.push(`${escapeLike(f.startsWith)}%`);
    }
    if (f.endsWith !== undefined && f.endsWith !== null) {
      conditions.push('passwordHash LIKE ? ESCAPE \'\\\'');
      params.push(`%${escapeLike(f.endsWith)}`);
    }
  }

  return { sql: conditions.join(' AND '), params };
}

export function validateFilterKeys(filter, allowedColumns) {
  if (!filter) return;
  const allKeys = new Set();
  for (const col of allowedColumns) {
    allKeys.add(col);
  }
  // StringFilter sub-keys are always valid
  const stringFilterKeys = new Set(['eq', 'ne', 'contains', 'startsWith', 'endsWith']);
  for (const [key, value] of Object.entries(filter)) {
    if (!allKeys.has(key) && key !== 'role' && key !== 'isActive') {
      throw new Error(`Unknown filter field: ${key}`);
    }
    if (value && typeof value === 'object') {
      for (const subKey of Object.keys(value)) {
        if (!stringFilterKeys.has(subKey)) {
          throw new Error(`Unknown filter operator: ${subKey}`);
        }
      }
    }
  }
}
