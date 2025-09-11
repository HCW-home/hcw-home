export const environment = {
  production: true,
  environment: 'production',

  apiUrl: 'https://your-production-api.com/api/v1',
  baseUrl: 'https://your-production-api.com',

  wsUrl: 'https://your-production-api.com',
  socketUrl: 'https://your-production-api.com',

  healthCheckUrl: 'https://your-production-api.com/health',
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
  },

  stripePublishableKey: ""

};
