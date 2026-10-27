import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { post } from '../api/client';
import { GoogleLoginResult } from '../api/types';
import { colors, font, size } from '../theme';
import { useAuth } from './useAuth';

WebBrowser.maybeCompleteAuthSession();

const extra = (Constants.expoConfig?.extra ?? {}) as { googleWebClientId?: string; googleAndroidClientId?: string };
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || extra.googleWebClientId || '';
const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || extra.googleAndroidClientId || '';

// The Google hook throws when its client id is missing, so only mount it once configured.
export const GOOGLE_CONFIGURED = Platform.OS === 'web' ? !!webClientId : !!(androidClientId || webClientId);

type Props = { onError: (m: string) => void; onNeedsPhone: () => void; label?: string };

/**
 * "Masuk dengan Google": id_token → POST /agent/auth/google. A known account
 * signs in; a new one is parked in useAuth.pendingGoogle and finishes on the
 * register screen with just a phone number (no OTP). Hidden until client ids
 * are configured.
 */
export function GoogleButton(props: Props) {
  if (!GOOGLE_CONFIGURED) return null;
  return <GoogleButtonInner {...props} />;
}

function GoogleButtonInner({ onError, onNeedsPhone, label = 'MASUK DENGAN GOOGLE' }: Props) {
  const signIn = useAuth((s) => s.signIn);
  const setPendingGoogle = useAuth((s) => s.setPendingGoogle);
  const [busy, setBusy] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: webClientId || undefined,
    androidClientId: androidClientId || undefined,
  });

  useEffect(() => {
    if (response?.type !== 'success') {
      if (response && response.type !== 'dismiss' && response.type !== 'cancel') onError('Login Google dibatalkan');
      return;
    }
    const idToken = response.params?.id_token;
    if (!idToken) return;
    setBusy(true);
    post<GoogleLoginResult>('/agent/auth/google', { idToken })
      .then((r) => {
        if (!r.needsPhone) return signIn(r);
        setPendingGoogle({ googleTicket: r.googleTicket, name: r.profile.name, email: r.profile.email });
        onNeedsPhone();
      })
      .catch((e: Error) => onError(e.message))
      .finally(() => setBusy(false));
  }, [response]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Pressable
      disabled={!request || busy}
      onPress={() => promptAsync()}
      style={{
        height: size.button,
        borderRadius: size.buttonRadius,
        borderWidth: 1.5,
        borderColor: colors.border,
        backgroundColor: colors.white,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: !request || busy ? 0.5 : 1,
      }}
    >
      <Ionicons name="logo-google" size={20} color={colors.text} />
      <View style={{ width: 10 }} />
      <Text style={{ fontSize: font.button, fontWeight: '700', color: colors.text }}>{label}</Text>
    </Pressable>
  );
}
