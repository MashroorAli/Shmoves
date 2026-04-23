import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { addComment, deleteComment, fetchComments, PostComment } from '@/config/posts-api';
import { useAuth } from '@/context/auth-context';
import { useColors } from '@/hooks/use-colors';

interface Props {
  visible: boolean;
  postId: string | null;
  onClose: () => void;
  onCountChange?: (delta: number) => void;
}

export function CommentsSheet({ visible, postId, onClose, onCountChange }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { uid } = useAuth();

  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const data = await fetchComments(postId);
      setComments(data);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not load comments.');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (visible && postId) {
      setComments([]);
      setText('');
      load();
    }
  }, [visible, postId, load]);

  const send = async () => {
    if (!uid || !postId || !text.trim() || sending) return;
    setSending(true);
    try {
      const c = await addComment(postId, uid, text);
      setComments((prev) => [...prev, c]);
      setText('');
      onCountChange?.(1);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not post comment.');
    } finally {
      setSending(false);
    }
  };

  const remove = (c: PostComment) => {
    Alert.alert('Delete comment', 'Remove this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteComment(c.id);
            setComments((prev) => prev.filter((x) => x.id !== c.id));
            onCountChange?.(-1);
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <ThemedText style={[styles.title, { color: colors.text }]}>Comments</ThemedText>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
          keyboardVerticalOffset={insets.top}
        >
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : !comments.length ? (
            <View style={styles.centered}>
              <ThemedText style={[styles.empty, { color: colors.icon }]}>No comments yet. Start the thread.</ThemedText>
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <CommentRow comment={item} canDelete={item.authorId === uid} onDelete={() => remove(item)} />
              )}
            />
          )}

          <View style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom + 10 }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Add a comment..."
              placeholderTextColor={colors.icon}
              multiline
              style={[styles.input, { color: colors.inputText, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <Pressable
              onPress={send}
              disabled={!text.trim() || sending}
              style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: !text.trim() || sending ? 0.5 : 1 }]}
            >
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function CommentRow({ comment, canDelete, onDelete }: { comment: PostComment; canDelete: boolean; onDelete: () => void }) {
  const colors = useColors();
  const initials = (comment.author.name ?? comment.author.username ?? '?').trim()[0]?.toUpperCase() ?? '?';

  return (
    <View style={[styles.commentRow, { borderColor: colors.border }]}>
      {comment.author.avatarUrl ? (
        <Image source={{ uri: comment.author.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <ThemedText style={[styles.avatarInitial, { color: colors.text }]}>{initials}</ThemedText>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.commentTopRow}>
          <ThemedText style={[styles.commentName, { color: colors.text }]} numberOfLines={1}>
            {comment.author.name ?? comment.author.username ?? 'Unknown'}
          </ThemedText>
          <ThemedText style={[styles.commentTime, { color: colors.icon }]}>{relTime(comment.createdAt)}</ThemedText>
          {canDelete ? (
            <Pressable onPress={onDelete} hitSlop={6} style={{ marginLeft: 6 }}>
              <Ionicons name="trash-outline" size={14} color={colors.icon} />
            </Pressable>
          ) : null}
        </View>
        <ThemedText style={[styles.commentBody, { color: colors.text }]}>{comment.body}</ThemedText>
      </View>
    </View>
  );
}

function relTime(iso: string): string {
  const d = new Date(iso);
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '800' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { fontSize: 14, textAlign: 'center' },

  list: { padding: 16, gap: 10 },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  avatarInitial: { fontSize: 13, fontWeight: '800' },
  commentTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  commentName: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  commentTime: { fontSize: 11, fontWeight: '600' },
  commentBody: { fontSize: 14, lineHeight: 19 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
