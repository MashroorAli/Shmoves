import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/config/supabase';

type Step = 'phone' | 'otp';

export default function AuthScreen() {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme];

  const [step, setStep] = useState<Step>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const normalizePhone = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('+')) return trimmed;
    const digits = trimmed.replace(/\D/g, '');
    return `+1${digits}`;
  };

  const sendCode = useCallback(async () => {
    const raw = phoneNumber.trim();
    const digits = raw.replace(/\D/g, '');

    if (digits.length < 10) {
      setError('Enter a valid phone number (10+ digits or include country code).');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const normalized = normalizePhone(raw);
      const { error: err } = await supabase.auth.signInWithOtp({ phone: normalized });
      if (err) throw err;
      setStep('otp');
    } catch (e: any) {
      setError(e?.message || 'Failed to send verification code.');
    } finally {
      setLoading(false);
    }
  }, [phoneNumber]);

  const verifyCode = useCallback(async () => {
    const code = otpCode.trim();

    if (code.length < 6) {
      setError('Please enter the 6-digit code.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const normalized = normalizePhone(phoneNumber.trim());
      const { error: err } = await supabase.auth.verifyOtp({
        phone: normalized,
        token: code,
        type: 'sms',
      });
      if (err) throw err;
    } catch (e: any) {
      setError(e?.message || 'Invalid code. Please try again.');
      setLoading(false);
    }
  }, [phoneNumber, otpCode]);

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}>

        <ThemedView style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          {step === 'phone' ? (
            <>
              <ThemedText style={styles.title}>Welcome</ThemedText>
              <ThemedText style={styles.subtitle}>
                Enter your phone number to sign in. We'll text you a verification code.
              </ThemedText>

              <TextInput
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="+1 (555) 123-4567"
                placeholderTextColor="#888"
                keyboardType="phone-pad"
                autoComplete="tel"
                editable={!loading}
                style={[styles.input, { borderColor: colors.border, color: colors.inputText }]}
              />

              {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}

              <Pressable
                style={[styles.button, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]}
                onPress={sendCode}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.buttonText}>Send Code</ThemedText>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <ThemedText style={styles.title}>Verify</ThemedText>
              <ThemedText style={styles.subtitle}>
                Enter the 6-digit code sent to {phoneNumber}.
              </ThemedText>

              <TextInput
                value={otpCode}
                onChangeText={setOtpCode}
                placeholder="123456"
                placeholderTextColor="#888"
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                editable={!loading}
                style={[
                  styles.input,
                  { borderColor: colors.border, color: colors.inputText, textAlign: 'center', fontSize: 24, letterSpacing: 8 },
                ]}
              />

              {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}

              <Pressable
                style={[styles.button, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]}
                onPress={verifyCode}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.buttonText}>Verify</ThemedText>
                )}
              </Pressable>

              <Pressable
                onPress={() => {
                  setStep('phone');
                  setOtpCode('');
                  setError(null);
                }}>
                <ThemedText style={[styles.linkText, { color: colors.primary }]}>
                  Use a different number
                </ThemedText>
              </Pressable>
            </>
          )}
        </ThemedView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    gap: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    opacity: 0.7,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  errorText: {
    color: '#d00',
    fontWeight: '600',
    fontSize: 13,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  linkText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
});
