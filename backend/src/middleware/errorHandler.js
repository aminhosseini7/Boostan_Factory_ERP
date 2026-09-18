module.exports = (err, req, res, next) => {
  if (err?.name === 'ZodError') {
    return res.status(400).json({ success: false, message: 'Validation failed', details: err.flatten?.() || err.issues });
  }
  if (err?.code === '23505') return res.status(409).json({ success: false, message: 'A record with the same unique value already exists' });
  if (err?.code === '23503') return res.status(400).json({ success: false, message: 'This operation references a missing or protected record' });
  if (err?.code === '23514') return res.status(400).json({ success: false, message: 'Data violates a business constraint' });
  const status = Number(err.status || 500);
  if (status >= 500) console.error(err);
  return res.status(status).json({ success: false, message: err.message || 'Internal Server Error', ...(err.details !== undefined ? { details: err.details } : {}) });
};
