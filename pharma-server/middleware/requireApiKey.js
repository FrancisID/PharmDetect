// Protects writes to the Pharmaceutical Database (medication registration and
// purchase confirmation). Shared only with pharmaceutical manufacturers'
// registration tools and the consumer-facing Detector App — never with the
// separately hosted Counterfeit and Fake Medication Database.
module.exports = function requireApiKey(req, res, next) {
  const expected = process.env.API_KEY;
  if (!expected) return next(); // no key configured — open for local testing
  const provided = req.header('x-api-key');
  if (provided !== expected) {
    return res.status(401).json({ error: 'Missing or invalid x-api-key header' });
  }
  next();
};
