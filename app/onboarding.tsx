import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
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
import { Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/config/supabase';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Step = 'name' | 'photo';

export default function OnboardingScreen() {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();
  const { uid } = useAuth();

  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nameInputRef = useRef<TextInput>(null);

  // Step transition animations
  const nameOpacity = useRef(new Animated.Value(1)).current;
  const nameTranslateX = useRef(new Animated.Value(0)).current;
  const photoOpacity = useRef(new Animated.Value(0)).current;
  const photoTranslateX = useRef(new Animated.Value(60)).current;

  // Button scale
  const buttonScale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
  };
  const pressOut = () => {
    Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true, speed: 50 }).start();
  };

  const goToPhoto = () => {
    if (name.trim().length === 0) {
      Alert.alert('Name required', 'Please enter your name to continue.');
      return;
    }
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(nameOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(nameTranslateX, { toValue: -60, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      setStep('photo');
      Animated.parallel([
        Animated.timing(photoOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(photoTranslateX, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start();
    });
  };

  const pickImage = useCallback(async (useCamera: boolean) => {
    const permissionMethod = useCamera
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;

    const { status } = await permissionMethod();
    if (status !== 'granted') {
      Alert.alert('Permission required', `Please allow ${useCamera ? 'camera' : 'photo library'} access.`);
      return;
    }

    const launchMethod = useCamera
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    const result = await launchMethod({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  }, []);

  const showImageOptions = useCallback(() => {
    const options = ['Take Photo', 'Choose from Library', 'Cancel'];
    const cancelIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex },
        (buttonIndex) => {
          if (buttonIndex === 0) pickImage(true);
          else if (buttonIndex === 1) pickImage(false);
        },
      );
    } else {
      Alert.alert('Profile Photo', 'Choose an option', [
        { text: 'Take Photo', onPress: () => pickImage(true) },
        { text: 'Choose from Library', onPress: () => pickImage(false) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [pickImage]);

  const getInitial = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return '?';
    return trimmed[0].toUpperCase();
  };

  const finishOnboarding = async () => {
    if (!uid) return;
    setSaving(true);

    const updates: Record<string, string | null> = {
      name: name.trim(),
    };

    // Upload avatar if selected
    if (avatarUri) {
      const ext = avatarUri.split('.').pop() ?? 'jpg';
      const filePath = `${uid}/avatar.${ext}`;

      try {
        const base64 = await FileSystem.readAsStringAsync(avatarUri, {
          encoding: 'base64',
        });
        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, bytes.buffer, { upsert: true, contentType: `image/${ext}` });

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);
          updates.avatar_url = urlData.publicUrl;
        }
      } catch (e) {
        // Avatar upload failed — continue without it
      }
    }

    const { error } = await supabase
      .from('profiles')
      .upsert({ id: uid, ...updates });

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message || 'Could not save. Please try again.');
      return;
    }

    router.replace('/(tabs)');
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>

          {/* Header area */}
          <View style={[styles.headerArea, { paddingTop: insets.top + 48 }]}>
            <ThemedText style={[styles.welcome, { color: colors.icon }]}>
              {step === 'name' ? 'Welcome to Shmoves' : `Hey ${name.trim()} 👋`}
            </ThemedText>
            <ThemedText style={[styles.heading, { color: colors.text }]}>
              {step === 'name' ? "What's your name?" : 'Add a profile photo'}
            </ThemedText>
            <ThemedText style={[styles.subtext, { color: colors.icon }]}>
              {step === 'name'
                ? "This is how you'll appear to trip collaborators."
                : 'Help your friends recognize you.'}
            </ThemedText>
          </View>

          {/* Content */}
          <View style={styles.contentArea}>
            {/* Name step */}
            <Animated.View
              pointerEvents={step === 'name' ? 'auto' : 'none'}
              style={[
                styles.stepPanel,
                {
                  opacity: nameOpacity,
                  transform: [{ translateX: nameTranslateX }],
                  position: step === 'photo' ? 'absolute' : 'relative',
                },
              ]}>
              <TextInput
                ref={nameInputRef}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={colors.icon}
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={goToPhoto}
                style={[
                  styles.nameInput,
                  { borderBottomColor: colors.border, color: colors.inputText },
                ]}
              />
            </Animated.View>

            {/* Photo step */}
            <Animated.View
              pointerEvents={step === 'photo' ? 'auto' : 'none'}
              style={[
                styles.stepPanel,
                {
                  opacity: photoOpacity,
                  transform: [{ translateX: photoTranslateX }],
                  position: step === 'name' ? 'absolute' : 'relative',
                  alignItems: 'center',
                },
              ]}>
              <Pressable onPress={showImageOptions} style={styles.avatarContainer}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                    <ThemedText style={styles.avatarInitial}>{getInitial()}</ThemedText>
                  </View>
                )}
                <View style={[styles.cameraButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <ThemedText style={{ fontSize: 18 }}>📷</ThemedText>
                </View>
              </Pressable>
              <ThemedText style={[styles.photoHint, { color: colors.icon }]}>
                Tap to {avatarUri ? 'change' : 'add a'} photo
              </ThemedText>
            </Animated.View>
          </View>

          {/* Bottom actions */}
          <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
            <Animated.View style={{ transform: [{ scale: buttonScale }], width: '100%' }}>
              <Pressable
                style={[
                  styles.pill,
                  { backgroundColor: colors.primary },
                  (step === 'name' && name.trim().length === 0) && styles.pillDisabled,
                ]}
                onPressIn={pressIn}
                onPressOut={pressOut}
                onPress={step === 'name' ? goToPhoto : finishOnboarding}
                disabled={saving || (step === 'name' && name.trim().length === 0)}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.pillText}>
                    {step === 'name' ? 'Continue →' : avatarUri ? "Let's go →" : 'Save & Continue →'}
                  </ThemedText>
                )}
              </Pressable>
            </Animated.View>

            {step === 'photo' && !saving && (
              <Pressable onPress={finishOnboarding} hitSlop={12}>
                <ThemedText style={[styles.skipText, { color: colors.icon }]}>
                  Skip for now
                </ThemedText>
              </Pressable>
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
  headerArea: {
    paddingHorizontal: 28,
    gap: 8,
    marginBottom: 40,
  },
  welcome: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  heading: {
    fontSize: 30,
    fontWeight: '800',
  },
  subtext: {
    fontSize: 15,
    lineHeight: 22,
  },
  contentArea: {
    flex: 1,
    paddingHorizontal: 28,
  },
  stepPanel: {
    width: '100%',
  },
  nameInput: {
    fontSize: 24,
    fontWeight: '600',
    borderBottomWidth: 2,
    paddingBottom: 14,
    paddingTop: 4,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 56,
    fontWeight: '700',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHint: {
    fontSize: 14,
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
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  pillDisabled: {
    opacity: 0.4,
  },
  pillText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
