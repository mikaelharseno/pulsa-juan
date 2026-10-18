import crypto from 'crypto';

// Referral codes: 8 chars, no 0/O/1/I ambiguity, easy to read out over WhatsApp.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function randomNodeId(): string {
  return 'n_' + randomCode(8).toLowerCase();
}
