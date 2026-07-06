import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommentsSheet } from '@/components/comments-sheet';
import { PostCard } from '@/components/post-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FeedPost, fetchTripPosts } from '@/config/posts-api';
import { useAuth } from '@/context/auth-context';
import { useColors } from '@/hooks/use-colors';

export default function PublicTripScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { uid } = useAuth();
  const params = useLocalSearchParams<{ source: string; id: string }>();

  const source = (params.source === 'shared' ? 'shared' : 'personal') as 'personal' | 'shared';
  const tripId = useMemo(() => decodeURIComponent(params.id ?? ''), [params.id]);

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    try {
      const data = await fetchTripPosts(source, tripId, uid);
      setPosts(data);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [source, tripId, uid]);

  useEffect(() => {
    load();
  }, [load]);

  const first = posts[0];
  const destination = first?.destination ?? '';
  const dateRange = useMemo(() => {
    const s = first?.startDate;
    const e = first?.endDate;
    if (!s && !e) return '';
    try {
      const fmt = (d: string) =>
        new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      if (s && e) return `${fmt(s)} – ${fmt(e)}`;
      return s ? fmt(s) : e ? fmt(e) : '';
    } catch {
      return '';
    }
  }, [first]);

  const bumpCommentCount = (postId: string, delta: number) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, commentCount: Math.max(0, p.commentCount + delta) } : p)),
    );
  };

  const updatePost = (next: FeedPost | null, id: string) => {
    setPosts((prev) => {
      if (!next) return prev.filter((p) => p.id !== id);
      return prev.map((p) => (p.id === id ? next : p));
    });
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {destination || 'Trip'}
          </ThemedText>
          {dateRange ? <ThemedText style={[styles.subtitle, { color: colors.icon }]}>{dateRange}</ThemedText> : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !posts.length ? (
        <View style={styles.centered}>
          <Ionicons name="document-text-outline" size={40} color={colors.icon} />
          <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>No posts</ThemedText>
          <ThemedText style={[styles.emptyBody, { color: colors.icon }]}>
            There are no public posts for this trip.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              hideTapForDetails
              onChanged={(next) => updatePost(next, item.id)}
              onOpenComments={(p) => setCommentsPostId(p.id)}
            />
          )}
        />
      )}

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
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13, fontWeight: '600', marginTop: 2 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  emptyBody: { fontSize: 14, textAlign: 'center' },

  listContent: { padding: 16 },
});
