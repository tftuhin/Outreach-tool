// Authentication helper utilities for Outreach Tool
export const AUTH_COOKIE_NAME = 'outreach_auth_session';

export const AUTH_CREDENTIALS = {
  userId: process.env.AUTH_USER_ID || 'Tuhin',
  // Default salted SHA-256 hash for secure authentication
  passwordHash: process.env.AUTH_PASSWORD_HASH || '891f9e900132eb79b5fd8cd4c2421301b7bab0b89cfe40ddfc40cf4800275f37'
};

const AUTH_SALT = process.env.AUTH_SALT || 'zeon_outreach_auth_salt_98471923';
const AUTH_SECRET = process.env.AUTH_SECRET || 'zeon_outreach_auth_secret_key_tuhin_2025';
const encoder = new TextEncoder();

export async function hashPassword(password: string): Promise<string> {
  const data = encoder.encode(AUTH_SALT + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function validateCredentials(userIdInput: string, passwordInput: string): Promise<boolean> {
  if (!userIdInput || !passwordInput) return false;
  
  const isUserValid = userIdInput.trim().toLowerCase() === AUTH_CREDENTIALS.userId.toLowerCase();
  if (!isUserValid) return false;

  // Support direct environment variable override or cryptographic hash comparison
  if (process.env.AUTH_PASSWORD) {
    return passwordInput === process.env.AUTH_PASSWORD;
  }

  const computedHash = await hashPassword(passwordInput);
  return computedHash === AUTH_CREDENTIALS.passwordHash;
}

export async function createSessionToken(username: string): Promise<string> {
  const timestamp = Date.now();
  const data = `${username}:${timestamp}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(AUTH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const hexSig = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${username}:${timestamp}:${hexSig}`;
}

export async function verifySessionToken(token: string): Promise<{ valid: boolean; username?: string }> {
  if (!token) return { valid: false };
  const parts = token.split(':');
  if (parts.length !== 3) return { valid: false };
  const [username, timestampStr, hexSig] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return { valid: false };

  // 30 days expiration
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - timestamp > maxAgeMs) {
    return { valid: false };
  }

  try {
    const data = `${username}:${timestampStr}`;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(AUTH_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = new Uint8Array(hexSig.length / 2);
    for (let i = 0; i < hexSig.length; i += 2) {
      sigBytes[i / 2] = parseInt(hexSig.substring(i, i + 2), 16);
    }

    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(data));
    return { valid: isValid, username: isValid ? username : undefined };
  } catch {
    return { valid: false };
  }
}
