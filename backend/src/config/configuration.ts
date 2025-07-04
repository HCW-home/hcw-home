export default () => ({
  port: parseInt(process.env.PORT!, 10) || 3000,
  environment: process.env.NODE_ENV || 'development',
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    accessSecret: process.env.APP_SECRET || 'default_secret',
    accessExpiresIn: process.env.ACCESS_TOKEN_LIFE || '24h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default_refresh_secret',
    refreshExpiresIn: process.env.REFRESH_TOKEN_LIFE || '7d',
  },
  cors: {
    origin: [
      process.env.ADMIN_URL,
      process.env.PRACTITIONER_URL,
      process.env.PATIENT_URL,
    ].filter(Boolean),
  },
  
  swagger: {
    enabled: process.env.NODE_ENV === 'development',
    title: 'HCW-Home Backend API',
    description:
      'Comprehensive API documentation for HCW-Home Backend services',
    version: '1.0.0',
    path: 'api/docs',
  },
  frontend: {
    loginMethod: process.env.LOGIN_METHOD || 'password',
    branding: process.env.BRANDING || '@HOME',
    logo: process.env.LOGO || '',
  },
  log_formatter: {
    format: process.env.LOGFORMAT || 'default',
  },
});
