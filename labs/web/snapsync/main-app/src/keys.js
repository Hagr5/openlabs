const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pem2jwk } = require('pem-jwk');

const KEY_DIR = process.env.KEY_DIR || path.join(__dirname, '..', 'keys');
if (!fs.existsSync(KEY_DIR)) fs.mkdirSync(KEY_DIR, { recursive: true });

const PRIVATE_KEY_PATH = path.join(KEY_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(KEY_DIR, 'public.pem');

const KID = 'snapsync-2026-01';

function ensureKeys() {
  if (!fs.existsSync(PRIVATE_KEY_PATH) || !fs.existsSync(PUBLIC_KEY_PATH)) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    fs.writeFileSync(PRIVATE_KEY_PATH, privateKey);
    fs.writeFileSync(PUBLIC_KEY_PATH, publicKey);
  }
}

ensureKeys();

const PRIVATE_KEY = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
const PUBLIC_KEY = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');

function getJwks() {
  const jwk = pem2jwk(PUBLIC_KEY);
  jwk.kid = KID;
  jwk.use = 'sig';
  jwk.alg = 'RS256';
  return { keys: [jwk] };
}

module.exports = { PRIVATE_KEY, PUBLIC_KEY, KID, getJwks };
