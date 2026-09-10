const express = require('express');
const http = require('http');
const { requireAuth, requireRole } = require('../middleware/auth');

const INTERNAL_SERVICE_HOST = process.env.INTERNAL_SERVICE_HOST || 'internal-processing-svc';
const INTERNAL_SERVICE_PORT = process.env.INTERNAL_SERVICE_PORT || 8081;

const router = express.Router();

function fetchDirectoryStatus() {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: INTERNAL_SERVICE_HOST,
        port: INTERNAL_SERVICE_PORT,
        path: '/directory-status',
        timeout: 3000
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('internal service timeout'));
    });
  });
}

// This route is intentionally NOT listed in /api/docs, not linked from any
// other response, and not guessable from a predictable naming scheme - it
// only ever appears as a string inside uploaded photos' EXIF metadata (see
// routes/photos.js). Discovering the path takes the excessive-data-exposure
// step; reaching it once discovered takes the admin role, which is only
// obtainable by exploiting the JWT algorithm-confusion flaw in
// middleware/auth.js. The path itself is not the security boundary - the
// requireRole('admin') check below is. An employee token that somehow
// learned this path (e.g. by reading this source file) still gets 403.
async function handleDirectorySync(req, res) {
  try {
    const result = await fetchDirectoryStatus();
    res.status(200).json({ status: 'synced', log: result.body });
  } catch (e) {
    res.status(502).json({ error: 'Bad Gateway', message: 'internal service unavailable' });
  }
}

router.get('/8d2158cd-hr-sync', requireAuth, requireRole('admin'), handleDirectorySync);

module.exports = router;
