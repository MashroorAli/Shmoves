import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Dimensions, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { deleteTripPost, FeedPost, setLike, updateTripPost, uploadPhotoToCloudinary } from '@/config/posts-api';
import { useAuth } from '@/context/auth-context';
import { useColors } from '@/hooks/use-colors';

interface Props {
  post: FeedPost;
  onChanged?: (next: FeedPost | null) => void;
  onOpenComments: (post: FeedPost) => void;
  hideTapForDetails?: boolean;
}

const SCREEN_W = Dimensions.get('window').width;

export function PostCard({ post, onChanged, onOpenComments, hideTapForDetails }: Props) {
  const colors = useColors();
  const { uid } = useAuth();
  const [busyLike, setBusyLike] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editVisible, setEditVisible] = useState(false);
  const [editBody, setEditBody] = useState('');
  const [editPhotos, setEditPhotos] = useState<string[]>([]);
  const [editBusy, setEditBusy] = useState(false);

  const mine = uid === post.authorId;
  const initials = (post.author.name ?? post.author.username ?? '?').trim()[0]?.toUpperCase() ?? '?';

  const toggleLike = async () => {
    if (!uid || busyLike) return;
    const next = !post.iLiked;
    const optimistic: FeedPost = {
      ...post,
      iLiked: next,
      likeCount: post.likeCount + (next ? 1 : -1),
    };
    onChanged?.(optimistic);
    setBusyLike(true);
    try {
      await setLike(post.id, uid, next);
    } catch (e: any) {
      onChanged?.(post);
      Alert.alert('Error', e.message || 'Could not update like.');
    } finally {
      setBusyLike(false);
    }
  };

  const openTrip = () => {
    if (hideTapForDetails) return;
    router.push(`/trip-public/${post.tripSource}/${encodeURIComponent(post.tripId)}` as any);
  };

  const openEdit = () => {
    setEditBody(post.body ?? '');
    setEditPhotos([...post.photos]);
    setEditVisible(true);
  };

  const pickEditPhoto = async () => {
    const slots = 5 - editPhotos.length;
    if (slots <= 0) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: slots,
      quality: 0.8,
    });
    if (result.canceled) return;
    setEditPhotos((prev) => [...prev, ...result.assets.slice(0, slots).map((a) => a.uri)]);
  };

  const saveEdit = async () => {
    setEditBusy(true);
    try {
      const uploaded: string[] = [];
      for (const p of editPhotos) {
        if (p.startsWith('http')) {
          uploaded.push(p);
        } else {
          const url = await uploadPhotoToCloudinary(p);
          uploaded.push(url);
        }
      }
      await updateTripPost(post.id, { body: editBody.trim() || null, photos: uploaded });
      onChanged?.({ ...post, body: editBody.trim() || null, photos: uploaded });
      setEditVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save changes.');
    } finally {
      setEditBusy(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete post', 'Remove this post? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTripPost(post.id);
            onChanged?.(null);
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        {post.author.avatarUrl ? (
          <Image source={{ uri: post.author.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
            <ThemedText style={[styles.avatarInitial, { color: colors.text }]}>{initials}</ThemedText>
          </View>
        )}
        <Pressable onPress={() => onOpenComments(post)} style={{ flex: 1, minWidth: 0 }}>
          <ThemedText style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {post.author.name ?? post.author.username ?? 'Unknown'}
          </ThemedText>
          <ThemedText style={[styles.meta, { color: colors.icon }]} numberOfLines={1}>
            {post.destination} · {relativeTime(post.createdAt)}
          </ThemedText>
        </Pressable>
        {mine ? (
          <Pressable
            hitSlop={8}
            style={styles.moreBtn}
            onPress={() =>
              ActionSheetIOS.showActionSheetWithOptions(
                { options: ['Edit Post', 'Delete Post', 'Cancel'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
                (index) => {
                  if (index === 0) openEdit();
                  if (index === 1) confirmDelete();
                },
              )
            }>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.icon} />
          </Pressable>
        ) : null}
      </View>

      {post.body ? (
        <Pressable onPress={() => onOpenComments(post)}>
          <ThemedText style={[styles.body, { color: colors.text }]} numberOfLines={hideTapForDetails ? undefined : 6}>
            {post.body}
          </ThemedText>
        </Pressable>
      ) : null}

      {post.photos.length ? (
        <PhotoStrip photos={post.photos} onPhotoPress={(i) => setLightboxIndex(i)} />
      ) : null}

      <Modal visible={lightboxIndex !== null} transparent animationType="fade" statusBarTranslucent>
        <StatusBar hidden />
        <Pressable
          style={styles.lightboxBackdrop}
          onPress={() => setLightboxIndex(null)}>
          <FlatList
            data={post.photos}
            horizontal
            pagingEnabled
            initialScrollIndex={lightboxIndex ?? 0}
            getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
            keyExtractor={(uri, i) => `${uri}-${i}`}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable style={styles.lightboxPage} onPress={() => setLightboxIndex(null)}>
                <Image source={{ uri: item }} style={styles.lightboxImage} resizeMode="contain" />
              </Pressable>
            )}
          />
        </Pressable>
      </Modal>

      <Modal visible={editVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.editRoot, { backgroundColor: colors.background }]}>
          <View style={styles.editHeader}>
            <Pressable onPress={() => setEditVisible(false)} hitSlop={10}>
              <ThemedText style={[styles.editCancel, { color: colors.icon }]}>Cancel</ThemedText>
            </Pressable>
            <ThemedText style={[styles.editTitle, { color: colors.text }]}>Edit post</ThemedText>
            <Pressable
              onPress={saveEdit}
              disabled={editBusy}
              style={[styles.editSaveBtn, { backgroundColor: colors.primary, opacity: editBusy ? 0.6 : 1 }]}
            >
              {editBusy
                ? <ActivityIndicator size="small" color="#fff" />
                : <ThemedText style={styles.editSaveBtnText}>Save</ThemedText>}
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.editScroll} keyboardShouldPersistTaps="handled">
            <TextInput
              value={editBody}
              onChangeText={setEditBody}
              placeholder="What do you want to share?"
              placeholderTextColor={colors.icon}
              multiline
              style={[styles.editBodyInput, { color: colors.inputText, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <View style={styles.editPhotosWrap}>
              {editPhotos.map((uri, i) => (
                <View key={`${uri}-${i}`} style={styles.editPhotoItem}>
                  <Image source={{ uri }} style={styles.editPhotoThumb} />
                  <Pressable style={styles.editPhotoRemove} onPress={() => setEditPhotos((prev) => prev.filter((_, idx) => idx !== i))} hitSlop={6}>
                    <Ionicons name="close-circle" size={22} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {editPhotos.length < 5 && (
                <Pressable
                  onPress={pickEditPhoto}
                  style={[styles.editPhotoAdd, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
                >
                  <Ionicons name="add" size={28} color={colors.primary} />
                  <ThemedText style={[styles.editPhotoAddText, { color: colors.icon }]}>Add photo</ThemedText>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
        <Pressable onPress={toggleLike} style={styles.actionBtn} disabled={busyLike}>
          <Ionicons
            name={post.iLiked ? 'heart' : 'heart-outline'}
            size={20}
            color={post.iLiked ? colors.primary : colors.text}
          />
          <ThemedText style={[styles.actionText, { color: colors.text }]}>
            {post.likeCount || ''}
          </ThemedText>
        </Pressable>
        <Pressable onPress={() => onOpenComments(post)} style={styles.actionBtn}>
          <Ionicons name="chatbubble-outline" size={19} color={colors.text} />
          <ThemedText style={[styles.actionText, { color: colors.text }]}>
            {post.commentCount || ''}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function PhotoStrip({ photos, onPhotoPress }: { photos: string[]; onPhotoPress: (index: number) => void }) {
  if (photos.length === 1) {
    return (
      <Pressable onPress={() => onPhotoPress(0)} style={styles.singlePhotoWrap}>
        <Image source={{ uri: photos[0] }} style={styles.singlePhoto} resizeMode="cover" />
      </Pressable>
    );
  }
  return (
    <FlatList
      data={photos}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(u, i) => `${u}-${i}`}
      renderItem={({ item, index }) => (
        <Pressable onPress={() => onPhotoPress(index)}>
          <Image source={{ uri: item }} style={styles.multiPhoto} resizeMode="cover" />
        </Pressable>
      )}
      contentContainerStyle={{ gap: 6 }}
    />
  );
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const PHOTO_H = Math.min(280, SCREEN_W * 0.7);

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  avatarInitial: { fontSize: 15, fontWeight: '800' },
  name: { fontSize: 14, fontWeight: '800' },
  meta: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  moreBtn: { padding: 6 },

  body: { fontSize: 14, lineHeight: 20, fontWeight: '500' },

  lightboxBackdrop: { flex: 1, backgroundColor: '#000' },
  lightboxPage: { width: SCREEN_W, flex: 1, alignItems: 'center', justifyContent: 'center' },
  lightboxImage: { width: SCREEN_W, height: SCREEN_W * 1.2 },

  singlePhotoWrap: { borderRadius: 12, overflow: 'hidden' },
  singlePhoto: { width: '100%', height: PHOTO_H },
  multiPhoto: { width: 200, height: 200, borderRadius: 12 },

  actionsRow: {
    flexDirection: 'row',
    gap: 20,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  actionText: { fontSize: 13, fontWeight: '700' },

  editRoot: { flex: 1 },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  editTitle: { fontSize: 18, fontWeight: '800' },
  editCancel: { fontSize: 15, fontWeight: '600' },
  editSaveBtn: {
    minWidth: 64,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSaveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  editScroll: { padding: 16, gap: 12 },
  editBodyInput: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  editPhotosWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editPhotoItem: { position: 'relative' },
  editPhotoThumb: { width: 84, height: 84, borderRadius: 12 },
  editPhotoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
  },
  editPhotoAdd: {
    width: 84,
    height: 84,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPhotoAddText: { fontSize: 11, marginTop: 2, fontWeight: '600' },
});
