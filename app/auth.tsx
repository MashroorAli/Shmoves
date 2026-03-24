import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/config/supabase';

const OTP_LENGTH = 6;

type Step = 'phone' | 'otp';

export default function AuthScreen() {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [otpFocused, setOtpFocused] = useState(false);

  const phoneInputRef = useRef<TextInput>(null);
  const otpInputRef = useRef<TextInput>(null);

  // Mount animation
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(24)).current;

  // Step transition animations
  const phoneOpacity = useRef(new Animated.Value(1)).current;
  const phoneTranslateX = useRef(new Animated.Value(0)).current;
  const otpOpacity = useRef(new Animated.Value(0)).current;
  const otpTranslateX = useRef(new Animated.Value(60)).current;

  // Button press scale
  const buttonScale = useRef(new Animated.Value(1)).current;

  // OTP cursor blink
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(heroTranslateY, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();

    // Cursor blink loop
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(cursorOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    blink.start();
    return () => blink.stop();
  }, []);

  const goToOtp = () => {
    Animated.parallel([
      Animated.timing(phoneOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(phoneTranslateX, { toValue: -60, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      setStep('otp');
      Animated.parallel([
        Animated.timing(otpOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(otpTranslateX, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start(() => {
        otpInputRef.current?.focus();
      });
    });
  };

  const goToPhone = () => {
    Animated.parallel([
      Animated.timing(otpOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(otpTranslateX, { toValue: 60, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setStep('phone');
      setOtpCode('');
      setError(null);
      otpTranslateX.setValue(60);
      phoneTranslateX.setValue(0);
      Animated.parallel([
        Animated.timing(phoneOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(phoneTranslateX, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start(() => {
        phoneInputRef.current?.focus();
      });
    });
  };

  const pressIn = () => {
    Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
  };

  const pressOut = () => {
    Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true, speed: 50 }).start();
  };

  const normalizePhone = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('+')) return trimmed;
    return `+1${trimmed.replace(/\D/g, '')}`;
  };

  const sendCode = useCallback(async () => {
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Enter a valid phone number.');
      return;
    }
    setError(null);
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({ phone: normalizePhone(phoneNumber) });
      if (err) throw err;
      goToOtp();
    } catch (e: any) {
      setError(e?.message || 'Failed to send code.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [phoneNumber]);

  const verifyCode = useCallback(async () => {
    if (otpCode.length < OTP_LENGTH) {
      setError('Enter the full 6-digit code.');
      return;
    }
    setError(null);
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        phone: normalizePhone(phoneNumber),
        token: otpCode,
        type: 'sms',
      });
      if (err) throw err;
    } catch (e: any) {
      setError(e?.message || 'Invalid code. Please try again.');
      setOtpCode('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setLoading(false);
    }
  }, [phoneNumber, otpCode]);

  // Auto-verify when all 6 digits entered
  useEffect(() => {
    if (otpCode.length === OTP_LENGTH) {
      verifyCode();
    }
  }, [otpCode]);

  const maskedPhone = phoneNumber.replace(/\D/g, '').slice(-4);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>

          {/* Back button — only on OTP step */}
          <View style={[styles.backRow, { paddingTop: insets.top + 12 }]}>
            {step === 'otp' ? (
              <Pressable onPress={goToPhone} hitSlop={16} style={styles.backButton}>
                <ThemedText style={[styles.backText, { color: colors.primary }]}>← Back</ThemedText>
              </Pressable>
            ) : null}
          </View>

          {/* Brand hero */}
          <Animated.View
            style={[styles.hero, { opacity: heroOpacity, transform: [{ translateY: heroTranslateY }] }]}>
            <View style={[styles.logoMark, { backgroundColor: colors.primary }]}>
              <ThemedText style={styles.logoIcon}>✈</ThemedText>
            </View>
            <ThemedText style={[styles.brandName, { color: colors.text }]} numberOfLines={1}>Shmoves</ThemedText>
            <ThemedText style={[styles.tagline, { color: colors.icon }]}>Plan trips together.</ThemedText>
          </Animated.View>

          {/* Content area */}
          <View style={styles.contentArea}>

            {/* ── Phone step ── */}
            <Animated.View
              pointerEvents={step === 'phone' ? 'auto' : 'none'}
              style={[
                styles.stepPanel,
                {
                  opacity: phoneOpacity,
                  transform: [{ translateX: phoneTranslateX }],
                  position: step === 'otp' ? 'absolute' : 'relative',
                },
              ]}>
              <ThemedText style={[styles.stepHeading, { color: colors.text }]}>
                What's your number?
              </ThemedText>
              <ThemedText style={[styles.stepSub, { color: colors.icon }]}>
                We'll text you a one-time code to sign in.
              </ThemedText>

              <TextInput
                ref={phoneInputRef}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="+1 (555) 123-4567"
                placeholderTextColor={colors.icon}
                keyboardType="phone-pad"
                autoComplete="tel"
                editable={!loading}
                returnKeyType="done"
                onSubmitEditing={sendCode}
                style={[styles.phoneInput, { borderBottomColor: colors.border, color: colors.inputText }]}
              />

              {error && step === 'phone' ? (
                <ThemedText style={styles.errorText}>{error}</ThemedText>
              ) : null}
            </Animated.View>

            {/* ── OTP step ── */}
            <Animated.View
              pointerEvents={step === 'otp' ? 'auto' : 'none'}
              style={[
                styles.stepPanel,
                {
                  opacity: otpOpacity,
                  transform: [{ translateX: otpTranslateX }],
                  position: step === 'phone' ? 'absolute' : 'relative',
                },
              ]}>
              <ThemedText style={[styles.stepHeading, { color: colors.text }]}>
                Check your{'\n'}messages.
              </ThemedText>
              <ThemedText style={[styles.stepSub, { color: colors.icon }]}>
                Code sent to ···· {maskedPhone}
              </ThemedText>

              {/* Hidden input that captures OTP */}
              <TextInput
                ref={otpInputRef}
                value={otpCode}
                onChangeText={(t) => setOtpCode(t.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                keyboardType="number-pad"
                maxLength={OTP_LENGTH}
                onFocus={() => setOtpFocused(true)}
                onBlur={() => setOtpFocused(false)}
                style={styles.hiddenInput}
                editable={!loading}
              />

              {/* 6 digit display boxes */}
              <Pressable onPress={() => otpInputRef.current?.focus()} style={styles.otpRow}>
                {Array.from({ length: OTP_LENGTH }).map((_, i) => {
                  const digit = otpCode[i] ?? '';
                  const isActive = otpFocused && i === otpCode.length && i < OTP_LENGTH;
                  const isFilled = !!digit;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.otpBox,
                        {
                          borderColor: isActive ? colors.primary : isFilled ? colors.text : colors.border,
                          backgroundColor: isFilled ? (theme === 'dark' ? colors.surfaceMuted : '#f7f7f7') : 'transparent',
                        },
                      ]}>
                      {digit ? (
                        <ThemedText style={[styles.otpDigit, { color: colors.text }]}>{digit}</ThemedText>
                      ) : isActive ? (
                        <Animated.View
                          style={[styles.cursor, { backgroundColor: colors.primary, opacity: cursorOpacity }]}
                        />
                      ) : null}
                    </View>
                  );
                })}
              </Pressable>

              {error && step === 'otp' ? (
                <ThemedText style={styles.errorText}>{error}</ThemedText>
              ) : null}
            </Animated.View>
          </View>

          {/* Bottom actions */}
          <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <Pressable
                style={[styles.pill, { backgroundColor: colors.primary }]}
                onPressIn={pressIn}
                onPressOut={pressOut}
                onPress={step === 'phone' ? sendCode : verifyCode}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.pillText}>
                    {step === 'phone' ? 'Continue' : 'Verify'} →
                  </ThemedText>
                )}
              </Pressable>
            </Animated.View>

            {step === 'otp' ? (
              <Pressable onPress={sendCode} disabled={loading} hitSlop={12}>
                <ThemedText style={[styles.resendText, { color: colors.icon }]}>
                  Didn't get a code?{' '}
                  <ThemedText style={[styles.resendText, { color: colors.primary }]}>Resend</ThemedText>
                </ThemedText>
              </Pressable>
            ) : (
              <ThemedText style={[styles.disclaimer, { color: colors.icon }]}>
                By continuing you agree to our{' '}
                <ThemedText
                  style={[styles.disclaimerLink, { color: colors.primary }]}
                  onPress={() => Linking.openURL('https://mashroorali.github.io/Shmoves/terms')}>
                  Terms
                </ThemedText>
                {' & '}
                <ThemedText
                  style={[styles.disclaimerLink, { color: colors.primary }]}
                  onPress={() => Linking.openURL('https://mashroorali.github.io/Shmoves/privacy')}>
                  Privacy Policy
                </ThemedText>
                .
              </ThemedText>
            )}
          </View>

        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  backRow: {
    paddingHorizontal: 28,
    height: 52,
    justifyContent: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
  },
  hero: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 40,
    gap: 10,
  },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logoIcon: {
    fontSize: 26,
    color: '#fff',
  },
  brandName: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
    paddingHorizontal: 8,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  contentArea: {
    flex: 1,
    paddingHorizontal: 28,
  },
  stepPanel: {
    width: '100%',
    gap: 12,
  },
  stepHeading: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 36,
    marginBottom: 2,
  },
  stepSub: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  phoneInput: {
    fontSize: 22,
    fontWeight: '500',
    borderBottomWidth: 1.5,
    paddingBottom: 12,
    paddingTop: 4,
    letterSpacing: 0.3,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  otpBox: {
    flex: 1,
    height: 58,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: {
    fontSize: 22,
    fontWeight: '700',
  },
  cursor: {
    width: 2,
    height: 24,
    borderRadius: 1,
  },
  errorText: {
    color: '#D12C2C',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  bottomArea: {
    paddingHorizontal: 28,
    gap: 16,
    alignItems: 'center',
  },
  pill: {
    borderRadius: 100,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 240,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  pillText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  resendText: {
    fontSize: 14,
    fontWeight: '500',
  },
  disclaimer: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    opacity: 0.7,
  },
  disclaimerLink: {
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
