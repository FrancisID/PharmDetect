require('dotenv').config();
const express = require('express');
const cors = require('cors');

const medicationsRouter = require('./routes/medications');
const scanRouter = require('./routes/scan');
const authRouter = require('./routes/auth');
const accountsRouter = require('./routes/accounts');
const users = require('./db/users');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'pharmdetect-pharma-server' }));
app.use('/api/medications', medicationsRouter);
app.use('/api', scanRouter); // /api/scan, /api/purchase
app.use('/api/auth', authRouter);
app.use('/api', accountsRouter); // /api/admin/..., /api/superuser/...

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`PharmDetect Pharmaceutical Database server listening on http://localhost:${PORT}`);
  if (!process.env.COUNTERFEIT_API_URL) {
    console.warn('COUNTERFEIT_API_URL is not set — counterfeit/expired findings will NOT be reported anywhere. Set it in .env.');
  }
  await users.ensureSuperuser();
});
