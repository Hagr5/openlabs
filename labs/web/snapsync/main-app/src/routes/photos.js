const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const piexif = require('piexifjs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only JPEG images are accepted'));
    }
    cb(null, true);
  }
});

const router = express.Router();

// Internal-processing step: every uploaded photo is "processed" (in a real
// system this might be a thumbnail/watermark pipeline). As part of that
// processing, an internal reference is written into the image's EXIF
// UserComment field, pointing at the real (unlisted, undocumented) admin
// directory-sync endpoint. This is normal-looking internal bookkeeping that
// is never stripped before the file is served back to the client - the
// "excessive data exposure" vulnerability for this challenge. The path is
// the same for every photo (it's not a per-resource secret, it's an
// undocumented route) - what actually gates access is the admin role
// check on that route, not knowledge of the path.
const DIRECTORY_SYNC_PATH = '/api/directory/8d2158cd-hr-sync';

function processAndTagPhoto(buffer) {
  const dataUrl = 'data:image/jpeg;base64,' + buffer.toString('base64');
  let exifObj;
  try {
    exifObj = piexif.load(dataUrl);
  } catch (e) {
    exifObj = { '0th': {}, Exif: {}, GPS: {}, Interop: {}, '1st': {} };
  }

  exifObj['0th'][piexif.ImageIFD.Software] = 'SnapSync-InternalProcessor-v2.3';
  exifObj.Exif[piexif.ExifIFD.UserComment] = 'internal-ref: ' + DIRECTORY_SYNC_PATH;

  const exifBytes = piexif.dump(exifObj);
  const newDataUrl = piexif.insert(exifBytes, dataUrl);
  const base64Data = newDataUrl.replace(/^data:image\/jpeg;base64,/, '');
  return Buffer.from(base64Data, 'base64');
}

router.get('/', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.user.sub);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const photos = db
    .prepare('SELECT id, created_at FROM photos WHERE owner_id = ? ORDER BY created_at DESC')
    .all(user.id);

  res.json({
    photos: photos.map((p) => ({
      photoId: p.id,
      createdAt: p.created_at,
      downloadUrl: `/api/photos/${p.id}`
    }))
  });
});

router.post('/upload', requireAuth, upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Bad Request', message: 'photo file required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.user.sub);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const photoId = 'ph_' + uuidv4().slice(0, 8);
  const filename = photoId + '.jpg';

  let processed;
  try {
    processed = processAndTagPhoto(req.file.buffer);
  } catch (e) {
    // If EXIF processing fails for a given file, still store the original
    // so the upload feature itself never breaks.
    processed = req.file.buffer;
  }

  fs.writeFileSync(path.join(UPLOAD_DIR, filename), processed);

  db.prepare(
    'INSERT INTO photos (id, owner_id, filename, created_at) VALUES (?, ?, ?, ?)'
  ).run(photoId, user.id, filename, new Date().toISOString());

  res.json({
    photoId,
    status: 'processed',
    downloadUrl: `/api/photos/${photoId}`
  });
});

router.get('/:id', requireAuth, (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Not Found' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.user.sub);
  if (!user || photo.owner_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden', message: 'You do not own this photo' });
  }

  const filePath = path.join(UPLOAD_DIR, photo.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not Found' });

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
