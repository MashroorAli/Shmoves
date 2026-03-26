import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
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
type Step = 'home' | 'email' | 'otp';

export default function AuthScreen() {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('home');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [otpFocused, setOtpFocused] = useState(false);

  const emailInputRef = useRef<TextInput>(null);
  const otpInputRef = useRef<TextInput>(null);

  // Mount animation
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(24)).current;

  // Step panel animations
  const homeOpacity = useRef(new Animated.Value(1)).current;
  const homeTranslateX = useRef(new Animated.Value(0)).current;
  const emailOpacity = useRef(new Animated.Value(0)).current;
  const emailTranslateX = useRef(new Animated.Value(60)).current;
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

    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(cursorOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    blink.start();
    return () => blink.stop();
  }, []);

  const transitionTo = (next: Step) => {
    const currentOpacity = step === 'home' ? homeOpacity : step === 'email' ? emailOpacity : otpOpacity;
    const currentX = step === 'home' ? homeTranslateX : step === 'email' ? emailTranslateX : otpTranslateX;
    const nextOpacity = next === 'home' ? homeOpacity : next === 'email' ? emailOpacity : otpOpacity;
    const nextX = next === 'home' ? homeTranslateX : next === 'email' ? emailTranslateX : otpTranslateX;

    Animated.parallel([
      Animated.timing(currentOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(currentX, { toValue: -60, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      nextX.setValue(60);
      setStep(next);
      Animated.parallel([
        Animated.timing(nextOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(nextX, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start(() => {
        if (next === 'email') emailInputRef.current?.focus();
        if (next === 'otp') otpInputRef.current?.focus();
      });
    });
  };

  const goBack = () => {
    const prev = step === 'otp' ? 'email' : 'home';
    const currentOpacity = step === 'otp' ? otpOpacity : emailOpacity;
    const currentX = step === 'otp' ? otpTranslateX : emailTranslateX;
    const prevOpacity = prev === 'home' ? homeOpacity : emailOpacity;
    const prevX = prev === 'home' ? homeTranslateX : emailTranslateX;

    Animated.parallel([
      Animated.timing(currentOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(currentX, { toValue: 60, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      prevX.setValue(-60);
      setStep(prev);
      setError(null);
      Animated.parallel([
        Animated.timing(prevOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(prevX, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start();
    });
  };

  const pressIn = () =>
    Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
  const pressOut = () =>
    Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true, speed: 50 }).start();

  // ── Apple Sign In ────────────────────────────────────────────────────────
  const signInWithApple = async () => {
    setError(null);
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const { error: err } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken!,
      });
      if (err) throw err;
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        setError(e?.message || 'Apple Sign In failed. Please try again.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Email OTP ────────────────────────────────────────────────────────────
  const sendEmailCode = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@') || !trimmed.includes('.')) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { shouldCreateUser: true },
      });
      if (err) throw err;
      transitionTo('otp');
    } catch (e: any) {
      setError(e?.message || 'Failed to send code.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [email]);

  const verifyEmailCode = useCallback(async () => {
    if (otpCode.length < OTP_LENGTH) {
      setError('Enter the full 6-digit code.');
      return;
    }
    setError(null);
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otpCode,
        type: 'email',
      });
      if (err) throw err;
    } catch (e: any) {
      setError(e?.message || 'Invalid code. Please try again.');
      setOtpCode('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setLoading(false);
    }
  }, [email, otpCode]);

  useEffect(() => {
    if (otpCode.length === OTP_LENGTH) verifyEmailCode();
  }, [otpCode]);

  const maskedEmail = email.includes('@')
    ? `${email.split('@')[0].slice(0, 2)}***@${email.split('@')[1]}`
    : '';

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>

          {/* Back button */}
          <View style={[styles.backRow, { paddingTop: insets.top + 12 }]}>
            {step !== 'home' ? (
              <Pressable onPress={goBack} hitSlop={16} style={styles.backButton}>
                <ThemedText style={[styles.backText, { color: colors.primary }]}>← Back</ThemedText>
              </Pressable>
            ) : null}
          </View>

          {/* Brand hero */}
          <Animated.View
            style={[styles.hero, { opacity: heroOpacity, transform: [{ translateY: heroTranslateY }] }]}>
            <Image
              source={require('../assets/images/shmoves.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <ThemedText style={[styles.tagline, { color: colors.icon }]}>Plan trips together.</ThemedText>
          </Animated.View>

          {/* Content area */}
          <View style={styles.contentArea}>

            {/* ── Home step: Apple + Email options ── */}
            <Animated.View
              pointerEvents={step === 'home' ? 'auto' : 'none'}
              style={[
                styles.stepPanel,
                {
                  opacity: homeOpacity,
                  transform: [{ translateX: homeTranslateX }],
                  position: step !== 'home' ? 'absolute' : 'relative',
                },
              ]}>
              <ThemedText style={[styles.stepHeading, { color: colors.text }]}>
                Welcome.
              </ThemedText>
              <ThemedText style={[styles.stepSub, { color: colors.icon }]}>
                Sign in or create an account to start planning.
              </ThemedText>

              <View style={styles.authOptions}>
                {/* Apple Sign In */}
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={theme === 'dark'
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={14}
                  style={styles.appleButton}
                  onPress={signInWithApple}
                />

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  <ThemedText style={[styles.dividerText, { color: colors.icon }]}>or</ThemedText>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                </View>

                {/* Email option */}
                <Pressable
                  style={[styles.emailButton, { borderColor: colors.border }]}
                  onPress={() => transitionTo('email')}>
                  <ThemedText style={[styles.emailButtonText, { color: colors.text }]}>
                    Continue with Email
                  </ThemedText>
                </Pressable>
              </View>

              {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}
            </Animated.View>

            {/* ── Email step ── */}
            <Animated.View
              pointerEvents={step === 'email' ? 'auto' : 'none'}
              style={[
                styles.stepPanel,
                {
                  opacity: emailOpacity,
                  transform: [{ translateX: emailTranslateX }],
                  position: step !== 'email' ? 'absolute' : 'relative',
                },
              ]}>
              <ThemedText style={[styles.stepHeading, { color: colors.text }]}>
                What's your email?
              </ThemedText>
              <ThemedText style={[styles.stepSub, { color: colors.icon }]}>
                We'll send you a one-time code to sign in.
              </ThemedText>

              <TextInput
                ref={emailInputRef}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.icon}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!loading}
                returnKeyType="done"
                onSubmitEditing={sendEmailCode}
                style={[styles.emailInput, { borderBottomColor: colors.border, color: colors.inputText }]}
              />

              {error && step === 'email' ? (
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
                  position: step !== 'otp' ? 'absolute' : 'relative',
                },
              ]}>
              <ThemedText style={[styles.stepHeading, { color: colors.text }]}>
                Check your{'\n'}inbox.
              </ThemedText>
              <ThemedText style={[styles.stepSub, { color: colors.icon }]}>
                Code sent to {maskedEmail}
              </ThemedText>

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
                          backgroundColor: isFilled
                            ? theme === 'dark' ? colors.surfaceMuted : '#f7f7f7'
                            : 'transparent',
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
            {step === 'email' && (
              <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                <Pressable
                  style={[styles.pill, { backgroundColor: colors.primary }]}
                  onPressIn={pressIn}
                  onPressOut={pressOut}
                  onPress={sendEmailCode}
                  disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <ThemedText style={styles.pillText}>Send Code →</ThemedText>
                  )}
                </Pressable>
              </Animated.View>
            )}

            {step === 'otp' && (
              <Pressable onPress={sendEmailCode} disabled={loading} hitSlop={12}>
                <ThemedText style={[styles.resendText, { color: colors.icon }]}>
                  Didn't get a code?{' '}
                  <ThemedText style={[styles.resendText, { color: colors.primary }]}>Resend</ThemedText>
                </ThemedText>
              </Pressable>
            )}

            {step === 'home' && (
              <ThemedText style={[styles.disclaimer, { color: colors.icon }]}>
                By continuing you agree to our{' '}
                <ThemedText
                  style={[styles.disclaimerLink, { color: colors.primary }]}
                  onPress={() => Linking.openURL('https://mashroorali.github.io/Shmoves/terms.html')}>
                  Terms
                </ThemedText>
                {' & '}
                <ThemedText
                  style={[styles.disclaimerLink, { color: colors.primary }]}
                  onPress={() => Linking.openURL('https://mashroorali.github.io/Shmoves/privacy.html')}>
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
  root: { flex: 1 },
  flex: { flex: 1 },
  backRow: {
    paddingHorizontal: 28,
    height: 52,
    justifyContent: 'center',
  },
  backButton: { alignSelf: 'flex-start' },
  backText: { fontSize: 16, fontWeight: '600' },
  hero: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 32,
    gap: 12,
  },
  logoImage: {
    width: 200,
    height: 100,
    borderRadius: 20,
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
  authOptions: {
    gap: 12,
    marginTop: 8,
  },
  appleButton: {
    width: '100%',
    height: 52,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  emailButton: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  emailButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  emailInput: {
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
  otpDigit: { fontSize: 22, fontWeight: '700' },
  cursor: { width: 2, height: 24, borderRadius: 1 },
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
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  pillText: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
  resendText: { fontSize: 14, fontWeight: '500' },
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
