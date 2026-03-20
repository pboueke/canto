export function makeRedirectUri() {
  return 'http://localhost:8081';
}

export function exchangeCodeAsync() {
  return Promise.resolve({ accessToken: null, refreshToken: null, expiresIn: 3600 });
}

export function refreshAsync() {
  return Promise.resolve({ accessToken: null, expiresIn: 3600 });
}
