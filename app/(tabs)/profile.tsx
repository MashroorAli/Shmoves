import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/config/supabase';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ProfileScreen() {
  const { uid } = useAuth();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme];

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  // Saved values to detect changes
  const [savedName, setSavedName] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [savedAvatarUri, setSavedAvatarUri] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const hasChanges =
    name !== savedName || email !== savedEmail || avatarUri !== savedAvatarUri;

  // Load profile from Supabase
  useEffect(() => {
    if (!uid) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('name, email, avatar_url')
        .eq('id', uid)
        .single();
      if (data) {
        setName(data.name ?? '');
        setEmail(data.email ?? '');
        setAvatarUri(data.avatar_url ?? null);
        setSavedName(data.name ?? '');
        setSavedEmail(data.email ?? '');
        setSavedAvatarUri(data.avatar_url ?? null);
      }
    })();
  }, [uid]);

  const pickImage = useCallback(async (useCamera: boolean) => {
    const permissionMethod = useCamera
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;

    const { status } = await permissionMethod();
    if (status !== 'granted') {
      Alert.alert('Permission required', `Please allow ${useCamera ? 'camera' : 'photo library'} access to set your profile picture.`);
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

  const onSave = async () => {
    if (!uid || !hasChanges) return;
    Keyboard.dismiss();
    setSaving(true);

    const updates: Record<string, string | null> = {
      name: name.trim(),
      email: email.trim(),
    };

    // If avatar changed and is a local file, upload it
    if (avatarUri !== savedAvatarUri && avatarUri) {
      const ext = avatarUri.split('.').pop() ?? 'jpg';
      const filePath = `${uid}/avatar.${ext}`;

      const response = await fetch(avatarUri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, { upsert: true, contentType: `image/${ext}` });

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);
        updates.avatar_url = urlData.publicUrl;
      }
    } else if (avatarUri === null && savedAvatarUri !== null) {
      updates.avatar_url = null;
    }

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', uid);

    setSaving(false);

    if (error) {
      Alert.alert('Error', 'Could not save profile. Please try again.');
      return;
    }

    // Update saved state so button becomes disabled again
    setSavedName(name.trim());
    setSavedEmail(email.trim());
    if (updates.avatar_url !== undefined) {
      setSavedAvatarUri(updates.avatar_url);
      if (updates.avatar_url) setAvatarUri(updates.avatar_url);
    } else {
      setSavedAvatarUri(avatarUri);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>My Profile</ThemedText>

      {/* Avatar */}
      <Pressable onPress={showImageOptions} style={styles.avatarContainer}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
            <ThemedText style={styles.avatarInitial}>{getInitial()}</ThemedText>
          </View>
        )}
        <View style={[styles.cameraButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ThemedText style={{ fontSize: 16 }}>📷</ThemedText>
        </View>
      </Pressable>
      <ThemedText style={[styles.avatarHint, { color: colors.icon }]}>Tap to change photo</ThemedText>

      {/* Name */}
      <ThemedText style={styles.label}>Name</ThemedText>
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.inputText, backgroundColor: colors.surface }]}
        placeholder="Your name"
        placeholderTextColor={colors.icon}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoCorrect={false}
      />

      {/* Email */}
      <ThemedText style={styles.label}>Email</ThemedText>
      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.inputText, backgroundColor: colors.surface }]}
        placeholder="Your email"
        placeholderTextColor={colors.icon}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {/* Save Button */}
      <Pressable
        onPress={onSave}
        disabled={!hasChanges || saving}
        style={[
          styles.saveButton,
          { backgroundColor: colors.primary },
          (!hasChanges || saving) && styles.saveButtonDisabled,
        ]}>
        <ThemedText style={styles.saveButtonText}>
          {saving ? 'Saving...' : 'Save'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
  },
  title: {
    marginBottom: 24,
  },
  avatarContainer: {
    alignSelf: 'center',
    marginBottom: 4,
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '700',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHint: {
    textAlign: 'center',
    fontSize: 13,
    marginBottom: 24,
    marginTop: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  saveButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
