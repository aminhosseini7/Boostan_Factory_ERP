const required = ['DATABASE_URL', 'JWT_SECRET'];

function getEnv() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    const error = new Error(`Missing environment variables: ${missing.join(', ')}`);
    error.status = 500;
    throw error;
  }

  return {
    port: Number(process.env.PORT || 5000),
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    pdfFontPath: process.env.PDF_FONT_PATH || ''
  };
}

module.exports = { getEnv };
