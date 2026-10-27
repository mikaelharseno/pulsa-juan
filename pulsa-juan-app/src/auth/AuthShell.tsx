import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '../components/ui';
import { colors, font } from '../theme';

/** Teal gradient + centred white card shared by login / register / forgot-PIN. */
export function AuthShell({ title, subtitle, logo, children }: { title: string; subtitle?: string; logo?: boolean; children: React.ReactNode }) {
  return (
    <LinearGradient colors={[colors.teal, colors.tealDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
            <View style={{ alignItems: 'center', marginBottom: 22 }}>
              {logo ? (
                <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Text style={{ color: colors.white, fontSize: 26, fontWeight: '800' }}>PJ</Text>
                </View>
              ) : null}
              <Text style={{ color: colors.white, fontSize: logo ? 30 : 28, fontWeight: '800', letterSpacing: -0.7 }}>{title}</Text>
              {subtitle ? <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: font.body, marginTop: 4, textAlign: 'center' }}>{subtitle}</Text> : null}
            </View>
            <Card style={{ padding: 20, borderRadius: 20, borderWidth: 0, width: '100%', maxWidth: 440, alignSelf: 'center' }}>{children}</Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

/** "atau" rule between the Google button and the phone form. */
export function OrDivider({ label = 'atau' }: { label?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 16 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      <Text style={{ color: colors.muted, fontSize: font.small, marginHorizontal: 10 }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
    </View>
  );
}
