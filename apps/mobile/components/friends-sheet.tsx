import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MyQrModal, ScanQrModal } from '@/components/qr-modals';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/config/supabase';
import { useAuth } from '@/context/auth-context';
import { ProfileSummary, useSocial } from '@/context/social-context';
import { useColors } from '@/hooks/use-colors';

type Tab = 'friends' | 'requests' | 'add';

interface Props {
  visible: boolean;
  onClose: () => void;
  initialTab?: Tab;
}

export function FriendsSheet({ visible, onClose, initialTab = 'friends' }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    if (visible) setTab(initialTab);
  }, [visible, initialTab]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Friends</ThemedText>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <View style={[styles.tabsRow, { borderBottomColor: colors.border }]}>
          {(['friends', 'requests', 'add'] as Tab[]).map((t) => (
            <TabButton key={t} label={tabLabel(t)} active={tab === t} onPress={() => setTab(t)} />
          ))}
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
          keyboardVerticalOffset={insets.top}
        >
          {tab === 'friends' && <FriendsTab />}
          {tab === 'requests' && <RequestsTab />}
          {tab === 'add' && <AddTab />}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function tabLabel(t: Tab) {
  return t === 'friends' ? 'Friends' : t === 'requests' ? 'Requests' : 'Add';
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useColors();
  const { incomingRequests } = useSocial();
  const showBadge = label === 'Requests' && incomingRequests.length > 0;
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && { borderBottomColor: colors.primary }]}>
      <View style={styles.tabLabelRow}>
        <ThemedText
          style={[styles.tabLabel, { color: active ? colors.primary : colors.icon }]}
        >
          {label}
        </ThemedText>
        {showBadge ? (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <ThemedText style={styles.badgeText}>{incomingRequests.length}</ThemedText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Friends tab ─────────────────────────────────────────────────────────────

function FriendsTab() {
  const colors = useColors();
  const { friends, unfriend, isLoading } = useSocial();

  const confirmUnfriend = (friendshipId: string, name: string) => {
    Alert.alert('Unfriend', `Remove ${name} from your friends?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          unfriend(friendshipId).catch((e) => Alert.alert('Error', e.message));
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!friends.length) {
    return (
      <View style={styles.centered}>
        <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>No friends yet</ThemedText>
        <ThemedText style={[styles.emptyBody, { color: colors.icon }]}>
          Head to the Add tab to search for a username or share your invite link.
        </ThemedText>
      </View>
    );
  }

  return (
    <FlatList
      data={friends}
      keyExtractor={(f) => f.friendshipId}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <ProfileRow
          profile={item}
          right={
            <Pressable
              onPress={() => confirmUnfriend(item.friendshipId, item.name ?? item.username ?? 'this user')}
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
            >
              <ThemedText style={[styles.secondaryBtnText, { color: colors.destructive }]}>Remove</ThemedText>
            </Pressable>
          }
        />
      )}
    />
  );
}

// ─── Requests tab ────────────────────────────────────────────────────────────

function RequestsTab() {
  const colors = useColors();
  const {
    incomingRequests,
    outgoingRequests,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
  } = useSocial();

  const hasAny = incomingRequests.length + outgoingRequests.length > 0;

  if (!hasAny) {
    return (
      <View style={styles.centered}>
        <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>No requests</ThemedText>
        <ThemedText style={[styles.emptyBody, { color: colors.icon }]}>
          Friend requests you send or receive will appear here.
        </ThemedText>
      </View>
    );
  }

  return (
    <FlatList
      data={[...incomingRequests, ...outgoingRequests]}
      keyExtractor={(r) => r.friendshipId}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        incomingRequests.length ? (
          <ThemedText style={[styles.sectionLabel, { color: colors.icon }]}>Incoming</ThemedText>
        ) : null
      }
      renderItem={({ item, index }) => {
        const firstOutgoing = index === incomingRequests.length && outgoingRequests.length > 0;
        const isIncoming = item.direction === 'incoming';
        return (
          <>
            {firstOutgoing ? (
              <ThemedText style={[styles.sectionLabel, styles.sectionLabelInline, { color: colors.icon }]}>
                Sent
              </ThemedText>
            ) : null}
            <ProfileRow
              profile={item}
              right={
                isIncoming ? (
                  <View style={styles.buttonRow}>
                    <Pressable
                      onPress={() =>
                        acceptFriendRequest(item.friendshipId).catch((e) => Alert.alert('Error', e.message))
                      }
                      style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                    >
                      <ThemedText style={styles.primaryBtnText}>Accept</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        declineFriendRequest(item.friendshipId).catch((e) => Alert.alert('Error', e.message))
                      }
                      style={[styles.secondaryBtn, { borderColor: colors.border }]}
                    >
                      <ThemedText style={[styles.secondaryBtnText, { color: colors.text }]}>Decline</ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() =>
                      cancelFriendRequest(item.friendshipId).catch((e) => Alert.alert('Error', e.message))
                    }
                    style={[styles.secondaryBtn, { borderColor: colors.border }]}
                  >
                    <ThemedText style={[styles.secondaryBtnText, { color: colors.text }]}>Cancel</ThemedText>
                  </Pressable>
                )
              }
            />
          </>
        );
      }}
    />
  );
}

// ─── Add tab ─────────────────────────────────────────────────────────────────

function AddTab() {
  const colors = useColors();
  const { uid } = useAuth();
  const { searchProfiles, sendFriendRequest, getRelationship } = useSocial();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [showMyQr, setShowMyQr] = useState(false);
  const [showScanQr, setShowScanQr] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!uid) return;
    supabase
      .from('profiles')
      .select('username, name')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.username) setMyUsername(data.username);
        if (data?.name) setMyName(data.name);
      });
  }, [uid]);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const r = await searchProfiles(query);
        setResults(r);
      } catch (e: any) {
        Alert.alert('Search failed', e.message);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [query, searchProfiles]);

  const shareInvite = useCallback(async () => {
    // Best-effort: try to use username if known, otherwise just share the app.
    const link = myUsername
      ? `shmoves://add-friend/${myUsername}`
      : 'https://apps.apple.com/app/id0'; // TODO: replace with real App Store link when available
    const message = myUsername
      ? `Add me on Shmoves: @${myUsername}\n${link}`
      : `Join me on Shmoves!\n${link}`;
    try {
      await Share.share({ message });
    } catch {
      /* user cancelled */
    }
  }, [myUsername]);

  return (
    <View style={styles.flex}>
      <View style={styles.addHeader}>
        <View style={[styles.searchInput, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name="search" size={16} color={colors.icon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by username"
            placeholderTextColor={colors.icon}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchTextInput, { color: colors.inputText }]}
          />
        </View>

        <View style={styles.shareRow}>
          <Pressable onPress={shareInvite} style={[styles.shareBtn, { borderColor: colors.border }]}>
            <Ionicons name="share-outline" size={18} color={colors.text} />
            <ThemedText style={[styles.shareBtnText, { color: colors.text }]}>Invite</ThemedText>
          </Pressable>
          <Pressable onPress={() => setShowMyQr(true)} style={[styles.shareBtn, { borderColor: colors.border }]}>
            <Ionicons name="qr-code-outline" size={18} color={colors.text} />
            <ThemedText style={[styles.shareBtnText, { color: colors.text }]}>My QR</ThemedText>
          </Pressable>
          <Pressable onPress={() => setShowScanQr(true)} style={[styles.shareBtn, { borderColor: colors.border }]}>
            <Ionicons name="scan-outline" size={18} color={colors.text} />
            <ThemedText style={[styles.shareBtnText, { color: colors.text }]}>Scan</ThemedText>
          </Pressable>
        </View>
      </View>

      <MyQrModal
        visible={showMyQr}
        username={myUsername}
        displayName={myName}
        onClose={() => setShowMyQr(false)}
      />
      <ScanQrModal visible={showScanQr} onClose={() => setShowScanQr(false)} />

      {searching ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : query.trim() && !results.length ? (
        <View style={styles.centered}>
          <ThemedText style={[styles.emptyBody, { color: colors.icon }]}>
            No one found for “{query}”.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ProfileRow
              profile={item}
              right={
                <SendRequestButton
                  userId={item.id}
                  onSend={() => sendFriendRequest(item.id)}
                  relationship={getRelationship(item.id)}
                />
              }
            />
          )}
        />
      )}
    </View>
  );
}

function SendRequestButton({
  userId,
  onSend,
  relationship,
}: {
  userId: string;
  onSend: () => Promise<void>;
  relationship: ReturnType<ReturnType<typeof useSocial>['getRelationship']>;
}) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);

  if (relationship === 'friends') {
    return (
      <View style={[styles.pillLabel, { borderColor: colors.border }]}>
        <ThemedText style={[styles.pillLabelText, { color: colors.icon }]}>Friends</ThemedText>
      </View>
    );
  }
  if (relationship === 'outgoing') {
    return (
      <View style={[styles.pillLabel, { borderColor: colors.border }]}>
        <ThemedText style={[styles.pillLabelText, { color: colors.icon }]}>Requested</ThemedText>
      </View>
    );
  }
  if (relationship === 'incoming') {
    return (
      <View style={[styles.pillLabel, { borderColor: colors.border }]}>
        <ThemedText style={[styles.pillLabelText, { color: colors.icon }]}>Check Requests</ThemedText>
      </View>
    );
  }
  if (relationship === 'self') return null;

  return (
    <Pressable
      onPress={async () => {
        setBusy(true);
        try {
          await onSend();
        } catch (e: any) {
          Alert.alert('Error', e.message);
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
    >
      <ThemedText style={styles.primaryBtnText}>{busy ? '...' : 'Add'}</ThemedText>
    </Pressable>
  );
}

// ─── Shared row ──────────────────────────────────────────────────────────────

function ProfileRow({ profile, right }: { profile: ProfileSummary; right: React.ReactNode }) {
  const colors = useColors();
  const initials = useMemo(() => {
    const src = profile.name ?? profile.username ?? '?';
    return src.trim()[0]?.toUpperCase() ?? '?';
  }, [profile]);

  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      {profile.avatarUrl ? (
        <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <ThemedText style={[styles.avatarInitial, { color: colors.text }]}>{initials}</ThemedText>
        </View>
      )}
      <View style={styles.rowTextBlock}>
        <ThemedText style={styles.rowName} numberOfLines={1}>
          {profile.name ?? profile.username ?? 'Unknown'}
        </ThemedText>
        {profile.username ? (
          <ThemedText style={[styles.rowSub, { color: colors.icon }]} numberOfLines={1}>
            @{profile.username}
          </ThemedText>
        ) : null}
      </View>
      <View>{right}</View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '800' },

  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 20,
  },
  tab: {
    paddingVertical: 12,
    marginRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabLabel: { fontSize: 15, fontWeight: '700' },
  badge: {
    minWidth: 20,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  listContent: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
    marginBottom: 4,
  },
  sectionLabelInline: { marginTop: 12 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarInitial: { fontSize: 16, fontWeight: '800' },
  rowTextBlock: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 13, fontWeight: '500', marginTop: 2 },

  buttonRow: { flexDirection: 'row', gap: 6 },
  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  secondaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '700' },
  pillLabel: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
  },
  pillLabelText: { fontSize: 12, fontWeight: '700' },

  addHeader: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchTextInput: { flex: 1, fontSize: 15 },
  shareRow: { flexDirection: 'row', gap: 10 },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  shareBtnText: { fontSize: 14, fontWeight: '700' },
});
