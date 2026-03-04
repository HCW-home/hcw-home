export const environment = {
  production: true,
  apiUrl: '/api',
  get wsUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
};
