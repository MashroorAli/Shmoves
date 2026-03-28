import * as FileSystem from 'expo-file-system/legacy';
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

import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/config/supabase';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ProfileScreen() {
  const { uid, signOut } = useAuth();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme];

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const [savedName, setSavedName] = useState('');
  const [savedUsername, setSavedUsername] = useState('');
  const [savedAvatarUri, setSavedAvatarUri] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleUsernameChange = (text: string) => {
    const cleaned = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    setUsername(cleaned);
    setUsernameError(null);
  };

  useEffect(() => {
    if (!uid) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('name, username, avatar_url')
        .eq('id', uid)
        .single();
      if (data) {
        setName(data.name ?? '');
        setUsername(data.username ?? '');
        setAvatarUri(data.avatar_url ?? null);
        setSavedName(data.name ?? '');
        setSavedUsername(data.username ?? '');
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
    const trimmed = (editing ? name : savedName).trim();
    if (trimmed.length === 0) return '?';
    return trimmed[0].toUpperCase();
  };

  const handleCancel = () => {
    setName(savedName);
    setUsername(savedUsername);
    setAvatarUri(savedAvatarUri);
    setUsernameError(null);
    setEditing(false);
    Keyboard.dismiss();
  };

  const onSave = async () => {
    if (!uid) return;
    Keyboard.dismiss();

    if (username !== savedUsername) {
      if (username.length < 3 || username.length > 20) {
        setUsernameError('Username must be 3–20 characters.');
        return;
      }
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .neq('id', uid)
        .maybeSingle();
      if (existing) {
        setUsernameError('That username is taken.');
        return;
      }
    }

    setSaving(true);
    setUsernameError(null);

    const updates: Record<string, string | null> = {
      name: name.trim(),
      username,
    };

    if (avatarUri !== savedAvatarUri && avatarUri) {
      const ext = avatarUri.split('.').pop() ?? 'jpg';
      const filePath = `${uid}/avatar.${ext}`;

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
    } else if (avatarUri === null && savedAvatarUri !== null) {
      updates.avatar_url = null;
    }

    const { error } = await supabase
      .from('profiles')
      .upsert({ id: uid, ...updates });

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message || 'Could not save profile. Please try again.');
      return;
    }

    setSavedName(name.trim());
    setSavedUsername(username);
    if (updates.avatar_url !== undefined) {
      setSavedAvatarUri(updates.avatar_url);
      if (updates.avatar_url) setAvatarUri(updates.avatar_url);
    } else {
      setSavedAvatarUri(avatarUri);
    }

    setEditing(false);
  };

  const displayAvatarUri = editing ? avatarUri : savedAvatarUri;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText type="title">My Profile</ThemedText>
        {!editing && (
          <Pressable onPress={() => setEditing(true)} style={[styles.editButton, { borderColor: colors.border }]}>
            <ThemedText style={[styles.editButtonText, { color: colors.primary }]}>Edit</ThemedText>
          </Pressable>
        )}
      </View>

      {/* Avatar */}
      <Pressable onPress={editing ? showImageOptions : undefined} style={styles.avatarContainer}>
        {displayAvatarUri ? (
          <Image source={{ uri: displayAvatarUri }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
            <ThemedText style={styles.avatarInitial}>{getInitial()}</ThemedText>
          </View>
        )}
        {editing && (
          <View style={[styles.cameraButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ThemedText style={{ fontSize: 16 }}>📷</ThemedText>
          </View>
        )}
      </Pressable>
      {editing && (
        <ThemedText style={[styles.avatarHint, { color: colors.icon }]}>Tap to change photo</ThemedText>
      )}

      {/* Name */}
      <ThemedText style={[styles.label, { color: colors.icon }]}>Name</ThemedText>
      {editing ? (
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.inputText, backgroundColor: colors.surface }]}
          placeholder="Your name"
          placeholderTextColor={colors.icon}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoCorrect={false}
        />
      ) : (
        <ThemedText style={styles.staticValue}>{savedName || '—'}</ThemedText>
      )}

      {/* Username */}
      <ThemedText style={[styles.label, { color: colors.icon }]}>Username</ThemedText>
      {editing ? (
        <>
          <View style={[styles.usernameRow, { borderColor: usernameError ? '#d33' : colors.border, backgroundColor: colors.surface }]}>
            <ThemedText style={[styles.usernameAt, { color: colors.icon }]}>@</ThemedText>
            <TextInput
              style={[styles.usernameInput, { color: colors.inputText }]}
              placeholder="username"
              placeholderTextColor={colors.icon}
              value={username}
              onChangeText={handleUsernameChange}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
          </View>
          {usernameError ? (
            <ThemedText style={styles.usernameError}>{usernameError}</ThemedText>
          ) : null}
        </>
      ) : (
        <ThemedText style={styles.staticValue}>
          {savedUsername ? `@${savedUsername}` : '—'}
        </ThemedText>
      )}

      {/* Edit mode actions */}
      {editing && (
        <View style={styles.editActions}>
          <Pressable
            onPress={handleCancel}
            style={[styles.cancelButton, { borderColor: colors.border }]}>
            <ThemedText style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</ThemedText>
          </Pressable>
          <Pressable
            onPress={onSave}
            disabled={saving}
            style={[styles.saveButton, { backgroundColor: colors.primary }, saving && styles.saveButtonDisabled]}>
            <ThemedText style={styles.saveButtonText}>
              {saving ? 'Saving...' : 'Save'}
            </ThemedText>
          </Pressable>
        </View>
      )}

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <Pressable
        onPress={async () => {
          await signOut();
          router.replace('/auth');
        }}
        style={styles.signOutButton}>
        <ThemedText style={styles.signOutText}>Sign Out</ThemedText>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
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
    lineHeight: 48,
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
    marginBottom: 16,
    marginTop: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  staticValue: {
    fontSize: 17,
    fontWeight: '500',
    paddingVertical: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  usernameAt: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 2,
  },
  usernameInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  usernameError: {
    color: '#d33',
    fontSize: 13,
    marginTop: 4,
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    borderRadius: 1,
    marginTop: 32,
    marginBottom: 8,
  },
  signOutButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#d33',
  },
});
