import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { type ProfileSummary, useSocial } from '@/context/social-context';
import { useColors } from '@/hooks/use-colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  existingMemberIds: Set<string>;
  onInviteById: (userId: string) => Promise<void>;
  onShareLink: () => Promise<void>;
}

export function TripInviteSheet({ visible, onClose, existingMemberIds, onInviteById, onShareLink }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { friends, searchProfiles } = useSocial();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults([]);
      setInvitedIds(new Set());
      setBusyId(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const r = await searchProfiles(query);
        setResults(r);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, searchProfiles]);

  const handleInvite = useCallback(async (profile: ProfileSummary) => {
    if (busyId || invitedIds.has(profile.id) || existingMemberIds.has(profile.id)) return;
    setBusyId(profile.id);
    try {
      await onInviteById(profile.id);
      setInvitedIds((prev) => new Set([...prev, profile.id]));
    } catch {
      // error handled in parent via Alert
    } finally {
      setBusyId(null);
    }
  }, [busyId, invitedIds, existingMemberIds, onInviteById]);

  const handleShareLink = async () => {
    setLinkBusy(true);
    try { await onShareLink(); } finally { setLinkBusy(false); }
  };

  const eligibleFriends = useMemo(
    () => friends.filter((f) => !existingMemberIds.has(f.id) && !invitedIds.has(f.id)),
    [friends, existingMemberIds, invitedIds],
  );

  const isSearching = query.trim().length > 0;
  const listData: ProfileSummary[] = isSearching ? results : eligibleFriends;

  const renderRow = useCallback((profile: ProfileSummary) => {
    const inTrip = existingMemberIds.has(profile.id);
    const invited = invitedIds.has(profile.id);
    const busy = busyId === profile.id;
    const initials = (profile.name ?? profile.username ?? '?').trim()[0]?.toUpperCase() ?? '?';

    return (
      <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
            <ThemedText style={[styles.avatarInitial, { color: colors.text }]}>{initials}</ThemedText>
          </View>
        )}
        <View style={styles.rowText}>
          <ThemedText style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
            {profile.name ?? profile.username ?? 'Unknown'}
          </ThemedText>
          {profile.username ? (
            <ThemedText style={[styles.rowSub, { color: colors.icon }]}>@{profile.username}</ThemedText>
          ) : null}
        </View>
        {inTrip ? (
          <View style={[styles.pill, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
            <ThemedText style={[styles.pillText, { color: colors.icon }]}>In trip</ThemedText>
          </View>
        ) : invited ? (
          <View style={[styles.pill, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
            <ThemedText style={[styles.pillText, { color: colors.primary }]}>Invited ✓</ThemedText>
          </View>
        ) : (
          <Pressable
            onPress={() => handleInvite(profile)}
            disabled={!!busyId}
            style={[styles.addBtn, { backgroundColor: colors.primary, opacity: busyId && busyId !== profile.id ? 0.5 : 1 }]}
          >
            {busy
              ? <ActivityIndicator size="small" color="#fff" />
              : <ThemedText style={styles.addBtnText}>Add</ThemedText>}
          </Pressable>
        )}
      </View>
    );
  }, [colors, busyId, invitedIds, existingMemberIds, handleInvite]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>

        <View style={styles.header}>
          <ThemedText style={[styles.headerTitle, { color: colors.text }]}>Add People</ThemedText>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <View style={[styles.searchBar, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons name="search-outline" size={18} color={colors.icon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by username..."
            placeholderTextColor={colors.icon}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.inputText }]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.icon} />
            </Pressable>
          )}
        </View>

        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            isSearching ? (
              searching ? (
                <ActivityIndicator style={{ marginVertical: 20 }} color={colors.primary} />
              ) : results.length === 0 ? (
                <ThemedText style={[styles.emptyText, { color: colors.icon }]}>No users found.</ThemedText>
              ) : null
            ) : (
              <View>
                <ThemedText style={[styles.sectionLabel, { color: colors.icon }]}>Friends</ThemedText>
                {friends.length === 0 && (
                  <ThemedText style={[styles.emptyText, { color: colors.icon }]}>
                    Add friends on Shmovements to invite them here.
                  </ThemedText>
                )}
                {friends.length > 0 && eligibleFriends.length === 0 && (
                  <ThemedText style={[styles.emptyText, { color: colors.icon }]}>
                    All your friends are already in this trip.
                  </ThemedText>
                )}
              </View>
            )
          }
          renderItem={({ item }) => renderRow(item)}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />

        <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            onPress={handleShareLink}
            disabled={linkBusy}
            style={[styles.linkBtn, { borderColor: colors.border, backgroundColor: colors.surface, opacity: linkBusy ? 0.6 : 1 }]}
          >
            {linkBusy
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <>
                  <Ionicons name="link-outline" size={18} color={colors.primary} />
                  <ThemedText style={[styles.linkBtnText, { color: colors.primary }]}>Share invite link</ThemedText>
                </>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 15 },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  emptyText: { fontSize: 14, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  avatarInitial: { fontSize: 16, fontWeight: '800' },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: '700' },
  addBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  footer: {
    borderTopWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  linkBtnText: { fontSize: 15, fontWeight: '700' },
});
