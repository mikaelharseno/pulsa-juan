import { Platform } from 'react-native';

// expo-secure-store has no web implementation; fall back to localStorage.
const TOKEN_KEY = 'pulsajuan.token';

async function secure() {
  return import('expo-secure-store');
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
    } catch {
      return null;
    }
  }
  return (await secure()).getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string | null) {
  if (Platform.OS === 'web') {
    try {
      if (token) globalThis.localStorage?.setItem(TOKEN_KEY, token);
      else globalThis.localStorage?.removeItem(TOKEN_KEY);
    } catch {
      /* private mode */
    }
    return;
  }
  const s = await secure();
  if (token) await s.setItemAsync(TOKEN_KEY, token);
  else await s.deleteItemAsync(TOKEN_KEY);
}
