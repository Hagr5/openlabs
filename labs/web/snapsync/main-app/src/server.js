const express = require('express');
const path = require('path');
const authRouter = require('./routes/auth');
const photosRouter = require('./routes/photos');
const directoryRouter = require('./routes/directory');

const app = express();
app.disable('x-powered-by');
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/.well-known/jwks.json', (req, res) => {
  res.json(authRouter.getJwks());
});

// Lightweight, hand-maintained API reference for the public-facing routes.
// This only documents endpoints that are meant to be publicly known - it is
// not auto-generated from the router, so it cannot accidentally leak a
// route (like the internal directory-sync endpoint) that isn't meant to be
// listed here.
app.get('/api/docs', (req, res) => {
  res.json({
    name: 'SnapSync API',
    version: '1.0.0',
    endpoints: [
      { method: 'GET', path: '/api/health', auth: false, description: 'Liveness check.' },
      { method: 'GET', path: '/.well-known/jwks.json', auth: false, description: 'RSA public key(s) (JWK) used to verify RS256-signed access tokens.' },
      { method: 'POST', path: '/api/auth/signup', auth: false, description: 'Create a new account. Always issued the "employee" role.' },
      { method: 'POST', path: '/api/auth/login', auth: false, description: 'Authenticate an existing account and receive an access token.' },
      { method: 'GET', path: '/api/photos', auth: true, description: "List the authenticated user's own photos." },
      { method: 'POST', path: '/api/photos/upload', auth: true, description: 'Upload a JPEG photo (multipart field name "photo", max 8MB).' },
      { method: 'GET', path: '/api/photos/:id', auth: true, description: 'Download a photo you own.' }
    ]
  });
});

app.use('/api/auth', authRouter);
app.use('/api/photos', photosRouter);
app.use('/api/directory', directoryRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: 'Bad Request', message: err.message });
  }
  next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SnapSync main app listening on port ${PORT}`);
});
