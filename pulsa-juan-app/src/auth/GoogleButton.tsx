import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { post } from '../api/client';
import { Session } from '../api/types';
import { colors, font, size } from '../theme';
import { useAuth } from './useAuth';

WebBrowser.maybeCompleteAuthSession();

const extra = (Constants.expoConfig?.extra ?? {}) as { googleWebClientId?: string; googleAndroidClientId?: string };
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || extra.googleWebClientId || '';
const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || extra.googleAndroidClientId || '';

/** "Masuk dengan Google": id_token → POST /agent/auth/google. Hidden until client ids are configured. */
export function GoogleButton(props: { referralCode?: string; onError: (m: string) => void }) {
  // The Google hook throws when its client id is missing, so only mount it once configured.
  const configured = Platform.OS === 'web' ? !!webClientId : !!(androidClientId || webClientId);
  if (!configured) return null;
  return <GoogleButtonInner {...props} />;
}

function GoogleButtonInner({ referralCode, onError }: { referralCode?: string; onError: (m: string) => void }) {
  const signIn = useAuth((s) => s.signIn);
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
    post<Session>('/agent/auth/google', { idToken, referralCode: referralCode || undefined })
      .then(signIn)
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
      <Ionicons name="logo-google" size={20} color="#DB4437" />
      <View style={{ width: 10 }} />
      <Text style={{ fontSize: font.button, fontWeight: '700', color: colors.text }}>MASUK DENGAN GOOGLE</Text>
    </Pressable>
  );
}
