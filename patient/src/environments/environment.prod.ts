export const environment = {
  production: true,
  environment: 'production',

  apiUrl: process.env['NG_APP_API_URL'] || 'https://your-production-api.com/api/v1',
  baseUrl: process.env['NG_APP_BASE_URL'] || 'https://your-production-api.com',

  wsUrl: process.env['NG_APP_WS_URL'] || 'https://your-production-api.com',
  socketUrl: process.env['NG_APP_SOCKET_URL'] || 'https://your-production-api.com',

  healthCheckUrl: process.env['NG_APP_HEALTH_URL'] || 'https://your-production-api.com/health',
  healthCheckInterval: 60000, // 1 minute in production

  connectionTimeout: 15000, // 15 seconds
  maxRetryAttempts: 3,
  retryDelay: 5000, // 5 seconds

  enableDevTools: false,
  enableDebugLogging: false,
  enableMockData: false,

  corsEnabled: false,

  mediaConfig: {
    videoEnabled: true,
    audioEnabled: true,
    screenShareEnabled: true,
    maxBitrate: 2000000, // 2 Mbps for better quality in production
  },

  chatConfig: {
    maxMessageLength: 1000,
    messageTimeout: 45000, // Longer timeout in production
    reconnectAttempts: 5,
  },

  appConfig: {
    name: 'HCW-Home Patient',
    version: '1.0.0',
    buildTime: new Date().toISOString(),
  }
};
