import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { createTripPost, uploadPhotoToCloudinary } from '@/config/posts-api';
import { useAuth } from '@/context/auth-context';
import { useSharedTrips } from '@/context/shared-trips-context';
import { useTrips } from '@/context/trips-context';
import { useColors } from '@/hooks/use-colors';

interface PickerTrip {
  source: 'personal' | 'shared';
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  isPublic: boolean;
}

interface LocalPhoto {
  uri: string;
  alreadyUploaded?: boolean;
}

export default function ComposePostScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { uid } = useAuth();
  const params = useLocalSearchParams<{ source?: string; tripId?: string }>();

  const { trips, setTripPublic } = useTrips();
  const { sharedTrips, setSharedTripPublic } = useSharedTrips();

  const ownTrips = useMemo<PickerTrip[]>(() => {
    const personal: PickerTrip[] = trips.map((t) => ({
      source: 'personal',
      id: t.id,
      destination: t.destination,
      startDate: t.startDate,
      endDate: t.endDate,
      isPublic: t.isPublic !== false,
    }));
    const shared: PickerTrip[] = sharedTrips
      .filter((s) => s.members.some((m) => m.userId === uid && m.status === 'accepted'))
      .map((s) => ({
        source: 'shared',
        id: s.id,
        destination: s.trip.destination,
        startDate: s.trip.startDate,
        endDate: s.trip.endDate,
        isPublic: s.isPublic,
      }));
    return [...shared, ...personal];
  }, [trips, sharedTrips, uid]);

  const [selected, setSelected] = useState<PickerTrip | null>(() => {
    if (params.source && params.tripId) {
      const match = ownTrips.find((t) => t.source === params.source && t.id === params.tripId);
      if (match) return match;
    }
    return null;
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [tripPhotoPickerOpen, setTripPhotoPickerOpen] = useState(false);
  const [tripSelection, setTripSelection] = useState<Set<string>>(new Set());

  const pickFromLibrary = async () => {
    const slots = 5 - photos.length;
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
    setPhotos((prev) => [...prev, ...result.assets.slice(0, slots).map((a) => ({ uri: a.uri }))]);
  };

  const tripPhotos = selected?.source === 'shared'
    ? (sharedTrips.find((st) => st.id === selected.id)?.photos ?? [])
    : [];

  const handleAddPhoto = () => {
    const slots = 5 - photos.length;
    if (slots <= 0) return;
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Photo Library', 'Trip Photos', 'Cancel'], cancelButtonIndex: 2 },
      (index) => {
        if (index === 0) {
          pickFromLibrary();
        } else if (index === 1) {
          if (tripPhotos.length === 0) {
            Alert.alert('No trip photos', 'This trip has no photos uploaded yet. Add some from the Photos tab first.');
          } else {
            setTripSelection(new Set());
            setTripPhotoPickerOpen(true);
          }
        }
      },
    );
  };

  const removePhoto = (uri: string) => setPhotos((prev) => prev.filter((p) => p.uri !== uri));

  const confirmMakePublic = (trip: PickerTrip) =>
    new Promise<boolean>((resolve) => {
      Alert.alert(
        'Private trip',
        `"${trip.destination}" is private. Make it public so friends can see this post?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Make public', onPress: () => resolve(true) },
        ],
      );
    });

  const submit = async () => {
    if (!selected || !uid) {
      Alert.alert('Pick a trip', 'Choose which trip this post is about.');
      return;
    }
    if (!body.trim() && !photos.length) {
      Alert.alert('Empty post', 'Write something or add a photo.');
      return;
    }

    if (!selected.isPublic) {
      const ok = await confirmMakePublic(selected);
      if (!ok) return;
      try {
        if (selected.source === 'personal') setTripPublic(selected.id, true);
        else await setSharedTripPublic(selected.id, true);
        setSelected({ ...selected, isPublic: true });
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Could not change privacy.');
        return;
      }
    }

    setBusy(true);
    try {
      const uploaded: string[] = [];
      for (const p of photos) {
        if (p.alreadyUploaded) {
          uploaded.push(p.uri);
        } else {
          const url = await uploadPhotoToCloudinary(p.uri);
          uploaded.push(url);
        }
      }
      await createTripPost({
        authorId: uid,
        tripSource: selected.source,
        tripId: selected.id,
        destination: selected.destination,
        startDate: selected.startDate || null,
        endDate: selected.endDate || null,
        body: body.trim(),
        photos: uploaded,
      });
      router.back();
    } catch (e: any) {
      Alert.alert('Post failed', e.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ThemedText style={[styles.cancelText, { color: colors.icon }]}>Cancel</ThemedText>
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>New post</ThemedText>
        <Pressable
          onPress={submit}
          disabled={busy}
          style={[styles.postBtn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
        >
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <ThemedText style={styles.postBtnText}>Post</ThemedText>}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={[styles.pickerRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Ionicons name="airplane-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              {selected ? (
                <>
                  <ThemedText style={[styles.pickerTitle, { color: colors.text }]}>{selected.destination}</ThemedText>
                  <ThemedText style={[styles.pickerSub, { color: colors.icon }]}>
                    {formatRange(selected.startDate, selected.endDate)}
                    {!selected.isPublic ? ' · Private (will be made public)' : ''}
                  </ThemedText>
                </>
              ) : (
                <ThemedText style={[styles.pickerTitle, { color: colors.text }]}>Pick a trip</ThemedText>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.icon} />
          </Pressable>

          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="What do you want to share?"
            placeholderTextColor={colors.icon}
            multiline
            style={[styles.bodyInput, { color: colors.inputText, borderColor: colors.border, backgroundColor: colors.surface }]}
          />

          <View style={styles.photosWrap}>
            {photos.map((p) => (
              <View key={p.uri} style={styles.photoItem}>
                <Image source={{ uri: p.uri }} style={styles.photoThumb} />
                <Pressable style={styles.photoRemove} onPress={() => removePhoto(p.uri)} hitSlop={6}>
                  <Ionicons name="close-circle" size={22} color="#fff" />
                </Pressable>
              </View>
            ))}
            {photos.length < 5 ? (
              <Pressable
                onPress={handleAddPhoto}
                style={[styles.photoAdd, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
              >
                <Ionicons name="add" size={28} color={colors.primary} />
                <ThemedText style={[styles.photoAddText, { color: colors.icon }]}>Add photo</ThemedText>
              </Pressable>
            ) : null}
          </View>

          <ThemedText style={[styles.helperText, { color: colors.icon }]}>
            Up to 5 photos. Friends will only see this post — not the rest of the trip (flights, expenses, etc).
          </ThemedText>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={tripPhotoPickerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setTripPhotoPickerOpen(false)}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
          <View style={styles.header}>
            <Pressable onPress={() => setTripPhotoPickerOpen(false)} hitSlop={10}>
              <ThemedText style={[styles.cancelText, { color: colors.icon }]}>Cancel</ThemedText>
            </Pressable>
            <ThemedText style={[styles.headerTitle, { color: colors.text }]}>
              Trip Photos{tripSelection.size > 0 ? ` (${tripSelection.size})` : ''}
            </ThemedText>
            <Pressable
              hitSlop={10}
              disabled={tripSelection.size === 0}
              style={[styles.postBtn, { backgroundColor: colors.primary, opacity: tripSelection.size === 0 ? 0.4 : 1 }]}
              onPress={() => {
                const slots = 5 - photos.length;
                const toAdd = tripPhotos
                  .filter((p) => tripSelection.has(p.id) && !photos.some((ph) => ph.uri === p.path))
                  .slice(0, slots)
                  .map((p) => ({ uri: p.path, alreadyUploaded: true as const }));
                setPhotos((prev) => [...prev, ...toAdd]);
                setTripPhotoPickerOpen(false);
              }}>
              <ThemedText style={styles.postBtnText}>Add</ThemedText>
            </Pressable>
          </View>
          <FlatList
            data={tripPhotos}
            numColumns={3}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ padding: 2 }}
            renderItem={({ item }) => {
              const alreadyAdded = photos.some((p) => p.uri === item.path);
              const selected = tripSelection.has(item.id);
              const slots = 5 - photos.length;
              const atLimit = tripSelection.size >= slots && !selected;
              return (
                <Pressable
                  style={{ flex: 1/3, aspectRatio: 1, padding: 2, opacity: alreadyAdded || atLimit ? 0.4 : 1 }}
                  onPress={() => {
                    if (alreadyAdded || atLimit) return;
                    setTripSelection((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    });
                  }}>
                  <Image source={{ uri: item.path }} style={{ flex: 1, borderRadius: 4 }} resizeMode="cover" />
                  {selected && (
                    <View style={styles.tripPhotoCheck}>
                      <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>

      <TripPickerModal
        visible={pickerOpen}
        trips={ownTrips}
        selectedId={selected?.id ?? null}
        onSelect={(t) => {
          setSelected(t);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </ThemedView>
  );
}

function TripPickerModal({
  visible,
  trips,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  trips: PickerTrip[];
  selectedId: string | null;
  onSelect: (t: PickerTrip) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalRoot, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <ThemedText style={[styles.headerTitle, { color: colors.text }]}>Pick a trip</ThemedText>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        {!trips.length ? (
          <View style={styles.emptyWrap}>
            <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>No trips yet</ThemedText>
            <ThemedText style={[styles.emptyBody, { color: colors.icon }]}>
              Add a trip first, then come back to post about it.
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={trips}
            keyExtractor={(t) => `${t.source}:${t.id}`}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            renderItem={({ item }) => {
              const selected = item.id === selectedId;
              return (
                <Pressable
                  onPress={() => onSelect(item)}
                  style={[
                    styles.tripRow,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: colors.surface,
                      borderWidth: selected ? 2 : 1,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText style={[styles.tripTitle, { color: colors.text }]}>{item.destination}</ThemedText>
                    <ThemedText style={[styles.tripSub, { color: colors.icon }]}>
                      {formatRange(item.startDate, item.endDate)}
                      {item.source === 'shared' ? ' · Shared' : ''}
                      {!item.isPublic ? ' · Private' : ''}
                    </ThemedText>
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  // YYYY-MM-DD — construct in local time to avoid UTC midnight shifting the day
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatRange(start: string, end: string): string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s && !e) return '';
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (s && e) return `${fmt(s)} – ${fmt(e)}`;
  if (s) return fmt(s);
  return fmt(e!);
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  postBtn: {
    minWidth: 64,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  scrollContent: { padding: 16, gap: 12 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
  },
  pickerTitle: { fontSize: 15, fontWeight: '700' },
  pickerSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  bodyInput: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  photosWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoItem: { position: 'relative' },
  photoThumb: { width: 84, height: 84, borderRadius: 12 },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
  },
  photoAdd: {
    width: 84,
    height: 84,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddText: { fontSize: 11, marginTop: 2, fontWeight: '600' },
  helperText: { fontSize: 12, marginTop: 4, lineHeight: 18 },

  tripPhotoCheck: { position: 'absolute', bottom: 6, right: 6 },
  modalRoot: { flex: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyBody: { fontSize: 14, textAlign: 'center' },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
  },
  tripTitle: { fontSize: 15, fontWeight: '700' },
  tripSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});
