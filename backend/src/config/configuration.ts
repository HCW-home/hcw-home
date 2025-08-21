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
    title: 'HCW-Home Backend API',
    description:
      'Comprehensive API documentation for HCW-Home Backend services',
    version: '1.0.0',
  },
  frontendConfig: {
    loginMethod: process.env.LOGIN_METHOD || 'password',
    branding: process.env.BRANDING || '@HOME',
    logo: process.env.LOGO || '',
  },
  logFormat: process.env.LOGFORMAT || 'default',
  mediasoupAnnouncedIp: process.env.MEDIASOUP_ANNOUNCED_IP,
  redisUrl: process.env.REDIS_URL,
  serverId: process.env.SERVER_ID || 'server1',
  consultationRetentionHours: parseInt(
    process.env.CONSULTATION_RETENTION_HOURS ?? '24',
    10,
  ),
  consultationDeletionBufferHours: parseInt(
    process.env.CONSULTATION_DELETION_BUFFER_HOURS ?? '1',
    10,
  ),

  oidc: {
    issuer: process.env.OPENID_ISSUER_URL,
    authorizationURL: process.env.OPENID_AUTHORIZATION_URL,
    tokenURL: process.env.OPENID_TOKEN_URL,
    userInfoURL: process.env.OPENID_USERINFO_URL,
    clientID: process.env.OPENID_CLIENT_ID,
    clientSecret: process.env.OPENID_CLIENT_SECRET,
    callbackBaseURL: process.env.OPENID_CALLBACK_BASE_URL,
    scope: (process.env.OPENID_SCOPE || 'openid,profile,email').split(','),
  },
  cloudinary: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  },
});
