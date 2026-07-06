import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/config/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProfileSummary {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
}

export interface Friend extends ProfileSummary {
  friendshipId: string;
}

export interface FriendRequest extends ProfileSummary {
  friendshipId: string;
  direction: 'incoming' | 'outgoing';
}

export type Relationship = 'self' | 'none' | 'friends' | 'outgoing' | 'incoming';

interface FriendshipRow {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: 'pending' | 'accepted';
  createdAt: string;
}

interface SocialContextValue {
  friends: Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  isLoading: boolean;
  refresh: () => Promise<void>;

  searchProfiles: (query: string) => Promise<ProfileSummary[]>;
  getProfileByUsername: (username: string) => Promise<ProfileSummary | null>;
  sendFriendRequest: (addresseeId: string) => Promise<void>;
  acceptFriendRequest: (friendshipId: string) => Promise<void>;
  cancelFriendRequest: (friendshipId: string) => Promise<void>;
  declineFriendRequest: (friendshipId: string) => Promise<void>;
  unfriend: (friendshipId: string) => Promise<void>;
  getRelationship: (userId: string) => Relationship;
}

const SocialContext = createContext<SocialContextValue | undefined>(undefined);

// ─── Provider ────────────────────────────────────────────────────────────────

export function SocialProvider({ children, uid }: { children: React.ReactNode; uid: string | null }) {
  const [friendships, setFriendships] = useState<FriendshipRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileSummary>>({});
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!uid) {
      setFriendships([]);
      setProfilesById({});
      setIsLoading(false);
      return;
    }

    try {
      const { data: rows, error } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, status, created_at')
        .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
      if (error) throw error;

      const typed: FriendshipRow[] = (rows ?? []).map((r) => ({
        id: r.id,
        requesterId: r.requester_id,
        addresseeId: r.addressee_id,
        status: r.status,
        createdAt: r.created_at,
      }));
      setFriendships(typed);

      const otherIds = Array.from(
        new Set(typed.map((r) => (r.requesterId === uid ? r.addresseeId : r.requesterId))),
      );
      if (otherIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, name, username, avatar_url')
          .in('id', otherIds);
        const map: Record<string, ProfileSummary> = {};
        (profs ?? []).forEach((p) => {
          map[p.id] = {
            id: p.id,
            name: p.name ?? null,
            username: p.username ?? null,
            avatarUrl: p.avatar_url ?? null,
          };
        });
        setProfilesById(map);
      } else {
        setProfilesById({});
      }
    } finally {
      setIsLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: refresh on any friendship change
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`friendships-${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => {
          refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid, refresh]);

  const friends = useMemo<Friend[]>(() => {
    if (!uid) return [];
    return friendships
      .filter((f) => f.status === 'accepted')
      .map((f) => {
        const otherId = f.requesterId === uid ? f.addresseeId : f.requesterId;
        const prof = profilesById[otherId] ?? {
          id: otherId,
          name: null,
          username: null,
          avatarUrl: null,
        };
        return { ...prof, friendshipId: f.id };
      });
  }, [friendships, profilesById, uid]);

  const incomingRequests = useMemo<FriendRequest[]>(() => {
    if (!uid) return [];
    return friendships
      .filter((f) => f.status === 'pending' && f.addresseeId === uid)
      .map((f) => {
        const prof = profilesById[f.requesterId] ?? {
          id: f.requesterId,
          name: null,
          username: null,
          avatarUrl: null,
        };
        return { ...prof, friendshipId: f.id, direction: 'incoming' as const };
      });
  }, [friendships, profilesById, uid]);

  const outgoingRequests = useMemo<FriendRequest[]>(() => {
    if (!uid) return [];
    return friendships
      .filter((f) => f.status === 'pending' && f.requesterId === uid)
      .map((f) => {
        const prof = profilesById[f.addresseeId] ?? {
          id: f.addresseeId,
          name: null,
          username: null,
          avatarUrl: null,
        };
        return { ...prof, friendshipId: f.id, direction: 'outgoing' as const };
      });
  }, [friendships, profilesById, uid]);

  const searchProfiles = useCallback(
    async (query: string): Promise<ProfileSummary[]> => {
      const q = query.trim().replace(/^@/, '');
      if (!q) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .ilike('username', `${q}%`)
        .limit(20);
      if (error) throw error;
      return (data ?? [])
        .filter((p) => p.id !== uid)
        .map((p) => ({
          id: p.id,
          name: p.name ?? null,
          username: p.username ?? null,
          avatarUrl: p.avatar_url ?? null,
        }));
    },
    [uid],
  );

  const getProfileByUsername = useCallback(
    async (username: string): Promise<ProfileSummary | null> => {
      const u = username.trim().replace(/^@/, '').toLowerCase();
      if (!u) return null;
      const { data } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .eq('username', u)
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id,
        name: data.name ?? null,
        username: data.username ?? null,
        avatarUrl: data.avatar_url ?? null,
      };
    },
    [],
  );

  const sendFriendRequest = useCallback(
    async (addresseeId: string) => {
      if (!uid) throw new Error('Not signed in');
      if (addresseeId === uid) throw new Error("You can't add yourself");
      const existing = friendships.find(
        (f) =>
          (f.requesterId === uid && f.addresseeId === addresseeId) ||
          (f.requesterId === addresseeId && f.addresseeId === uid),
      );
      if (existing) {
        if (existing.status === 'accepted') throw new Error("You're already friends");
        throw new Error('A request between you two is already pending');
      }
      const { error } = await supabase.from('friendships').insert({
        requester_id: uid,
        addressee_id: addresseeId,
        status: 'pending',
      });
      if (error) throw error;
      await refresh();
    },
    [uid, friendships, refresh],
  );

  const acceptFriendRequest = useCallback(
    async (friendshipId: string) => {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendshipId);
      if (error) throw error;
      await refresh();
    },
    [refresh],
  );

  const deleteFriendship = useCallback(
    async (friendshipId: string) => {
      const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
      if (error) throw error;
      await refresh();
    },
    [refresh],
  );

  const getRelationship = useCallback(
    (userId: string): Relationship => {
      if (!uid) return 'none';
      if (userId === uid) return 'self';
      const f = friendships.find(
        (x) =>
          (x.requesterId === uid && x.addresseeId === userId) ||
          (x.requesterId === userId && x.addresseeId === uid),
      );
      if (!f) return 'none';
      if (f.status === 'accepted') return 'friends';
      return f.requesterId === uid ? 'outgoing' : 'incoming';
    },
    [uid, friendships],
  );

  const value = useMemo<SocialContextValue>(
    () => ({
      friends,
      incomingRequests,
      outgoingRequests,
      isLoading,
      refresh,
      searchProfiles,
      getProfileByUsername,
      sendFriendRequest,
      acceptFriendRequest,
      cancelFriendRequest: deleteFriendship,
      declineFriendRequest: deleteFriendship,
      unfriend: deleteFriendship,
      getRelationship,
    }),
    [
      friends,
      incomingRequests,
      outgoingRequests,
      isLoading,
      refresh,
      searchProfiles,
      getProfileByUsername,
      sendFriendRequest,
      acceptFriendRequest,
      deleteFriendship,
      getRelationship,
    ],
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error('useSocial must be used within a SocialProvider');
  return ctx;
}
