require('dotenv').config();
const express = require('express');
const cors = require('cors');

const counterfeitReportsRouter = require('./routes/counterfeitReports');
const authRouter = require('./routes/auth');
const accountsRouter = require('./routes/accounts');
const users = require('./db/users');
const { scheduleReport } = require('./services/emailReport');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'pharmdetect-counterfeit-server' }));
app.use('/api/counterfeit-reports', counterfeitReportsRouter);
app.use('/api/auth', authRouter);
app.use('/api', accountsRouter); // /api/admin/..., /api/superuser/...

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  console.log(`PharmDetect Counterfeit and Fake Medication Database server listening on http://localhost:${PORT}`);
  scheduleReport();
  await users.ensureSuperuser();
});
