import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActionSheetIOS, Alert, Dimensions, FlatList, Image, Modal, Pressable, StatusBar, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { deleteTripPost, FeedPost, setLike } from '@/config/posts-api';
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
                { options: ['Delete Post', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
                (index) => { if (index === 0) confirmDelete(); },
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
});
