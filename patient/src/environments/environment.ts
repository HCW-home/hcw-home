export const environment = {
  production: false,
  environment: 'development',

  apiUrl: 'http://localhost:3000/api/v1',
  baseUrl: 'http://localhost:3000',

  wsUrl: 'http://localhost:3000',
  socketUrl: 'http://localhost:3000',

  healthCheckUrl: 'http://localhost:3000/health',
  healthCheckInterval: 30000, // 30 seconds

  connectionTimeout: 10000, // 10 seconds
  maxRetryAttempts: 5,
  retryDelay: 2000, // 2 seconds

  enableDevTools: true,
  enableDebugLogging: true,
  enableMockData: false,

  corsEnabled: true,

  mediaConfig: {
    videoEnabled: true,
    audioEnabled: true,
    screenShareEnabled: true,
    maxBitrate: 1000000, // 1 Mbps
  },

  chatConfig: {
    maxMessageLength: 1000,
    messageTimeout: 30000,
    reconnectAttempts: 3,
  },

  appConfig: {
    name: 'HCW-Home Patient',
    version: '1.0.0',
    buildTime: new Date().toISOString(),
  }
};

