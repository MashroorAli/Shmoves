import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommentsSheet } from '@/components/comments-sheet';
import { FriendsSheet } from '@/components/friends-sheet';
import { PostCard } from '@/components/post-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/config/supabase';
import { FeedPost, fetchFeed } from '@/config/posts-api';
import { useAuth } from '@/context/auth-context';
import { useSocial } from '@/context/social-context';
import { useColors } from '@/hooks/use-colors';

export default function ActivityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { uid } = useAuth();
  const { incomingRequests, friends } = useSocial();

  const [friendsOpen, setFriendsOpen] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!uid) {
      setPosts([]);
      setLoading(false);
      return;
    }
    try {
      const data = await fetchFeed(uid, { limit: 30 });
      setPosts(data);
    } catch {
      /* surface nothing — silent retry on next refresh */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: refetch on any post/like/comment change visible to this user.
  // The RLS policy already scopes what's visible, so we can listen broadly.
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`feed-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_posts' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const updatePost = (next: FeedPost | null, id: string) => {
    setPosts((prev) => {
      if (!next) return prev.filter((p) => p.id !== id);
      return prev.map((p) => (p.id === id ? next : p));
    });
  };

  const bumpCommentCount = (postId: string, delta: number) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, commentCount: Math.max(0, p.commentCount + delta) } : p)),
    );
  };

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    const hasFriends = friends.length > 0;
    return (
      <View style={styles.centered}>
        <Ionicons name={hasFriends ? 'airplane-outline' : 'people-outline'} size={40} color={colors.icon} />
        <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
          {hasFriends ? 'No posts yet' : 'No friends yet'}
        </ThemedText>
        <ThemedText style={[styles.emptyBody, { color: colors.icon }]}>
          {hasFriends
            ? 'Share a post about your trip and start the thread.'
            : 'Add friends to see their trip posts here.'}
        </ThemedText>
        <Pressable
          onPress={() => (hasFriends ? router.push('/compose-post') : setFriendsOpen(true))}
          style={[styles.cta, { backgroundColor: colors.primary }]}
        >
          <ThemedText style={styles.ctaText}>{hasFriends ? 'Share a post' : 'Add friends'}</ThemedText>
        </Pressable>
      </View>
    );
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.headerRow}>
        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>Shmovements</ThemedText>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push('/compose-post')}
            style={[styles.headerBtn, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
            hitSlop={8}
          >
            <Ionicons name="add" size={22} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => setFriendsOpen(true)}
            style={[styles.headerBtn, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
            hitSlop={8}
          >
            <Ionicons name="people-outline" size={20} color={colors.text} />
            {incomingRequests.length > 0 ? (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <ThemedText style={styles.badgeText}>{incomingRequests.length}</ThemedText>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={posts.length ? styles.listContent : styles.emptyContent}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onChanged={(next) => updatePost(next, item.id)}
            onOpenComments={(p) => setCommentsPostId(p.id)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={renderEmpty()}
      />

      <FriendsSheet visible={friendsOpen} onClose={() => setFriendsOpen(false)} />
      <CommentsSheet
        visible={!!commentsPostId}
        postId={commentsPostId}
        onClose={() => setCommentsPostId(null)}
        onCountChange={(d) => commentsPostId && bumpCommentCount(commentsPostId, d)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    paddingHorizontal: 4,
  },
  headerTitle: { fontSize: 26, fontWeight: '800' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  listContent: { paddingVertical: 12 },
  emptyContent: { flexGrow: 1 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 8 },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  cta: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 100,
  },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
