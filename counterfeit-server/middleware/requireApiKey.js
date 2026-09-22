// Protects writes to the Counterfeit and Fake Medication Database. In production
// this key is shared only with the Pharmaceutical Database server (which relays
// counterfeit/expired findings here) — never with consumer-facing apps directly.
module.exports = function requireApiKey(req, res, next) {
  const expected = process.env.API_KEY;
  if (!expected) return next(); // no key configured — open for local testing
  const provided = req.header('x-api-key');
  if (provided !== expected) {
    return res.status(401).json({ error: 'Missing or invalid x-api-key header' });
  }
  next();
};
