const express = require('express');
const fs = require('fs');

const app = express();
app.disable('x-powered-by');

function loadFlag() {
  if (process.env.FLAG) return process.env.FLAG;
  if (process.env.FLAG_FILE && fs.existsSync(process.env.FLAG_FILE)) {
    return fs.readFileSync(process.env.FLAG_FILE, 'utf8').trim();
  }
  return null;
}

app.get('/directory-status', (req, res) => {
  const flag = loadFlag();
  if (!flag) {
    return res.status(500).json({ error: 'flag not configured' });
  }
  res.json({
    status: 'complete',
    flag
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`internal-processing-svc listening on port ${PORT}`);
});
