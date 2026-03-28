import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useSharedTrips } from '@/context/shared-trips-context';
import { type TicketAttachment, type TripHousing, useTrips } from '@/context/trips-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/config/supabase';

type CachedHeroImages = {
  fetchedAt: number;
  urls: string[];
  lastIndex?: number;
};

type TripPerson = {
  id: string;
  name: string;
  avatarUri?: string;
};

// ─── SwipeableDayCard ────────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 40;

function SwipeableDayCard({
  onDelete,
  onEdit,
  colors,
  children,
}: {
  onDelete: () => void;
  onEdit: () => void;
  colors: typeof import('@/constants/theme').Colors.light;
  children: React.ReactNode;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  // Tracks which direction the current swipe is going so we show the right action bg
  const swipeDir = useRef<'left' | 'right' | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      // Take over when movement is clearly horizontal
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy) * 1.5,
      onPanResponderGrant: () => {
        swipeDir.current = null;
      },
      onPanResponderMove: (_, { dx }) => {
        if (swipeDir.current === null) {
          swipeDir.current = dx < 0 ? 'left' : 'right';
        }
        // Clamp: left max -120, right max +120, with soft resistance beyond threshold
        const clamped =
          dx < 0
            ? Math.max(dx, -120)
            : Math.min(dx, 120);
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, { dx }) => {
        if (dx < -SWIPE_THRESHOLD) {
          // Swipe left past threshold → delete
          Animated.timing(translateX, {
            toValue: -400,
            duration: 220,
            useNativeDriver: true,
          }).start(() => {
            onDelete();
            translateX.setValue(0);
          });
        } else if (dx > SWIPE_THRESHOLD) {
          // Swipe right past threshold → edit, snap back
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            speed: 30,
            bounciness: 4,
          }).start();
          onEdit();
        } else {
          // Not far enough — snap back
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            speed: 30,
            bounciness: 4,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          speed: 30,
          bounciness: 4,
        }).start();
      },
    }),
  ).current;

  // Right side (delete) background — fades from transparent to red at SWIPE_THRESHOLD
  const deleteBg = translateX.interpolate({
    inputRange: [-120, -SWIPE_THRESHOLD, 0],
    outputRange: [colors.destructive, colors.destructive, 'transparent'],
    extrapolate: 'clamp',
  });

  // Left side (edit) background — fades from transparent to blue at SWIPE_THRESHOLD
  const editBg = translateX.interpolate({
    inputRange: [0, SWIPE_THRESHOLD, 120],
    outputRange: ['transparent', colors.primary, colors.primary],
    extrapolate: 'clamp',
  });

  // Icon opacity — appears when swiping the correct direction
  const deleteIconOpacity = translateX.interpolate({
    inputRange: [-120, -10, 0],
    outputRange: [1, 0.6, 0],
    extrapolate: 'clamp',
  });
  const editIconOpacity = translateX.interpolate({
    inputRange: [0, 10, 120],
    outputRange: [0, 0.6, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={swipeCardStyles.row}>
      {/* Delete action (right side) */}
      <Animated.View
        pointerEvents="none"
        style={[swipeCardStyles.actionRight, { backgroundColor: deleteBg }]}>
        <Animated.View style={{ opacity: deleteIconOpacity }}>
          <IconSymbol name="trash" size={22} color="#fff" />
        </Animated.View>
      </Animated.View>

      {/* Edit action (left side) */}
      <Animated.View
        pointerEvents="none"
        style={[swipeCardStyles.actionLeft, { backgroundColor: editBg }]}>
        <Animated.View style={{ opacity: editIconOpacity }}>
          <IconSymbol name="pencil" size={22} color="#fff" />
        </Animated.View>
      </Animated.View>

      {/* The card itself */}
      <Animated.View
        style={[swipeCardStyles.card, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const swipeCardStyles = StyleSheet.create({
  row: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 12,
    marginBottom: 0,
  },
  card: {
    width: '100%',
  },
  actionRight: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
    borderRadius: 12,
  },
  actionLeft: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 20,
    borderRadius: 12,
  },
});

export default function TripDetailsScreen() {
  const { id } = useLocalSearchParams<{
    id?: string;
  }>();
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme];
  const { uid } = useAuth();
  const { sharedTrips, migrateToShared, inviteToTrip, inviteByUsername } = useSharedTrips();
  const {
    trips,
    flightsByTripId,
    addFlight,
    updateFlight,
    deleteFlight,
    itineraryByTripId,
    addItineraryDay,
    addItineraryEvent,
    updateItineraryDay,
    deleteItineraryDay,
    updateItineraryEvent,
    deleteItineraryEvent,
    expensesByTripId,
    addExpense,
    updateExpense,
    deleteExpense,
    journalByTripId,
    addJournalEntry,
    updateJournalEntry,
    deleteJournalEntry,
    housingByTripId,
    addHousing,
    deleteHousing,
  } = useTrips();
  const [activeTab, setActiveTab] = useState<'overview' | 'itinerary' | 'finances' | 'photos' | 'feed'>('overview');

  const sharedTrip = sharedTrips.find(
    (st) => st.trip.id === id || st.id === id,
  );
  const trip = id ? (trips.find((t) => t.id === id) ?? sharedTrip?.trip) : undefined;
  const tripId = id;
  const flights = tripId ? (flightsByTripId[tripId]?.length ? flightsByTripId[tripId] : (sharedTrip?.flights ?? [])) : [];
  const itineraryDays = tripId ? (itineraryByTripId[tripId]?.length ? itineraryByTripId[tripId] : (sharedTrip?.itinerary ?? [])) : [];
  const expenses = tripId ? (expensesByTripId[tripId]?.length ? expensesByTripId[tripId] : (sharedTrip?.expenses ?? [])) : [];
  const journalEntries = tripId ? (journalByTripId[tripId]?.length ? journalByTripId[tripId] : (sharedTrip?.journal ?? [])) : [];
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const selectedDay = selectedDayId ? itineraryDays.find((d) => d.id === selectedDayId) : undefined;
  const [expandedDayIds, setExpandedDayIds] = useState<Set<string>>(new Set());

  const [editMode, setEditMode] = useState(false);
  const itineraryAutoPopulated = useRef(false);

  useEffect(() => {
    if (
      activeTab === 'itinerary' &&
      tripId &&
      trip?.startDate &&
      trip?.endDate &&
      itineraryDays.length === 0 &&
      !itineraryAutoPopulated.current
    ) {
      itineraryAutoPopulated.current = true;
      const start = new Date(trip.startDate);
      const end = new Date(trip.endDate);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start) {
        const msPerDay = 86400000;
        const totalDays = Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;

        // Create days and track date → day mapping for flight injection
        const dateToDay: Record<string, ReturnType<typeof addItineraryDay>> = {};
        for (let i = 0; i < totalDays; i++) {
          const dayDate = new Date(start.getTime() + i * msPerDay);
          const iso = dayDate.toISOString().slice(0, 10);
          const day = addItineraryDay(tripId, `Day ${i + 1}`, iso);
          dateToDay[iso] = day;
        }

        // Auto-add a flight event to the matching departure day
        for (const flight of flights) {
          if (!flight.departureDate) continue;
          const day = dateToDay[flight.departureDate];
          if (!day) continue;
          const from = flight.from ?? flight.fromCity ?? '';
          const to = flight.to ?? flight.toCity ?? '';
          const num = flight.flightNumber ?? '';
          const airline = flight.airline ?? '';
          const label = [airline, num, from && to ? `${from} → ${to}` : ''].filter(Boolean).join(' · ');
          addItineraryEvent(tripId, day.id, label || 'Flight', flight.departureTime ?? '00:00');
        }
      }
    }
  }, [activeTab, tripId, trip?.startDate, trip?.endDate, itineraryDays.length, addItineraryDay, addItineraryEvent, flights]);

  const [showItineraryTips, setShowItineraryTips] = useState(false);
  const [itineraryTipIndex, setItineraryTipIndex] = useState(0);
  const itineraryTipsShownRef = useRef(false);
  const helpButtonRef = useRef<View>(null);
  const pencilButtonRef = useRef<View>(null);
  const [tipAnchor, setTipAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Tip bubble animations
  const tipBubbleScale = useRef(new Animated.Value(0.88)).current;
  const tipBubbleOpacity = useRef(new Animated.Value(0)).current;
  const tipContentOpacity = useRef(new Animated.Value(1)).current;
  const tipBackdropOpacity = useRef(new Animated.Value(0)).current;
  // Spotlight morph animated values (JS driver for layout props)
  const spotCx = useRef(new Animated.Value(0)).current;
  const spotCy = useRef(new Animated.Value(0)).current;
  const spotRAnim = useRef(new Animated.Value(0)).current;
  // Derived animated nodes for spotlight geometry
  const spotCxMinusR = useMemo(() => Animated.subtract(spotCx, spotRAnim), []);
  const spotCyMinusR = useMemo(() => Animated.subtract(spotCy, spotRAnim), []);
  const spotCxPlusR = useMemo(() => Animated.add(spotCx, spotRAnim), []);
  const spotCyPlusR = useMemo(() => Animated.add(spotCy, spotRAnim), []);
  const spotDiameter = useMemo(() => Animated.multiply(spotRAnim, 2), []);
  // Help button pulse ring
  const helpPulseScale = useRef(new Animated.Value(1)).current;
  const helpPulseOpacity = useRef(new Animated.Value(0)).current;

  const getTipRef = (target: string | undefined) =>
    target === 'pencil' ? pencilButtonRef
    : target === 'help' ? helpButtonRef
    : target === 'dayCards' ? dayCardsRef
    : null;

  const getSpotR = (target: string | undefined, w: number, h: number) => {
    if (target === 'dayCards') return 0; // No spotlight hole — fully dark overlay
    const pad = 10;
    return Math.max(w, h) / 2 + pad;
  };

  useEffect(() => {
    if (!showItineraryTips) {
      // Dismiss: shrink spotlight + fade everything, then unmount
      Animated.parallel([
        Animated.timing(tipBubbleOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.spring(tipBubbleScale, { toValue: 0.88, useNativeDriver: true, speed: 40, bounciness: 0 }),
        Animated.timing(spotRAnim, { toValue: 0, duration: 220, useNativeDriver: false }),
        Animated.timing(tipBackdropOpacity, { toValue: 0, duration: 220, useNativeDriver: false }),
      ]).start(() => setTipAnchor(null));
      return;
    }
    const tip = ITINERARY_TIPS[itineraryTipIndex];
    const ref = getTipRef(tip?.target);
    if (ref?.current) {
      setTimeout(() => {
        ref.current?.measureInWindow((x, y, w, h) => {
          const cx = x + w / 2, cy = y + h / 2;
          const r = getSpotR(tip?.target, w, h);
          // Position spotlight at target with hole closed (r=0 → fully dark)
          spotCx.setValue(cx);
          spotCy.setValue(cy);
          spotRAnim.setValue(0);
          tipBackdropOpacity.setValue(0);
          tipContentOpacity.setValue(1);
          tipBubbleScale.setValue(0.88);
          tipBubbleOpacity.setValue(0);
          setTipAnchor({ x, y, w, h });
          // Animate: overlay fades in, spotlight hole opens, bubble pops in
          Animated.parallel([
            Animated.timing(tipBackdropOpacity, { toValue: 1, duration: 260, useNativeDriver: false }),
            Animated.spring(spotRAnim, { toValue: r, useNativeDriver: false, speed: 18, bounciness: 4 }),
            Animated.spring(tipBubbleScale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 6 }),
            Animated.timing(tipBubbleOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
          ]).start();
        });
      }, 50);
    } else {
      setTipAnchor(null);
    }
  }, [showItineraryTips]);

  // Morph spotlight between tips: bubble fades out → spotlight morphs → bubble fades in at new position
  useEffect(() => {
    if (!showItineraryTips) return;
    // Fade bubble out first
    Animated.timing(tipBubbleOpacity, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      const tip = ITINERARY_TIPS[itineraryTipIndex];
      const ref = getTipRef(tip?.target);
      if (!ref?.current) return;
      ref.current.measureInWindow((x, y, w, h) => {
        const cx = x + w / 2, cy = y + h / 2;
        const r = getSpotR(tip?.target, w, h);
        setTipAnchor({ x, y, w, h });
        tipContentOpacity.setValue(1);
        // Morph spotlight to new position
        Animated.parallel([
          Animated.spring(spotCx, { toValue: cx, useNativeDriver: false, speed: 14, bounciness: 3 }),
          Animated.spring(spotCy, { toValue: cy, useNativeDriver: false, speed: 14, bounciness: 3 }),
          Animated.spring(spotRAnim, { toValue: r, useNativeDriver: false, speed: 14, bounciness: 3 }),
        ]).start();
        // Pop bubble back in at new position (slight delay for morph to start)
        setTimeout(() => {
          tipBubbleScale.setValue(0.92);
          Animated.parallel([
            Animated.timing(tipBubbleOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
            Animated.spring(tipBubbleScale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 5 }),
          ]).start();
        }, 80);
      });
    });
  }, [itineraryTipIndex]);

  // Help button pulse loop — runs while itinerary tab is active and tips haven't been seen
  useEffect(() => {
    if (activeTab !== 'itinerary' || itineraryTipsShownRef.current) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(helpPulseScale, { toValue: 2.2, duration: 900, useNativeDriver: true }),
          Animated.timing(helpPulseOpacity, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(helpPulseScale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(helpPulseOpacity, { toValue: 0.45, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    helpPulseOpacity.setValue(0.45);
    helpPulseScale.setValue(1);
    pulse.start();
    return () => pulse.stop();
  }, [activeTab]);

  const dayCardsRef = useRef<View>(null);

  const ITINERARY_TIPS: { text: string; target: 'dayCards' | 'pencil' | 'help' }[] = [
    { text: 'Tap any day to expand it and see your events.', target: 'dayCards' },
    { text: 'Tap the pencil button to enter edit mode — rename or delete days.', target: 'pencil' },
    { text: 'Tap the ? button anytime to replay these tips.', target: 'help' },
  ];

  useEffect(() => {
    if (activeTab === 'itinerary' && !itineraryTipsShownRef.current && tripId) {
      const key = `itinerary_tips_shown_${tripId}`;
      AsyncStorage.getItem(key).then((val) => {
        if (val !== 'true') {
          setShowItineraryTips(true);
          setItineraryTipIndex(0);
          AsyncStorage.setItem(key, 'true');
        }
      });
      itineraryTipsShownRef.current = true;
    }
  }, [activeTab, tripId]);

  const [dayModalVisible, setDayModalVisible] = useState(false);
  const [dayName, setDayName] = useState('');
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [dayDatePickerVisible, setDayDatePickerVisible] = useState(false);
  const [dayDateDraft, setDayDateDraft] = useState(new Date());

  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [eventName, setEventName] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventTimeDate, setEventTimeDate] = useState(new Date());
  const [eventLocation, setEventLocation] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  const [eventError, setEventError] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventTickets, setEventTickets] = useState<TicketAttachment[]>([]);
  const [ticketUploading, setTicketUploading] = useState(false);

  // Upload a file (PDF or image) to Supabase Storage and return a TicketAttachment
  const uploadTicket = async (uri: string, fileName: string, mimeType: string): Promise<TicketAttachment> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const ext = fileName.split('.').pop() ?? 'bin';
    const safeTripId = (tripId ?? 'unknown').replace(/[^a-zA-Z0-9\-_]/g, '_');
    const storagePath = `${session.user.id}/${safeTripId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

    const fileResponse = await fetch(uri);
    const arrayBuffer = await fileResponse.arrayBuffer();

    const { error } = await supabase.storage.from('Tickets').upload(storagePath, arrayBuffer, { contentType: mimeType });
    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage.from('Tickets').getPublicUrl(storagePath);
    return {
      id: `ticket-${Date.now()}`,
      name: fileName,
      url: publicUrl,
      type: mimeType === 'application/pdf' ? 'pdf' : 'image',
    };
  };

  const handleAttachTicket = () => {
    Alert.alert('Attach Ticket', 'Choose a source', [
      {
        text: 'Photo Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Required', 'Please allow photo library access in Settings.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.85,
            allowsMultipleSelection: false,
          });
          if (result.canceled || !result.assets[0]) return;
          const asset = result.assets[0];
          const fileName = asset.fileName ?? `photo-${Date.now()}.jpg`;
          const mimeType = asset.mimeType ?? 'image/jpeg';
          setTicketUploading(true);
          try {
            const ticket = await uploadTicket(asset.uri, fileName, mimeType);
            setEventTickets((prev) => [...prev, ticket]);
          } catch (e: any) {
            Alert.alert('Upload Failed', e.message || 'Could not upload image.');
          } finally {
            setTicketUploading(false);
          }
        },
      },
      {
        text: 'Document / PDF',
        onPress: async () => {
          const result = await DocumentPicker.getDocumentAsync({
            type: ['application/pdf', 'image/*'],
            copyToCacheDirectory: true,
          });
          if (result.canceled || !result.assets[0]) return;
          const asset = result.assets[0];
          const mimeType = asset.mimeType ?? 'application/pdf';
          setTicketUploading(true);
          try {
            const ticket = await uploadTicket(asset.uri, asset.name, mimeType);
            setEventTickets((prev) => [...prev, ticket]);
          } catch (e: any) {
            Alert.alert('Upload Failed', e.message || 'Could not upload file.');
          } finally {
            setTicketUploading(false);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const [flightModalVisible, setFlightModalVisible] = useState(false);
  const [editingFlightId, setEditingFlightId] = useState<string | null>(null);
  const [flightDepartureDate, setFlightDepartureDate] = useState('');
  const [flightDepartureTime, setFlightDepartureTime] = useState('');
  const [flightArrivalDate, setFlightArrivalDate] = useState('');
  const [flightArrivalTime, setFlightArrivalTime] = useState('');
  const [flightAirline, setFlightAirline] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [flightFrom, setFlightFrom] = useState('');
  const [flightFromCity, setFlightFromCity] = useState('');
  const [flightTo, setFlightTo] = useState('');
  const [flightToCity, setFlightToCity] = useState('');
  const [flightLookupAirlineQuery, setFlightLookupAirlineQuery] = useState('');
  const [flightLookupAirlineIata, setFlightLookupAirlineIata] = useState('');
  const [flightLookupFlightNumber, setFlightLookupFlightNumber] = useState('');
  const [flightLookupDate, setFlightLookupDate] = useState('');
  const [flightLookupLoading, setFlightLookupLoading] = useState(false);
  const [flightLookupStep, setFlightLookupStep] = useState<'lookup' | 'confirm'>('lookup');
  const [flightConfirmEditMode, setFlightConfirmEditMode] = useState(false);
  const [flightLookupDatePickerVisible, setFlightLookupDatePickerVisible] = useState(false);
  const [flightLookupDraftDate, setFlightLookupDraftDate] = useState<Date>(new Date());
  const [flightError, setFlightError] = useState<string | null>(null);
  const [flightDepDatePickerVisible, setFlightDepDatePickerVisible] = useState(false);
  const [flightDepDateDraft, setFlightDepDateDraft] = useState<Date>(new Date());
  const [flightDepTimePickerVisible, setFlightDepTimePickerVisible] = useState(false);
  const [flightDepTimeDraft, setFlightDepTimeDraft] = useState<Date>(new Date());
  const [flightArrDatePickerVisible, setFlightArrDatePickerVisible] = useState(false);
  const [flightArrDateDraft, setFlightArrDateDraft] = useState<Date>(new Date());
  const [flightArrTimePickerVisible, setFlightArrTimePickerVisible] = useState(false);
  const [flightArrTimeDraft, setFlightArrTimeDraft] = useState<Date>(new Date());
  const [flightDurationHours, setFlightDurationHours] = useState('');
  const [flightDurationMinutes, setFlightDurationMinutes] = useState('');

  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCurrency, setExpenseCurrency] = useState('USD');
  const [expenseName, setExpenseName] = useState('');
  const [expenseIsSplit, setExpenseIsSplit] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  const [journalModalVisible, setJournalModalVisible] = useState(false);
  const [journalDate, setJournalDate] = useState('');
  const [journalText, setJournalText] = useState('');
  const [journalError, setJournalError] = useState<string | null>(null);
  const [journalIsShared, setJournalIsShared] = useState(false);

  const PEXELS_API_KEY = process.env.EXPO_PUBLIC_PEXELS_API_KEY;
  const heroCacheTtlMs = 1000 * 60 * 60 * 24 * 7;
  const [heroDisplayedUrl, setHeroDisplayedUrl] = useState<string | null>(null);
  const [heroNextUrl, setHeroNextUrl] = useState<string | null>(null);
  const heroNextOpacity = useRef(new Animated.Value(0)).current;
  const heroDisplayedUrlRef = useRef<string | null>(null);
  const heroSwapInProgressRef = useRef(false);
  const heroFocusRunIdRef = useRef(0);
  const heroFetchInProgressRef = useRef(false);

  const shuffleUrls = (items: string[]) => {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  };

  const heroMaxHeight = Math.round(Dimensions.get('window').height / 3);
  const insets = useSafeAreaInsets();

  const scrollY = useRef(new Animated.Value(0)).current;
  const heroCardOpacity = scrollY.interpolate({
    inputRange: [0, heroMaxHeight * 0.5],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const stickyCardOpacity = scrollY.interpolate({
    inputRange: [heroMaxHeight * 0.4, heroMaxHeight * 0.75],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const wrapperBgOpacity = scrollY.interpolate({
    inputRange: [0, heroMaxHeight * 0.3],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const cardAreaHeight = scrollY.interpolate({
    inputRange: [heroMaxHeight * 0.2, heroMaxHeight * 0.65],
    outputRange: [0, insets.top + 62],
    extrapolate: 'clamp',
  });
  const [showStickyCard, setShowStickyCard] = useState(false);
  const stickyFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const threshold = heroMaxHeight * 0.35;
    const listenerId = scrollY.addListener(({ value }: { value: number }) => {
      setShowStickyCard((prev) => {
        if (value > threshold && !prev) return true;
        if (value <= threshold && prev) return false;
        return prev;
      });
    });
    return () => { scrollY.removeListener(listenerId); };
  }, [heroMaxHeight, scrollY]);

  useEffect(() => {
    Animated.timing(stickyFadeAnim, {
      toValue: showStickyCard ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [showStickyCard, stickyFadeAnim]);

  const [editingJournalEntryId, setEditingJournalEntryId] = useState<string | null>(null);

  const [overviewFlightsCollapsed, setOverviewFlightsCollapsed] = useState(false);
  const [overviewHousingCollapsed, setOverviewHousingCollapsed] = useState(false);
  const [overviewComingUpCollapsed, setOverviewComingUpCollapsed] = useState(false);

  // Members from shared context
  const tripPeople: TripPerson[] = sharedTrip
    ? sharedTrip.members
        .filter((m) => m.status === 'accepted')
        .map((m) => ({
          id: m.userId,
          name: m.displayName || m.phone || '?',
          avatarUri: m.avatarUri,
        }))
    : [{ id: uid ?? 'me', name: 'Me' }];

  const tripHousing: TripHousing[] = tripId ? housingByTripId[tripId] ?? [] : [];

  const [housingModalVisible, setHousingModalVisible] = useState(false);
  const [housingLocation, setHousingLocation] = useState('');
  const [housingStartDate, setHousingStartDate] = useState<string | null>(null);
  const [housingEndDate, setHousingEndDate] = useState<string | null>(null);
  const [housingCheckIn, setHousingCheckIn] = useState('');
  const [housingCheckOut, setHousingCheckOut] = useState('');
  const [housingError, setHousingError] = useState<string | null>(null);
  const [housingCalMonth, setHousingCalMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const [isInviting, setIsInviting] = useState(false);

  const ensureSharedTrip = async (): Promise<string> => {
    let sharedId = sharedTrip?.id;
    if (!sharedId) {
      sharedId = await migrateToShared(trip!, flights, itineraryDays, expenses, tripHousing, journalEntries);
    }
    return sharedId;
  };

  const handleShareLink = async () => {
    if (!tripId || !trip || isInviting) return;
    setIsInviting(true);
    try {
      const sharedId = await ensureSharedTrip();
      const token = await inviteToTrip(sharedId);
      const link = `shmoves://invite/${token}`;
      await Share.share({
        message: `Join my trip to ${trip.destination} on Shmoves! ${link}`,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not create invite link.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleInviteByUsername = () => {
    if (!tripId || !trip || isInviting) return;
    Alert.prompt(
      'Invite by Username',
      'Enter the username of the person you want to invite:',
      async (text) => {
        const cleaned = text?.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!cleaned) return;
        setIsInviting(true);
        try {
          const sharedId = await ensureSharedTrip();
          await inviteByUsername(sharedId, cleaned);
          Alert.alert('Invited!', `@${cleaned} has been invited to this trip.`);
        } catch (err: any) {
          Alert.alert('Error', err.message || 'Could not send invite.');
        } finally {
          setIsInviting(false);
        }
      },
      'plain-text',
      '',
      'default',
    );
  };

  const handleInvitePress = () => {
    if (!tripId || !trip) return;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Invite by Username', 'Share Invite Link', 'Cancel'],
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) handleInviteByUsername();
          else if (index === 1) handleShareLink();
        },
      );
    } else {
      Alert.alert('Invite', 'Choose an option', [
        { text: 'Invite by Username', onPress: handleInviteByUsername },
        { text: 'Share Invite Link', onPress: handleShareLink },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const openHousingModal = () => {
    setHousingLocation('');
    setHousingStartDate(null);
    setHousingEndDate(null);
    setHousingCheckIn('');
    setHousingCheckOut('');
    setHousingError(null);
    const tripStart = trip?.startDate ? new Date(trip.startDate) : new Date();
    setHousingCalMonth({ year: tripStart.getFullYear(), month: tripStart.getMonth() });
    setHousingModalVisible(true);
  };

  const handleHousingCalDayPress = (dateStr: string) => {
    if (!housingStartDate || housingEndDate) {
      setHousingStartDate(dateStr);
      setHousingEndDate(null);
    } else {
      if (dateStr < housingStartDate) {
        setHousingStartDate(dateStr);
        setHousingEndDate(housingStartDate);
      } else {
        setHousingEndDate(dateStr);
      }
    }
  };

  const buildCalendarDays = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(month + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      cells.push(`${year}-${mm}-${dd}`);
    }
    return cells;
  };

  const isDateInRange = (dateStr: string) => {
    if (!housingStartDate) return false;
    if (dateStr === housingStartDate) return true;
    if (!housingEndDate) return false;
    return dateStr >= housingStartDate && dateStr <= housingEndDate;
  };

  const formatHousingDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const toggleSection = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    setter((v) => !v);
  };

  const getInitials = (name: string) => {
    const cleaned = name.trim();
    if (!cleaned) return '?';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? '?';
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';
    return (first + last).toUpperCase();
  };

  const getDayIndex = (label: string) => {
    const m = label.match(/(\d+)/);
    return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
  };

  const parseEventTimeMinutes = (value: string) => {
    const t = value.trim();
    if (!t) return Number.POSITIVE_INFINITY;
    const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    const t24 = t.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    let hours = 0;
    let minutes = 0;
    if (ampm) {
      hours = Number(ampm[1]);
      minutes = Number(ampm[2]);
      const ap = ampm[3].toUpperCase();
      if (ap === 'PM' && hours < 12) hours += 12;
      if (ap === 'AM' && hours === 12) hours = 0;
    } else if (t24) {
      hours = Number(t24[1]);
      minutes = Number(t24[2]);
    } else {
      return Number.POSITIVE_INFINITY;
    }
    return hours * 60 + minutes;
  };

  const getNextItineraryEvent = () => {
    const events = itineraryDays
      .flatMap((day) =>
        (day.events ?? []).map((event) => ({
          dayLabel: day.label,
          dayIndex: getDayIndex(day.label),
          timeMinutes: parseEventTimeMinutes(event.time),
          event,
        }))
      )
      .sort((a, b) => {
        if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
        if (a.timeMinutes !== b.timeMinutes) return a.timeMinutes - b.timeMinutes;
        return a.event.name.localeCompare(b.event.name);
      });

    const first = events[0];
    return first ? { dayLabel: first.dayLabel, event: first.event } : undefined;
  };

  const fetchHeroImagesForDestination = async (destination: string) => {
    if (!PEXELS_API_KEY) return [] as string[];

    const query = `${destination} travel landscape landmarks`;
    const page = Math.floor(Math.random() * 3) + 1;
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&page=${page}&orientation=landscape`;

    const res = await fetch(url, {
      headers: {
        Authorization: PEXELS_API_KEY,
      },
    });

    if (!res.ok) return [] as string[];
    const json = (await res.json()) as any;
    const photos = Array.isArray(json?.photos) ? json.photos : [];

    return photos
      .map((p: any) => p?.src?.large2x ?? p?.src?.large ?? p?.src?.original)
      .filter((u: any): u is string => typeof u === 'string' && !!u.trim())
      .slice(0, 15);
  };

  useFocusEffect(
    useCallback(() => {
      let canceled = false;
      const runId = (heroFocusRunIdRef.current += 1);

      const run = async () => {
        const destination = trip?.destination?.trim();
        if (!destination) return;

        if (heroSwapInProgressRef.current) return;
        if (heroFetchInProgressRef.current) return;
        heroFetchInProgressRef.current = true;

        const cacheKey = `heroImages:${destination.toLowerCase()}`;
        const now = Date.now();
        let cached: CachedHeroImages | null = null;
        let urls: string[] = [];
        let nextIndex = 0;

        try {
          const raw = await AsyncStorage.getItem(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw) as CachedHeroImages;
            if (
              parsed &&
              typeof parsed.fetchedAt === 'number' &&
              Array.isArray(parsed.urls) &&
              now - parsed.fetchedAt < heroCacheTtlMs
            ) {
              cached = {
                fetchedAt: parsed.fetchedAt,
                urls: parsed.urls.filter((u) => typeof u === 'string' && !!u.trim()),
                lastIndex: typeof parsed.lastIndex === 'number' ? parsed.lastIndex : undefined,
              };
              urls = cached.urls;
            }
          }
        } catch {
          cached = null;
          urls = [];
        }

        if (urls.length > 0 && urls.length < 10) {
          try {
            const fetched = await fetchHeroImagesForDestination(destination);
            const merged = Array.from(new Set([...urls, ...fetched].filter((u) => typeof u === 'string' && !!u.trim())));
            const selected = merged.length > 10 ? shuffleUrls(merged).slice(0, 10) : shuffleUrls(merged);
            urls = selected;
            cached = { fetchedAt: cached?.fetchedAt ?? now, urls, lastIndex: cached?.lastIndex };
            await AsyncStorage.setItem(
              cacheKey,
              JSON.stringify({ fetchedAt: cached.fetchedAt, urls, lastIndex: cached.lastIndex } satisfies CachedHeroImages),
            );
          } catch {
            // ignore
          }
        }

        if (urls.length > 10) {
          urls = shuffleUrls(urls).slice(0, 10);
          cached = { fetchedAt: cached?.fetchedAt ?? now, urls, lastIndex: cached?.lastIndex };
          try {
            await AsyncStorage.setItem(
              cacheKey,
              JSON.stringify({ fetchedAt: cached.fetchedAt, urls, lastIndex: cached.lastIndex } satisfies CachedHeroImages),
            );
          } catch {
            // ignore
          }
        }

        if (urls.length > 0) {
          let nextUrls = urls;
          let lastIndex = cached?.lastIndex;
          if (typeof lastIndex === 'number' && lastIndex >= nextUrls.length - 1) {
            nextUrls = shuffleUrls(nextUrls);
            lastIndex = -1;
          }

          nextIndex = typeof lastIndex === 'number' ? (lastIndex + 1) % nextUrls.length : 0;

          let nextUrl = nextUrls[nextIndex];
          const currentDisplayed = heroDisplayedUrlRef.current;
          if (nextUrl && currentDisplayed && nextUrls.length > 1 && nextUrl === currentDisplayed) {
            const altIndex = (nextIndex + 1) % nextUrls.length;
            nextIndex = altIndex;
            nextUrl = nextUrls[nextIndex];
          }
          if (!nextUrl) return;

          try {
            await ExpoImage.prefetch(nextUrl);
          } catch {
            return;
          }

          if (canceled || heroFocusRunIdRef.current !== runId) return;
          if (!heroDisplayedUrlRef.current) {
            heroDisplayedUrlRef.current = nextUrl;
            heroSwapInProgressRef.current = false;
            setHeroDisplayedUrl(nextUrl);
          } else {
            heroNextOpacity.setValue(0);
            heroSwapInProgressRef.current = true;
            setHeroNextUrl(nextUrl);
          }

          try {
            await AsyncStorage.setItem(
              cacheKey,
              JSON.stringify({ fetchedAt: cached?.fetchedAt ?? now, urls: nextUrls, lastIndex: nextIndex } satisfies CachedHeroImages),
            );
          } catch {
            // ignore
          }

          return;
        }

        if (urls.length === 0) {
          try {
            const fetched = await fetchHeroImagesForDestination(destination);
            const selected = fetched.length > 10 ? shuffleUrls(fetched).slice(0, 10) : shuffleUrls(fetched);
            urls = selected;
            if (urls.length > 0) {
              const firstUrl = urls[0];
              if (firstUrl) {
                try {
                  await ExpoImage.prefetch(firstUrl);
                } catch {
                  // ignore
                }
              }

              if (!canceled && heroFocusRunIdRef.current === runId && firstUrl) {
                if (!heroDisplayedUrlRef.current) {
                  heroDisplayedUrlRef.current = firstUrl;
                  heroSwapInProgressRef.current = false;
                  setHeroDisplayedUrl(firstUrl);
                } else {
                  heroNextOpacity.setValue(0);
                  heroSwapInProgressRef.current = true;
                  setHeroNextUrl(firstUrl);
                }
              }

              await AsyncStorage.setItem(
                cacheKey,
                JSON.stringify({ fetchedAt: now, urls, lastIndex: 0 } satisfies CachedHeroImages),
              );
            }
          } catch {
            urls = [];
          }
        }
      };

      run().finally(() => {
        if (heroFocusRunIdRef.current === runId) heroFetchInProgressRef.current = false;
      });
      return () => {
        canceled = true;
        if (heroFocusRunIdRef.current === runId) heroFetchInProgressRef.current = false;
      };
    }, [heroCacheTtlMs, trip?.destination, PEXELS_API_KEY]),
  );

  const getTodayIsoDate = () => new Date().toISOString().slice(0, 10);

  const formatTime24 = (date: Date): string => {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  const formatTimeDisplay = (time24: string): string => {
    const parts = time24.split(':');
    const h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    if (isNaN(h)) return time24;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m} ${period}`;
  };

  const parseTime24ToDate = (time24: string): Date => {
    const d = new Date();
    const parts = time24.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!isNaN(h)) d.setHours(h);
    if (!isNaN(m)) d.setMinutes(m);
    d.setSeconds(0);
    d.setMilliseconds(0);
    return d;
  };

  const formatDayDate = (iso?: string): string => {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const formatParamDate = (value?: string) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString();
  };

  const formatTripDateRange = (start?: string, end?: string): string => {
    if (!start || !end) return '';
    const s = new Date(start);
    const e = new Date(end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
    const sameYear = s.getFullYear() === e.getFullYear();
    const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
    const optsWithYear: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
    if (sameYear) {
      return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
    }
    return `${s.toLocaleDateString(undefined, optsWithYear)} – ${e.toLocaleDateString(undefined, optsWithYear)}`;
  };

  function parseFlightDateTime(date: string, time: string) {
    const dateObj = parseTripDate(date);
    if (!dateObj) return undefined;
    const value = time.trim();
    const ampm = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    const t24 = value.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);

    let hours = 0;
    let minutes = 0;
    if (ampm) {
      hours = Number(ampm[1]);
      minutes = Number(ampm[2]);
      const ap = ampm[3].toUpperCase();
      if (ap === 'PM' && hours < 12) hours += 12;
      if (ap === 'AM' && hours === 12) hours = 0;
    } else if (t24) {
      hours = Number(t24[1]);
      minutes = Number(t24[2]);
    } else {
      return undefined;
    }

    const dt = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), hours, minutes, 0, 0);
    if (Number.isNaN(dt.getTime())) return undefined;
    return dt;
  }

  const parseTripDay = (value?: string) => {
    const dt = parseTripDate(value);
    if (!dt) return undefined;
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  };

  const inferFlightSegment = (flight: { departureDate: string }) => {
    const start = parseTripDay(trip?.startDate);
    const end = parseTripDay(trip?.endDate);
    const dep = parseTripDay(flight.departureDate);
    if (!start || !end || !dep) return 'mid' as const;

    if (dep.getTime() <= start.getTime()) return 'going' as const;
    if (dep.getTime() >= end.getTime()) return 'return' as const;
    return 'mid' as const;
  };

  const getEffectiveFlightSegment = (flight: { segment?: 'auto' | 'going' | 'mid' | 'return'; departureDate: string }) => {
    if (flight.segment && flight.segment !== 'auto') return flight.segment;
    return inferFlightSegment({ departureDate: flight.departureDate });
  };

  const sortFlightsForDisplay = <T extends { departureDate: string; departureTime: string }>(items: T[]) => {
    const now = new Date();
    const upcoming = items
      .filter((f) => {
        const dt = parseFlightDateTime(f.departureDate, f.departureTime);
        return dt ? dt.getTime() >= now.getTime() : false;
      })
      .slice()
      .sort((a, b) => {
        const adt = parseFlightDateTime(a.departureDate, a.departureTime)?.getTime() ?? Number.POSITIVE_INFINITY;
        const bdt = parseFlightDateTime(b.departureDate, b.departureTime)?.getTime() ?? Number.POSITIVE_INFINITY;
        return adt - bdt;
      });

    const past = items
      .filter((f) => {
        const dt = parseFlightDateTime(f.departureDate, f.departureTime);
        return dt ? dt.getTime() < now.getTime() : true;
      })
      .slice()
      .sort((a, b) => {
        const adt = parseFlightDateTime(a.departureDate, a.departureTime)?.getTime() ?? Number.NEGATIVE_INFINITY;
        const bdt = parseFlightDateTime(b.departureDate, b.departureTime)?.getTime() ?? Number.NEGATIVE_INFINITY;
        return bdt - adt;
      });

    return [...upcoming, ...past];
  };

  const formatTime12h = (time?: string) => {
    if (!time) return '';
    const value = time.trim();
    const ampm = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampm) return `${Number(ampm[1])}:${ampm[2]} ${ampm[3].toUpperCase()}`;
    const t24 = value.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!t24) return value;
    let h = Number(t24[1]);
    const m = t24[2];
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ap}`;
  };

  const formatFlightDayLine = (flight: {
    departureDate: string;
    departureTime: string;
    arrivalTime?: string;
  }) => {
    const dt = parseTripDate(flight.departureDate);
    if (!dt) return '';
    const dow = dt.toLocaleDateString(undefined, { weekday: 'short' });
    const mon = dt.toLocaleDateString(undefined, { month: 'short' });
    const day = dt.getDate();
    const dep = formatTime12h(flight.departureTime);
    const arr = flight.arrivalTime ? formatTime12h(flight.arrivalTime) : '';
    return arr ? `${dow}, ${mon} ${day} ${dep} — ${arr}` : `${dow}, ${mon} ${day} ${dep}`;
  };

  const openExpenseModal = (expense?: { id: string; name: string; amount: number; currency: string; isSplit: boolean }) => {
    if (expense) {
      setEditingExpenseId(expense.id);
      setExpenseAmount(String(expense.amount));
      setExpenseCurrency(expense.currency);
      setExpenseName(expense.name);
      setExpenseIsSplit(expense.isSplit);
    } else {
      setEditingExpenseId(null);
      setExpenseAmount('');
      setExpenseCurrency('USD');
      setExpenseName('');
      setExpenseIsSplit(false);
    }
    setExpenseError(null);
    setExpenseModalVisible(true);
  };

  const openJournalModal = (entry?: { id: string; date: string; text: string; isShared?: boolean }) => {
    if (entry) {
      setEditingJournalEntryId(entry.id);
      setJournalDate(entry.date);
      setJournalText(entry.text);
      setJournalIsShared(entry.isShared ?? false);
    } else {
      setEditingJournalEntryId(null);
      setJournalDate(getTodayIsoDate());
      setJournalText('');
      setJournalIsShared(false);
    }
    setJournalError(null);
    setJournalModalVisible(true);
  };

  const openFlightModal = (existing?: {
    id: string;
    segment?: 'auto' | 'going' | 'mid' | 'return';
    departureDate: string;
    departureTime: string;
    arrivalDate?: string;
    arrivalTime?: string;
    airline?: string;
    flightNumber?: string;
    from?: string;
    fromCity?: string;
    to?: string;
    toCity?: string;
  }) => {
    setEditingFlightId(existing?.id ?? null);
    setFlightDepartureDate(existing?.departureDate ?? '');
    setFlightDepartureTime(existing?.departureTime ?? '');
    setFlightArrivalDate(existing?.arrivalDate ?? '');
    setFlightArrivalTime(existing?.arrivalTime ?? '');
    setFlightAirline(existing?.airline ?? '');
    setFlightNumber(existing?.flightNumber ?? '');
    setFlightFrom(existing?.from ?? '');
    setFlightFromCity(existing?.fromCity ?? '');
    setFlightTo(existing?.to ?? '');
    setFlightToCity(existing?.toCity ?? '');

    setFlightLookupAirlineQuery(existing?.airline ?? '');
    setFlightLookupAirlineIata('');
    setFlightLookupFlightNumber(existing?.flightNumber ? existing.flightNumber.replace(/[^0-9]/g, '') : '');
    setFlightLookupDate(existing?.departureDate ?? '');
    setFlightLookupLoading(false);
    setFlightLookupStep(existing ? 'confirm' : 'lookup');
    setFlightConfirmEditMode(false);
    const initialLookupDate = parseTripDate(existing?.departureDate);
    setFlightLookupDraftDate(initialLookupDate ?? new Date());
    setFlightLookupDatePickerVisible(false);
    setFlightError(null);
    setFlightDurationHours('');
    setFlightDurationMinutes('');
    setFlightModalVisible(true);
  };

  const RAPIDAPI_KEY = process.env.EXPO_PUBLIC_RAPIDAPI_KEY;

  const formatDateLabel = (isoDate?: string) => {
    if (!isoDate) return '';
    const dt = parseTripDate(isoDate);
    if (!dt) return '';
    return dt.toLocaleDateString();
  };

  const toLocalIsoDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // AviationStack uses YYYY-MM-DD format natively — no transformation needed.

  const airportCityMap: Record<string, string> = {
    JFK: 'New York', LGA: 'New York', EWR: 'Newark', LAX: 'Los Angeles', ORD: 'Chicago',
    ATL: 'Atlanta', DFW: 'Dallas', DEN: 'Denver', SFO: 'San Francisco', SEA: 'Seattle',
    MIA: 'Miami', BOS: 'Boston', LAS: 'Las Vegas', PHX: 'Phoenix', IAH: 'Houston',
    MCO: 'Orlando', MSP: 'Minneapolis', DTW: 'Detroit', PHL: 'Philadelphia', CLT: 'Charlotte',
    LHR: 'London', LGW: 'London', STN: 'London', CDG: 'Paris', ORY: 'Paris',
    AMS: 'Amsterdam', FRA: 'Frankfurt', MUC: 'Munich', MAD: 'Madrid', BCN: 'Barcelona',
    FCO: 'Rome', MXP: 'Milan', LIN: 'Milan', LIS: 'Lisbon', OPO: 'Porto',
    DUB: 'Dublin', MAN: 'Manchester', BHX: 'Birmingham', EDI: 'Edinburgh', GLA: 'Glasgow',
    BRU: 'Brussels', ZRH: 'Zurich', VIE: 'Vienna', CPH: 'Copenhagen', ARN: 'Stockholm',
    OSL: 'Oslo', HEL: 'Helsinki', ATH: 'Athens', IST: 'Istanbul', SVO: 'Moscow',
    DXB: 'Dubai', AUH: 'Abu Dhabi', DOH: 'Doha', KWI: 'Kuwait City', BAH: 'Bahrain',
    BOM: 'Mumbai', DEL: 'Delhi', BLR: 'Bangalore', MAA: 'Chennai', HYD: 'Hyderabad',
    SIN: 'Singapore', KUL: 'Kuala Lumpur', BKK: 'Bangkok', CGK: 'Jakarta', MNL: 'Manila',
    HKG: 'Hong Kong', PVG: 'Shanghai', PEK: 'Beijing', ICN: 'Seoul', NRT: 'Tokyo',
    HND: 'Tokyo', KIX: 'Osaka', SYD: 'Sydney', MEL: 'Melbourne', BNE: 'Brisbane',
    AKL: 'Auckland', YYZ: 'Toronto', YVR: 'Vancouver', YUL: 'Montreal', YYC: 'Calgary',
    MEX: 'Mexico City', GRU: 'São Paulo', GIG: 'Rio de Janeiro', EZE: 'Buenos Aires',
    BOG: 'Bogotá', SCL: 'Santiago', LIM: 'Lima', JNB: 'Johannesburg', CPT: 'Cape Town',
    NBO: 'Nairobi', CAI: 'Cairo', CMN: 'Casablanca', ADD: 'Addis Ababa', LOS: 'Lagos',
  };

  // IANA timezone for each airport — used to compute correct local arrival time
  const airportTzMap: Record<string, string> = {
    JFK: 'America/New_York', LGA: 'America/New_York', EWR: 'America/New_York',
    LAX: 'America/Los_Angeles', ORD: 'America/Chicago', ATL: 'America/New_York',
    DFW: 'America/Chicago', DEN: 'America/Denver', SFO: 'America/Los_Angeles',
    SEA: 'America/Los_Angeles', MIA: 'America/New_York', BOS: 'America/New_York',
    LAS: 'America/Los_Angeles', PHX: 'America/Phoenix', IAH: 'America/Chicago',
    MCO: 'America/New_York', MSP: 'America/Chicago', DTW: 'America/Detroit',
    PHL: 'America/New_York', CLT: 'America/New_York',
    LHR: 'Europe/London', LGW: 'Europe/London', STN: 'Europe/London',
    CDG: 'Europe/Paris', ORY: 'Europe/Paris', AMS: 'Europe/Amsterdam',
    FRA: 'Europe/Berlin', MUC: 'Europe/Berlin', MAD: 'Europe/Madrid',
    BCN: 'Europe/Madrid', FCO: 'Europe/Rome', MXP: 'Europe/Rome', LIN: 'Europe/Rome',
    LIS: 'Europe/Lisbon', OPO: 'Europe/Lisbon', DUB: 'Europe/Dublin',
    MAN: 'Europe/London', BHX: 'Europe/London', EDI: 'Europe/London', GLA: 'Europe/London',
    BRU: 'Europe/Brussels', ZRH: 'Europe/Zurich', VIE: 'Europe/Vienna',
    CPH: 'Europe/Copenhagen', ARN: 'Europe/Stockholm', OSL: 'Europe/Oslo',
    HEL: 'Europe/Helsinki', ATH: 'Europe/Athens', IST: 'Europe/Istanbul',
    SVO: 'Europe/Moscow', LED: 'Europe/Moscow',
    DXB: 'Asia/Dubai', AUH: 'Asia/Dubai', DOH: 'Asia/Qatar',
    KWI: 'Asia/Kuwait', BAH: 'Asia/Bahrain', RUH: 'Asia/Riyadh',
    BOM: 'Asia/Kolkata', DEL: 'Asia/Kolkata', BLR: 'Asia/Kolkata',
    MAA: 'Asia/Kolkata', HYD: 'Asia/Kolkata', CCU: 'Asia/Kolkata',
    SIN: 'Asia/Singapore', KUL: 'Asia/Kuala_Lumpur', BKK: 'Asia/Bangkok',
    CGK: 'Asia/Jakarta', MNL: 'Asia/Manila', HKG: 'Asia/Hong_Kong',
    PVG: 'Asia/Shanghai', PEK: 'Asia/Shanghai', ICN: 'Asia/Seoul',
    NRT: 'Asia/Tokyo', HND: 'Asia/Tokyo', KIX: 'Asia/Tokyo',
    SYD: 'Australia/Sydney', MEL: 'Australia/Melbourne', BNE: 'Australia/Brisbane',
    PER: 'Australia/Perth', ADL: 'Australia/Adelaide',
    AKL: 'Pacific/Auckland', CHC: 'Pacific/Auckland',
    YYZ: 'America/Toronto', YVR: 'America/Vancouver', YUL: 'America/Toronto',
    YYC: 'America/Edmonton', YEG: 'America/Edmonton',
    MEX: 'America/Mexico_City', GRU: 'America/Sao_Paulo', GIG: 'America/Sao_Paulo',
    EZE: 'America/Argentina/Buenos_Aires', BOG: 'America/Bogota',
    SCL: 'America/Santiago', LIM: 'America/Lima',
    JNB: 'Africa/Johannesburg', CPT: 'Africa/Johannesburg',
    NBO: 'Africa/Nairobi', CAI: 'Africa/Cairo', CMN: 'Africa/Casablanca',
    ADD: 'Africa/Addis_Ababa', LOS: 'Africa/Lagos',
  };

  const formatLongDate = (iso: string): string => {
    const d = parseTripDate(iso);
    if (!d) return iso;
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const hhmmFromDate = (d: Date): string =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  // Convert a naive local datetime (YYYY-MM-DD + HH:MM) in a given IANA timezone to a UTC Date.
  const zonedToUTC = (dateStr: string, timeStr: string, iana: string): Date => {
    const naive = new Date(`${dateStr}T${timeStr}:00Z`);
    const localAtNaive = new Date(
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: iana,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).format(naive).replace(' ', 'T') + 'Z'
    );
    return new Date(naive.getTime() + (naive.getTime() - localAtNaive.getTime()));
  };

  // Convert a UTC Date to local date/time strings in the given IANA timezone.
  const utcToZoned = (utc: Date, iana: string): { date: string; time: string } => {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: iana,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(utc).split(' ');
    return { date: parts[0], time: parts[1] };
  };

  const computeArrival = (depDate: string, depTime: string, dH: string, dM: string, fromCode?: string, toCode?: string) => {
    if (!depDate || !depTime) return;
    const [h, m] = depTime.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return;
    const totalMins = (parseInt(dH || '0') * 60) + parseInt(dM || '0');
    if (totalMins <= 0) return;
    const hhmm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    const depTz = airportTzMap[(fromCode ?? flightFrom).toUpperCase()];
    const arrTz = airportTzMap[(toCode ?? flightTo).toUpperCase()];

    let arrUTC: Date;
    if (depTz) {
      arrUTC = new Date(zonedToUTC(depDate, hhmm, depTz).getTime() + totalMins * 60_000);
    } else {
      const d = parseTripDate(depDate)!;
      d.setHours(h, m, 0, 0);
      arrUTC = new Date(d.getTime() + totalMins * 60_000);
    }

    if (arrTz) {
      const { date, time } = utcToZoned(arrUTC, arrTz);
      setFlightArrivalDate(date);
      setFlightArrivalTime(time);
    } else {
      setFlightArrivalDate(toLocalIsoDate(arrUTC));
      setFlightArrivalTime(hhmmFromDate(arrUTC));
    }
  };

  const dateFromHhmm = (hhmm: string): Date => {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date();
    d.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
    return d;
  };

  const airlineOptions = [
    { name: 'American Airlines', iata: 'AA' },
    { name: 'Delta Air Lines', iata: 'DL' },
    { name: 'United Airlines', iata: 'UA' },
    { name: 'Southwest Airlines', iata: 'WN' },
    { name: 'JetBlue', iata: 'B6' },
    { name: 'Alaska Airlines', iata: 'AS' },
    { name: 'Air Canada', iata: 'AC' },
    { name: 'British Airways', iata: 'BA' },
    { name: 'Virgin Atlantic', iata: 'VS' },
    { name: 'Lufthansa', iata: 'LH' },
    { name: 'Air France', iata: 'AF' },
    { name: 'KLM', iata: 'KL' },
    { name: 'Emirates', iata: 'EK' },
    { name: 'Qatar Airways', iata: 'QR' },
    { name: 'Turkish Airlines', iata: 'TK' },
    { name: 'Singapore Airlines', iata: 'SQ' },
    { name: 'Cathay Pacific', iata: 'CX' },
    { name: 'ANA', iata: 'NH' },
    { name: 'Japan Airlines', iata: 'JL' },
    { name: 'Ryanair', iata: 'FR' },
    { name: 'easyJet', iata: 'U2' },
    { name: 'Wizz Air', iata: 'W6' },
    { name: 'Norwegian', iata: 'DY' },
    { name: 'Vueling', iata: 'VY' },
    { name: 'Iberia', iata: 'IB' },
    { name: 'Finnair', iata: 'AY' },
    { name: 'Swiss', iata: 'LX' },
    { name: 'Austrian Airlines', iata: 'OS' },
    { name: 'TAP Air Portugal', iata: 'TP' },
    { name: 'Aer Lingus', iata: 'EI' },
    { name: 'Eurowings', iata: 'EW' },
    { name: 'Spirit Airlines', iata: 'NK' },
    { name: 'Frontier Airlines', iata: 'F9' },
    { name: 'Air New Zealand', iata: 'NZ' },
    { name: 'Qantas', iata: 'QF' },
    { name: 'Avianca', iata: 'AV' },
    { name: 'LATAM', iata: 'LA' },
    { name: 'IndiGo', iata: '6E' },
    { name: 'Air India', iata: 'AI' },
    { name: 'Ethiopian Airlines', iata: 'ET' },
    { name: 'Kenya Airways', iata: 'KQ' },
  ];

  const lookupFlightDetails = async () => {
    if (!RAPIDAPI_KEY) {
      setFlightError('Missing RapidAPI key. Set EXPO_PUBLIC_RAPIDAPI_KEY and try again.');
      return;
    }

    const date = flightLookupDate.trim();
    const airlineIataFromQuery = flightLookupAirlineQuery.toUpperCase().match(/\b[A-Z0-9]{2,3}\b/)?.[0] ?? '';
    const airlineIata = (flightLookupAirlineIata || airlineIataFromQuery).toUpperCase();
    const flightNumOnly = flightLookupFlightNumber.replace(/[^0-9]/g, '');

    if (!airlineIata || !flightNumOnly || !date) {
      setFlightError('Please enter an airline, flight number, and date.');
      return;
    }

    setFlightLookupLoading(true);
    setFlightError(null);

    try {
      const flightIata = `${airlineIata}${flightNumOnly}`;
      const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightIata)}/${encodeURIComponent(date)}`;

      const res = await fetch(url, {
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
        },
      });
      const json = (await res.json()) as any;

      if (!res.ok) {
        const message = typeof json?.message === 'string' ? json.message : undefined;
        setFlightError(`Flight lookup error: ${message ?? 'Request failed.'}`);
        return;
      }

      const flights = Array.isArray(json) ? json : [];
      if (flights.length === 0) {
        setFlightError('No matching flight found. Double-check the airline, flight number, and date.');
        return;
      }

      const flight = flights[0];
      const departure = flight?.departure;
      const arrival = flight?.arrival;
      const airlineName: string | undefined = flight?.airline?.name;

      // AeroDataBox returns local time in “YYYY-MM-DD HH:mm+offset” format
      const parseAeroTime = (raw: string | undefined): { date: string; time: string } | undefined => {
        if (!raw) return undefined;
        const m = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
        if (!m) return undefined;
        return { date: m[1], time: m[2] };
      };

      const depLocal = departure?.scheduledTime?.local ?? departure?.revisedTime?.local;
      const arrLocal = arrival?.scheduledTime?.local ?? arrival?.revisedTime?.local;
      const dep = parseAeroTime(depLocal);
      const arr = parseAeroTime(arrLocal);

      if (dep) { setFlightDepartureDate(dep.date); setFlightDepartureTime(dep.time); }
      if (arr) { setFlightArrivalDate(arr.date); setFlightArrivalTime(arr.time); }

      setFlightAirline(airlineName ?? (flightLookupAirlineQuery.trim() ? flightLookupAirlineQuery.trim() : airlineIata));
      setFlightNumber(flightIata);

      const fromCode: string | undefined = departure?.airport?.iata;
      const toCode: string | undefined = arrival?.airport?.iata;
      if (fromCode?.trim()) setFlightFrom(fromCode.trim());
      if (toCode?.trim()) setFlightTo(toCode.trim());

      const fromCity: string | undefined = departure?.airport?.municipalityName ?? departure?.airport?.name;
      const toCity: string | undefined = arrival?.airport?.municipalityName ?? arrival?.airport?.name;
      if (fromCity?.trim()) setFlightFromCity(fromCity.trim());
      if (toCity?.trim()) setFlightToCity(toCity.trim());

      setFlightLookupStep('confirm');
    } catch (_e) {
      setFlightError('Flight lookup failed. Please try again.');
    } finally {
      setFlightLookupLoading(false);
    }
  };

  const parseTripDate = (value?: string) => {
    if (!value) return undefined;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const y = Number(match[1]);
      const m = Number(match[2]);
      const d = Number(match[3]);
      const date = new Date(y, m - 1, d);
      if (!Number.isNaN(date.getTime())) return date;
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
    return undefined;
  };

  const getDaysUntilTrip = (start?: string) => {
    const startDateObj = parseTripDate(start);
    if (!startDateObj) return 0;

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfTrip = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
    const diffMs = startOfTrip.getTime() - startOfToday.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'itinerary' as const, label: 'Itinerary' },
    { key: 'finances' as const, label: 'Finances' },
    { key: 'photos' as const, label: 'Photos' },
    { key: 'feed' as const, label: 'Feed' },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        const sortedFlights = sortFlightsForDisplay(flights);
        const grouped = sortedFlights.reduce(
          (acc, f) => {
            const seg = getEffectiveFlightSegment(f);
            acc[seg].push(f);
            return acc;
          },
          { going: [] as typeof sortedFlights, mid: [] as typeof sortedFlights, return: [] as typeof sortedFlights }
        );

        const countdownBase = sortedFlights[0]?.departureDate ?? trip?.startDate;
        const daysUntilTrip = getDaysUntilTrip(countdownBase);
        const nextEvent = getNextItineraryEvent();
        const now = new Date();
        const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const upcomingHousing = tripHousing
          .filter((h) => h.endDate >= todayIso)
          .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

        let nextMajorTransport: (typeof sortedFlights)[number] | undefined;
        for (const f of sortedFlights) {
          const dt = parseFlightDateTime(f.departureDate, f.departureTime);
          if (dt && dt.getTime() >= Date.now()) {
            nextMajorTransport = f;
            break;
          }
        }
        if (!nextMajorTransport) nextMajorTransport = sortedFlights[0];
        return (
          <ThemedView style={styles.tabContent}>
            <ThemedText style={styles.sectionTitle}>Trip Overview</ThemedText>
            <ThemedText style={styles.countdownText}>
              {daysUntilTrip === 1 ? 'You fly out tomorrow!' : `There are ${daysUntilTrip} days until the trip!`}
            </ThemedText>

            <ThemedView style={[styles.flightCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Pressable style={styles.flightHeaderRow} onPress={() => toggleSection(setOverviewFlightsCollapsed)}>
                <View style={styles.sectionHeaderLeft}>
                  <IconSymbol
                    name="chevron.right"
                    size={18}
                    color={colors.primary}
                    style={[styles.sectionChevron, !overviewFlightsCollapsed ? styles.sectionChevronExpanded : null]}
                  />
                  <ThemedText style={styles.flightTitle}>Flights</ThemedText>
                </View>
                <View
                  style={[
                    styles.sectionHeaderActionSlot,
                    overviewFlightsCollapsed ? styles.sectionHeaderActionHidden : null,
                  ]}
                  pointerEvents={overviewFlightsCollapsed ? 'none' : 'auto'}>
                  <Pressable
                    style={styles.flightAddIconButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      openFlightModal();
                    }}>
                    <IconSymbol name="plus" size={18} color={colors.primary} />
                  </Pressable>
                </View>
              </Pressable>

              {overviewFlightsCollapsed ? null : sortedFlights.length > 0 ? (
                <View style={styles.flightsList}>
                  {([
                    { key: 'going' as const, label: 'Going there' },
                    { key: 'mid' as const, label: 'Mid trip' },
                    { key: 'return' as const, label: 'Return back' },
                  ] as const)
                    .filter((section) => grouped[section.key].length > 0)
                    .map((section) => (
                      <View key={section.key} style={styles.flightSectionBlock}>
                        <ThemedText style={styles.flightSectionTitle}>{section.label}</ThemedText>
                        <View style={styles.flightSectionList}>
                          {grouped[section.key].map((f) => (
                            <View
                              key={f.id}
                              style={[styles.flightItem, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                              <View style={styles.flightRouteRow}>
                                <View style={styles.flightAirportBlock}>
                                  <ThemedText style={styles.flightAirportCode}>{f.from ?? '—'}</ThemedText>
                                  <ThemedText style={styles.flightAirportCity}>{f.fromCity ?? ''}</ThemedText>
                                </View>

                                <ThemedText style={[styles.flightArrow, { color: colors.primary }]}>→</ThemedText>

                                <View style={[styles.flightAirportBlock, styles.flightAirportBlockRight]}>
                                  <ThemedText style={styles.flightAirportCode}>{f.to ?? '—'}</ThemedText>
                                  <ThemedText style={styles.flightAirportCity}>{f.toCity ?? ''}</ThemedText>
                                </View>
                              </View>

                              <ThemedText style={styles.flightTimeLine}>
                                {formatFlightDayLine({
                                  departureDate: f.departureDate,
                                  departureTime: f.departureTime,
                                  arrivalTime: f.arrivalTime,
                                })}
                              </ThemedText>

                              {editMode ? (
                                <View style={styles.flightItemActions}>
                                  <Pressable
                                    style={styles.inlineActionButton}
                                    onPress={() => {
                                      openFlightModal(f);
                                    }}>
                                    <ThemedText style={[styles.inlineActionText, { color: colors.primary }]}>Edit</ThemedText>
                                  </Pressable>

                                  <Pressable
                                    style={styles.inlineActionButton}
                                    onPress={() => {
                                      if (!tripId) return;
                                      Alert.alert('Remove flight?', 'This cannot be undone.', [
                                        { text: 'Cancel', style: 'cancel' },
                                        { text: 'Remove', style: 'destructive', onPress: () => deleteFlight(tripId, f.id) },
                                      ]);
                                    }}>
                                    <ThemedText
                                      style={[
                                        styles.inlineActionText,
                                        styles.destructiveText,
                                        { color: colors.destructive },
                                      ]}>
                                      Remove
                                    </ThemedText>
                                  </Pressable>
                                </View>
                              ) : null}
                            </View>
                          ))}
                        </View>
                      </View>
                    ))}
                </View>
              ) : (
                <ThemedText style={styles.emptyText}>No flights added yet.</ThemedText>
              )}
            </ThemedView>

            <ThemedView style={[styles.housingCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Pressable style={styles.housingHeaderRow} onPress={() => toggleSection(setOverviewHousingCollapsed)}>
                <View style={styles.sectionHeaderLeft}>
                  <IconSymbol
                    name="chevron.right"
                    size={18}
                    color={colors.primary}
                    style={[styles.sectionChevron, !overviewHousingCollapsed ? styles.sectionChevronExpanded : null]}
                  />
                  <ThemedText style={styles.housingTitle}>Housing</ThemedText>
                </View>
                <View
                  style={[
                    styles.sectionHeaderActionSlot,
                    overviewHousingCollapsed ? styles.sectionHeaderActionHidden : null,
                  ]}
                  pointerEvents={overviewHousingCollapsed ? 'none' : 'auto'}>
                  <Pressable
                    style={styles.flightAddIconButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      openHousingModal();
                    }}>
                    <IconSymbol name="plus" size={18} color={colors.primary} />
                  </Pressable>
                </View>
              </Pressable>

              {overviewHousingCollapsed ? null : tripHousing.length > 0 ? (
                <View style={styles.housingList}>
                  {tripHousing.map((h) => (
                    <View
                      key={h.id}
                      style={[styles.housingItem, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                      <Pressable
                        onPress={() => {
                          const query = encodeURIComponent(h.location);
                          Alert.alert(
                            h.location,
                            'Open in maps',
                            [
                              {
                                text: 'Google Maps',
                                onPress: () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`),
                              },
                              {
                                text: 'Apple Maps',
                                onPress: () => Linking.openURL(`maps://?q=${query}`),
                              },
                              { text: 'Cancel', style: 'cancel' },
                            ],
                          );
                        }}
                        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                      >
                        <ThemedText style={styles.housingItemTitle}>{h.location}</ThemedText>
                      </Pressable>
                      <ThemedText style={styles.housingItemSubtitle}>
                        {formatHousingDate(h.startDate)} – {formatHousingDate(h.endDate)}
                      </ThemedText>
                      {h.checkInTime || h.checkOutTime ? (
                        <ThemedText style={styles.housingItemSubtitle}>
                          {h.checkInTime ? `Check-in: ${h.checkInTime}` : ''}
                          {h.checkInTime && h.checkOutTime ? '  •  ' : ''}
                          {h.checkOutTime ? `Check-out: ${h.checkOutTime}` : ''}
                        </ThemedText>
                      ) : null}
                      {editMode ? (
                        <Pressable
                          onPress={() => {
                            if (!tripId) return;
                            Alert.alert('Remove housing?', 'This cannot be undone.', [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Remove', style: 'destructive', onPress: () => deleteHousing(tripId, h.id) },
                            ]);
                          }}>
                          <ThemedText style={[styles.housingDeleteText, { color: colors.destructive }]}>Remove</ThemedText>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <ThemedText style={styles.emptyText}>No housing added yet.</ThemedText>
              )}

              <Modal visible={housingModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                  <View style={[styles.modalCard, styles.flightModalCard, { backgroundColor: colors.surface }]}>
                    <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                      <ThemedText style={styles.modalTitle}>Add Housing</ThemedText>

                      <TextInput
                        value={housingLocation}
                        onChangeText={setHousingLocation}
                        placeholder="Location (e.g. Hotel Sunrise, Airbnb downtown)"
                        placeholderTextColor="#888"
                        style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                      />

                      <ThemedText style={styles.housingCalLabel}>Select dates</ThemedText>

                      <View style={[styles.housingCalContainer, { borderColor: colors.border }]}>
                        <View style={styles.housingCalNav}>
                          <Pressable
                            onPress={() =>
                              setHousingCalMonth((prev) => {
                                const d = new Date(prev.year, prev.month - 1, 1);
                                return { year: d.getFullYear(), month: d.getMonth() };
                              })
                            }>
                            <ThemedText style={[styles.housingCalNavBtn, { color: colors.primary }]}>‹</ThemedText>
                          </Pressable>
                          <ThemedText style={styles.housingCalMonthLabel}>
                            {new Date(housingCalMonth.year, housingCalMonth.month).toLocaleDateString(undefined, {
                              month: 'long',
                              year: 'numeric',
                            })}
                          </ThemedText>
                          <Pressable
                            onPress={() =>
                              setHousingCalMonth((prev) => {
                                const d = new Date(prev.year, prev.month + 1, 1);
                                return { year: d.getFullYear(), month: d.getMonth() };
                              })
                            }>
                            <ThemedText style={[styles.housingCalNavBtn, { color: colors.primary }]}>›</ThemedText>
                          </Pressable>
                        </View>

                        <View style={styles.housingCalDowRow}>
                          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                            <ThemedText key={d} style={styles.housingCalDowCell}>
                              {d}
                            </ThemedText>
                          ))}
                        </View>

                        <View style={styles.housingCalGrid}>
                          {buildCalendarDays(housingCalMonth.year, housingCalMonth.month).map((cell, idx) => {
                            if (!cell) {
                              return <View key={`empty-${idx}`} style={styles.housingCalCell} />;
                            }
                            const dayNum = Number(cell.split('-')[2]);
                            const inRange = isDateInRange(cell);
                            const isStart = cell === housingStartDate;
                            const isEnd = cell === housingEndDate;
                            return (
                              <Pressable
                                key={cell}
                                style={[
                                  styles.housingCalCell,
                                  inRange ? { backgroundColor: colors.primary + '22' } : null,
                                  isStart || isEnd
                                    ? { backgroundColor: colors.primary, borderRadius: 8 }
                                    : null,
                                ]}
                                onPress={() => handleHousingCalDayPress(cell)}>
                                <ThemedText
                                  style={[
                                    styles.housingCalDayText,
                                    isStart || isEnd ? { color: '#fff', fontWeight: '800' } : null,
                                  ]}>
                                  {dayNum}
                                </ThemedText>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      {housingStartDate ? (
                        <ThemedText style={styles.housingDateSummary}>
                          {formatHousingDate(housingStartDate)}
                          {housingEndDate ? ` – ${formatHousingDate(housingEndDate)}` : ' (tap end date)'}
                        </ThemedText>
                      ) : null}

                      <ThemedText style={styles.housingCalLabel}>Optional times</ThemedText>

                      <View style={styles.housingTimeRow}>
                        <View style={styles.housingTimeField}>
                          <ThemedText style={styles.housingTimeLabel}>Check-in</ThemedText>
                          <TextInput
                            value={housingCheckIn}
                            onChangeText={setHousingCheckIn}
                            placeholder="e.g. 3:00 PM"
                            placeholderTextColor="#888"
                            style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                          />
                        </View>
                        <View style={styles.housingTimeField}>
                          <ThemedText style={styles.housingTimeLabel}>Check-out</ThemedText>
                          <TextInput
                            value={housingCheckOut}
                            onChangeText={setHousingCheckOut}
                            placeholder="e.g. 11:00 AM"
                            placeholderTextColor="#888"
                            style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                          />
                        </View>
                      </View>

                      {housingError ? <ThemedText style={styles.modalErrorText}>{housingError}</ThemedText> : null}

                      <View style={styles.modalActions}>
                        <Pressable
                          style={[styles.modalButton, { borderColor: colors.border }]}
                          onPress={() => {
                            setHousingModalVisible(false);
                            setHousingError(null);
                          }}>
                          <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
                        </Pressable>

                        <Pressable
                          style={[
                            styles.modalButton,
                            styles.modalPrimaryButton,
                            { backgroundColor: colors.primary, borderColor: colors.primary },
                          ]}
                          onPress={() => {
                            if (!tripId) return;
                            const loc = housingLocation.trim();
                            if (!loc) {
                              setHousingError('Please enter a location.');
                              return;
                            }
                            if (!housingStartDate || !housingEndDate) {
                              setHousingError('Please select a start and end date.');
                              return;
                            }
                            addHousing(tripId, {
                              location: loc,
                              startDate: housingStartDate,
                              endDate: housingEndDate,
                              checkInTime: housingCheckIn.trim() || undefined,
                              checkOutTime: housingCheckOut.trim() || undefined,
                            });
                            setHousingModalVisible(false);
                            setHousingError(null);
                          }}>
                          <ThemedText style={[styles.modalButtonText, styles.modalPrimaryButtonText]}>Save</ThemedText>
                        </Pressable>
                      </View>
                    </ScrollView>
                  </View>
                </View>
              </Modal>
            </ThemedView>

            <ThemedView style={[styles.comingUpCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Pressable style={styles.comingUpHeaderRow} onPress={() => toggleSection(setOverviewComingUpCollapsed)}>
                <View style={styles.sectionHeaderLeft}>
                  <IconSymbol
                    name="chevron.right"
                    size={18}
                    color={colors.primary}
                    style={[styles.sectionChevron, !overviewComingUpCollapsed ? styles.sectionChevronExpanded : null]}
                  />
                  <ThemedText style={styles.comingUpTitle}>Coming Up</ThemedText>
                </View>
                <View style={styles.sectionHeaderActionSlot} />
              </Pressable>

              {overviewComingUpCollapsed ? null : (
                <View style={styles.comingUpBody}>
                  <View style={styles.comingUpRow}>
                    <ThemedText style={styles.comingUpLabel}>Next event</ThemedText>
                    <ThemedText style={styles.comingUpValue}>
                      {nextEvent
                        ? `${nextEvent.event.name}${nextEvent.event.time ? ` • ${nextEvent.event.time}` : ''}`
                        : 'No itinerary events yet.'}
                    </ThemedText>
                    {nextEvent?.dayLabel || nextEvent?.event.location ? (
                      <ThemedText style={styles.comingUpSubvalue}>
                        {nextEvent?.dayLabel ?? ''}
                        {nextEvent?.dayLabel && nextEvent?.event.location ? ' • ' : ''}
                        {nextEvent?.event.location ?? ''}
                      </ThemedText>
                    ) : null}
                  </View>

                  <View style={styles.comingUpDivider} />

                  <View style={styles.comingUpRow}>
                    <ThemedText style={styles.comingUpLabel}>Next major transport</ThemedText>
                    <ThemedText style={styles.comingUpValue}>
                      {nextMajorTransport
                        ? `${nextMajorTransport.from ?? '—'} → ${nextMajorTransport.to ?? '—'} • ${formatFlightDayLine({
                            departureDate: nextMajorTransport.departureDate,
                            departureTime: nextMajorTransport.departureTime,
                            arrivalTime: nextMajorTransport.arrivalTime,
                          })}`
                        : 'No flights added yet.'}
                    </ThemedText>
                    {nextMajorTransport?.airline || nextMajorTransport?.flightNumber ? (
                      <ThemedText style={styles.comingUpSubvalue}>
                        {nextMajorTransport.airline ?? ''}
                        {nextMajorTransport.airline && nextMajorTransport.flightNumber ? ' • ' : ''}
                        {nextMajorTransport.flightNumber ?? ''}
                      </ThemedText>
                    ) : null}
                  </View>

                  <View style={styles.comingUpDivider} />

                  <View style={styles.comingUpRow}>
                    <ThemedText style={styles.comingUpLabel}>Next housing</ThemedText>
                    <ThemedText style={styles.comingUpValue}>
                      {upcomingHousing ? upcomingHousing.location : 'No housing added yet.'}
                    </ThemedText>
                    {upcomingHousing ? (
                      <ThemedText style={styles.comingUpSubvalue}>
                        {formatHousingDate(upcomingHousing.startDate)} – {formatHousingDate(upcomingHousing.endDate)}
                      </ThemedText>
                    ) : null}
                  </View>
                </View>
              )}
            </ThemedView>

            <Modal visible={flightModalVisible} transparent animationType="slide">
              <View style={styles.flightSheetOverlay}>
                <View style={[styles.flightBottomSheet, { backgroundColor: colors.surface }]}>
                  <View style={styles.sheetHandle} />
                  <ThemedText style={styles.modalTitle}>{editingFlightId ? 'Edit Flight' : 'Add Flight'}</ThemedText>

                    {flightLookupStep === 'lookup' ? (
                      <View style={{ flex: 1, gap: 14 }}>

                        {/* Step 1: Airline — always visible */}
                        <View style={{ zIndex: 10 }}>
                          <ThemedText style={styles.flightStepLabel}>Which airline?</ThemedText>
                          <TextInput
                            value={flightLookupAirlineQuery}
                            onChangeText={(value) => {
                              setFlightLookupAirlineQuery(value);
                              setFlightLookupAirlineIata('');
                            }}
                            placeholder="Search airline or IATA code (e.g. VS)"
                            placeholderTextColor="#888"
                            autoCapitalize="words"
                            style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                          />
                          {flightLookupAirlineQuery.trim().length > 0 && !flightLookupAirlineIata ? (
                            <View style={[styles.airlineResultsFloat, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                              <ScrollView keyboardShouldPersistTaps="handled">
                                {airlineOptions
                                  .filter(
                                    (a) =>
                                      a.name.toLowerCase().includes(flightLookupAirlineQuery.trim().toLowerCase()) ||
                                      a.iata.toLowerCase().includes(flightLookupAirlineQuery.trim().toLowerCase()),
                                  )
                                  .slice(0, 8)
                                  .map((a) => (
                                    <Pressable
                                      key={a.iata}
                                      style={styles.airlineResultItem}
                                      onPress={() => {
                                        setFlightLookupAirlineQuery(`${a.name} (${a.iata})`);
                                        setFlightLookupAirlineIata(a.iata);
                                      }}>
                                      <ThemedText style={styles.airlineResultText}>{`${a.name} (${a.iata})`}</ThemedText>
                                    </Pressable>
                                  ))}
                              </ScrollView>
                            </View>
                          ) : null}
                        </View>

                        {/* Step 2: Flight number — appears after airline selected */}
                        {flightLookupAirlineIata ? (
                          <View>
                            <ThemedText style={styles.flightStepLabel}>Flight number</ThemedText>
                            <TextInput
                              value={flightLookupFlightNumber}
                              onChangeText={setFlightLookupFlightNumber}
                              placeholder="e.g. 3 or 1234"
                              placeholderTextColor="#888"
                              keyboardType="number-pad"
                              style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                            />
                          </View>
                        ) : null}

                        {/* Step 3: Date — appears after flight number entered */}
                        {flightLookupAirlineIata && flightLookupFlightNumber.trim() ? (
                          <View>
                            <ThemedText style={styles.flightStepLabel}>Flight date</ThemedText>
                            <Pressable
                              onPress={() => {
                                const current = parseTripDate(flightLookupDate);
                                setFlightLookupDraftDate(current ?? new Date());
                                setFlightLookupDatePickerVisible(true);
                              }}
                              style={[styles.dateSelectButton, { borderColor: colors.border }]}>
                              <ThemedText style={[styles.dateSelectButtonText, { color: colors.inputText }]}>
                                {flightLookupDate ? formatDateLabel(flightLookupDate) : 'Select date'}
                              </ThemedText>
                            </Pressable>
                            <Modal
                              visible={flightLookupDatePickerVisible}
                              transparent
                              animationType="slide"
                              onRequestClose={() => setFlightLookupDatePickerVisible(false)}>
                              <View style={styles.datePickerBackdrop}>
                                <View style={[styles.datePickerCard, { backgroundColor: colors.surface }]}>
                                  <View style={styles.datePickerHeader}>
                                    <Pressable
                                      onPress={() => setFlightLookupDatePickerVisible(false)}
                                      style={styles.datePickerHeaderButton}>
                                      <ThemedText style={[styles.datePickerHeaderButtonText, { color: colors.primary }]}>
                                        Cancel
                                      </ThemedText>
                                    </Pressable>
                                    <ThemedText style={styles.datePickerTitle}>Flight day</ThemedText>
                                    <Pressable
                                      onPress={() => {
                                        setFlightLookupDate(toLocalIsoDate(flightLookupDraftDate));
                                        setFlightLookupDatePickerVisible(false);
                                      }}
                                      style={styles.datePickerHeaderButton}>
                                      <ThemedText style={[styles.datePickerHeaderButtonText, { color: colors.primary }]}>
                                        Done
                                      </ThemedText>
                                    </Pressable>
                                  </View>
                                  <DateTimePicker
                                    value={flightLookupDraftDate}
                                    mode="date"
                                    display="spinner"
                                    onChange={(_event: DateTimePickerEvent, date?: Date) => {
                                      if (date instanceof Date && !Number.isNaN(date.getTime())) {
                                        setFlightLookupDraftDate(date);
                                      }
                                    }}
                                  />
                                </View>
                              </View>
                            </Modal>
                          </View>
                        ) : null}

                        {/* Error + manual entry fallback */}
                        {flightError ? (
                          <View style={[styles.flightErrorBox, { borderColor: colors.border }]}>
                            <ThemedText style={styles.modalErrorText}>{flightError}</ThemedText>
                            <Pressable
                              style={[styles.modalButton, styles.modalPrimaryButton, { backgroundColor: colors.primary, borderColor: colors.primary, marginTop: 10, alignSelf: 'stretch' }]}
                              onPress={() => {
                                setFlightAirline(flightLookupAirlineQuery.trim());
                                setFlightNumber(`${flightLookupAirlineIata}${flightLookupFlightNumber.trim()}`);
                                setFlightDepartureDate(flightLookupDate);
                                setFlightConfirmEditMode(true);
                                setFlightError(null);
                                setFlightLookupStep('confirm');
                              }}>
                              <ThemedText style={[styles.modalButtonText, styles.modalPrimaryButtonText]}>Enter manually instead</ThemedText>
                            </Pressable>
                          </View>
                        ) : null}

                        <View style={{ flex: 1 }} />
                        <View style={styles.modalActions}>
                          <Pressable
                            style={[styles.modalButton, { borderColor: colors.border }]}
                            onPress={() => {
                              setFlightModalVisible(false);
                              setFlightError(null);
                              setEditingFlightId(null);
                            }}>
                            <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
                          </Pressable>
                          {flightLookupAirlineIata && flightLookupFlightNumber.trim() && flightLookupDate ? (
                            <Pressable
                              style={[
                                styles.modalButton,
                                styles.modalPrimaryButton,
                                { backgroundColor: colors.primary, borderColor: colors.primary },
                              ]}
                              onPress={lookupFlightDetails}
                              disabled={flightLookupLoading}>
                              <ThemedText style={[styles.modalButtonText, styles.modalPrimaryButtonText]}>
                                {flightLookupLoading ? 'Looking up…' : 'Lookup'}
                              </ThemedText>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    ) : (
                      <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
                        <ThemedText style={styles.modalSubtitle}>Confirm details</ThemedText>

                        {/* Flight card preview — same style as overview */}
                        <View style={[styles.flightItem, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, marginBottom: 12 }]}>
                          <View style={styles.flightRouteRow}>
                            <View style={styles.flightAirportBlock}>
                              <ThemedText style={styles.flightAirportCode}>{flightFrom || '—'}</ThemedText>
                              <ThemedText style={styles.flightAirportCity}>{flightFromCity || ''}</ThemedText>
                            </View>
                            <ThemedText style={[styles.flightArrow, { color: colors.primary }]}>→</ThemedText>
                            <View style={[styles.flightAirportBlock, styles.flightAirportBlockRight]}>
                              <ThemedText style={styles.flightAirportCode}>{flightTo || '—'}</ThemedText>
                              <ThemedText style={styles.flightAirportCity}>{flightToCity || ''}</ThemedText>
                            </View>
                          </View>
                          <ThemedText style={styles.flightTimeLine}>
                            {formatFlightDayLine({
                              departureDate: flightDepartureDate,
                              departureTime: flightDepartureTime,
                              arrivalTime: flightArrivalTime,
                            })}
                          </ThemedText>
                          {(flightAirline || flightNumber) ? (
                            <ThemedText style={[styles.flightAirportCity, { marginTop: 2 }]}>
                              {[flightAirline, flightNumber].filter(Boolean).join(' · ')}
                            </ThemedText>
                          ) : null}
                        </View>

                        <Pressable onPress={() => setFlightConfirmEditMode((v) => !v)} style={{ marginBottom: 8 }}>
                          <ThemedText style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
                            {flightConfirmEditMode ? 'Hide manual edit' : 'Edit details manually'}
                          </ThemedText>
                        </Pressable>

                        {flightConfirmEditMode ? (
                          <>
                            {/* From airport — city auto-fills */}
                            <View>
                              <TextInput
                                value={flightFrom}
                                onChangeText={(v) => {
                                  const code = v.toUpperCase();
                                  setFlightFrom(code);
                                  const city = airportCityMap[code];
                                  if (city) setFlightFromCity(city);
                                  computeArrival(flightDepartureDate, flightDepartureTime, flightDurationHours, flightDurationMinutes, code, flightTo);
                                }}
                                placeholder="From (e.g. JFK)"
                                placeholderTextColor="#888"
                                autoCapitalize="characters"
                                maxLength={3}
                                style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                              />
                            </View>

                            {/* To airport */}
                            <TextInput
                              value={flightTo}
                              onChangeText={(v) => { const code = v.toUpperCase(); setFlightTo(code); const city = airportCityMap[code]; if (city) setFlightToCity(city); computeArrival(flightDepartureDate, flightDepartureTime, flightDurationHours, flightDurationMinutes, flightFrom, code); }}
                              placeholder="To (e.g. LHR)"
                              placeholderTextColor="#888"
                              autoCapitalize="characters"
                              maxLength={3}
                              style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                            />

                            {/* Departure time picker */}
                            <Pressable
                              onPress={() => { setFlightDepTimeDraft(dateFromHhmm(flightDepartureTime)); setFlightDepTimePickerVisible(true); }}
                              style={[styles.dateSelectButton, { borderColor: colors.border }]}>
                              <ThemedText style={[styles.dateSelectButtonText, { color: flightDepartureTime ? colors.inputText : '#888' }]}>
                                {flightDepartureTime ? formatTime12h(flightDepartureTime) : 'Departure time'}
                              </ThemedText>
                            </Pressable>
                            <Modal visible={flightDepTimePickerVisible} transparent animationType="slide" onRequestClose={() => setFlightDepTimePickerVisible(false)}>
                              <View style={styles.datePickerBackdrop}>
                                <View style={[styles.datePickerCard, { backgroundColor: colors.surface }]}>
                                  <View style={styles.datePickerHeader}>
                                    <Pressable onPress={() => setFlightDepTimePickerVisible(false)} style={styles.datePickerHeaderButton}>
                                      <ThemedText style={[styles.datePickerHeaderButtonText, { color: colors.primary }]}>Cancel</ThemedText>
                                    </Pressable>
                                    <ThemedText style={styles.datePickerTitle}>Departure time</ThemedText>
                                    <Pressable onPress={() => { const t = hhmmFromDate(flightDepTimeDraft); setFlightDepartureTime(t); computeArrival(flightDepartureDate, t, flightDurationHours, flightDurationMinutes); setFlightDepTimePickerVisible(false); }} style={styles.datePickerHeaderButton}>
                                      <ThemedText style={[styles.datePickerHeaderButtonText, { color: colors.primary }]}>Done</ThemedText>
                                    </Pressable>
                                  </View>
                                  <DateTimePicker value={flightDepTimeDraft} mode="time" display="spinner" onChange={(_e: DateTimePickerEvent, d?: Date) => { if (d) setFlightDepTimeDraft(d); }} />
                                </View>
                              </View>
                            </Modal>

                            {/* Flight duration → auto-calculates arrival */}
                            <View>
                              <ThemedText style={styles.flightStepLabel}>Flight duration</ThemedText>
                              <View style={styles.durationRow}>
                                <TextInput
                                  value={flightDurationHours}
                                  onChangeText={(v) => { setFlightDurationHours(v); computeArrival(flightDepartureDate, flightDepartureTime, v, flightDurationMinutes); }}
                                  placeholder="0"
                                  placeholderTextColor="#888"
                                  keyboardType="number-pad"
                                  maxLength={2}
                                  style={[styles.durationInput, { borderColor: colors.border, color: colors.inputText }]}
                                />
                                <ThemedText style={styles.durationLabel}>hr</ThemedText>
                                <TextInput
                                  value={flightDurationMinutes}
                                  onChangeText={(v) => { setFlightDurationMinutes(v); computeArrival(flightDepartureDate, flightDepartureTime, flightDurationHours, v); }}
                                  placeholder="00"
                                  placeholderTextColor="#888"
                                  keyboardType="number-pad"
                                  maxLength={2}
                                  style={[styles.durationInput, { borderColor: colors.border, color: colors.inputText }]}
                                />
                                <ThemedText style={styles.durationLabel}>min</ThemedText>
                              </View>
                              {flightArrivalDate && flightArrivalTime ? (
                                <ThemedText style={styles.arrivalHint}>
                                  Arrives {formatLongDate(flightArrivalDate)} at {formatTime12h(flightArrivalTime)}
                                </ThemedText>
                              ) : null}
                            </View>
                          </>
                        ) : null}

                        {flightError ? <ThemedText style={styles.modalErrorText}>{flightError}</ThemedText> : null}

                        <View style={styles.modalActions}>
                          <Pressable
                            style={[styles.modalButton, { borderColor: colors.border }]}
                            onPress={() => {
                              setFlightModalVisible(false);
                              setFlightError(null);
                              setEditingFlightId(null);
                            }}>
                            <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.modalButton,
                              styles.modalPrimaryButton,
                              { backgroundColor: colors.primary, borderColor: colors.primary },
                            ]}
                            onPress={() => {
                              if (!tripId) return;
                              const depDate = flightDepartureDate.trim();
                              const depTime = flightDepartureTime.trim();
                              if (!depDate || !depTime) {
                                setFlightError('Departure date and time are required.');
                                return;
                              }
                              const payload = {
                                segment: 'auto' as const,
                                departureDate: depDate,
                                departureTime: depTime,
                                arrivalDate: flightArrivalDate.trim() || undefined,
                                arrivalTime: flightArrivalTime.trim() || undefined,
                                airline: flightAirline.trim() || undefined,
                                flightNumber: flightNumber.trim() || undefined,
                                from: flightFrom.trim() || undefined,
                                fromCity: flightFromCity.trim() || undefined,
                                to: flightTo.trim() || undefined,
                                toCity: flightToCity.trim() || undefined,
                              };
                              if (editingFlightId) {
                                updateFlight(tripId, editingFlightId, payload);
                              } else {
                                addFlight(tripId, payload);
                              }
                              setFlightModalVisible(false);
                              setFlightError(null);
                              setEditingFlightId(null);
                            }}>
                            <ThemedText style={[styles.modalButtonText, styles.modalPrimaryButtonText]}>Confirm</ThemedText>
                          </Pressable>
                        </View>
                      </ScrollView>
                    )}
                </View>
              </View>
            </Modal>
          </ThemedView>
        );
      case 'itinerary':
        return (
          <ThemedView style={styles.tabContent}>
            <ThemedText style={styles.sectionTitle}>Itinerary</ThemedText>

            {!tripId ? (
              <ThemedText>Trip not found.</ThemedText>
            ) : (
              <View ref={dayCardsRef} collapsable={false}>
              <ThemedView style={styles.itineraryContainer}>
                {itineraryDays.length > 0 ? (
                  [...itineraryDays].sort((a, b) => {
                    if (!a.date && !b.date) return 0;
                    if (!a.date) return 1;
                    if (!b.date) return -1;
                    return a.date.localeCompare(b.date);
                  }).map((day) => {
                    const isExpanded = expandedDayIds.has(day.id);
                    return (
                      <SwipeableDayCard
                        key={day.id}
                        colors={colors}
                        onDelete={() => {
                          if (!tripId) return;
                          deleteItineraryDay(tripId, day.id);
                          setExpandedDayIds((prev) => {
                            const next = new Set(prev);
                            next.delete(day.id);
                            return next;
                          });
                        }}
                        onEdit={() => {
                          setEditingDayId(day.id);
                          setDayName(day.label);
                          setDayModalVisible(true);
                        }}>
                      <View
                        style={[styles.dayCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                        <Pressable
                          style={styles.dayCardHeaderRow}
                          onPress={() => {
                            setExpandedDayIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(day.id)) next.delete(day.id);
                              else next.add(day.id);
                              return next;
                            });
                          }}>
                          <View style={{ flex: 1 }}>
                            <ThemedText style={styles.dayCardTitle}>{day.label}</ThemedText>
                            {day.date ? (
                              <ThemedText style={[styles.dayCardSubtitle, { color: colors.icon }]}>{formatDayDate(day.date)}</ThemedText>
                            ) : null}
                          </View>

                          <IconSymbol
                            name="chevron.right"
                            size={16}
                            color={colors.icon}
                            style={{ transform: [{ rotate: isExpanded ? '90deg' : '0deg' }] }}
                          />
                        </Pressable>

                        {isExpanded ? (
                          <View style={styles.dayCardExpandedContent}>
                            {day.events.length > 0 ? (
                              day.events
                                .slice()
                                .sort((a, b) => a.time.localeCompare(b.time))
                                .map((e) => (
                                  <ThemedView
                                    key={e.id}
                                    style={[styles.eventCard, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                                    <View style={styles.eventCardRow}>
                                      <View style={[styles.eventTimePill, { backgroundColor: colors.primary + '18' }]}>
                                        <IconSymbol name="clock" size={13} color={colors.primary} />
                                        <ThemedText style={[styles.eventTimePillText, { color: colors.primary }]}>
                                          {formatTimeDisplay(e.time)}
                                        </ThemedText>
                                      </View>

                                      <ThemedText style={[styles.eventName, { flex: 1 }]} numberOfLines={1}>{e.name}</ThemedText>

                                      {editMode ? (
                                        <View style={styles.eventCardActions}>
                                          <Pressable
                                            hitSlop={8}
                                            onPress={() => {
                                              setSelectedDayId(day.id);
                                              setEditingEventId(e.id);
                                              setEventName(e.name);
                                              setEventTime(e.time);
                                              setEventTimeDate(parseTime24ToDate(e.time));
                                              setEventLocation(e.location ?? '');
                                              setEventNotes(e.notes ?? '');
                                              setEventTickets(e.tickets ?? []);
                                              setEventError(null);
                                              setEventModalVisible(true);
                                            }}>
                                            <IconSymbol name="pencil" size={16} color={colors.icon} />
                                          </Pressable>

                                          <Pressable
                                            hitSlop={8}
                                            onPress={() => {
                                              if (!tripId) return;
                                              Alert.alert('Delete event?', 'This cannot be undone.', [
                                                { text: 'Cancel', style: 'cancel' },
                                                {
                                                  text: 'Delete',
                                                  style: 'destructive',
                                                  onPress: () => deleteItineraryEvent(tripId, day.id, e.id),
                                                },
                                              ]);
                                            }}>
                                            <IconSymbol name="trash" size={16} color={colors.destructive} />
                                          </Pressable>
                                        </View>
                                      ) : null}
                                    </View>

                                    {e.notes ? (
                                      <ThemedText style={[styles.eventNotes, { color: colors.textMuted }]}>{e.notes}</ThemedText>
                                    ) : null}

                                    {e.location ? (
                                      <Pressable
                                        style={({ pressed }) => [styles.eventLocationRow, { opacity: pressed ? 0.6 : 1 }]}
                                        onPress={() => {
                                          const query = encodeURIComponent(e.location!);
                                          Alert.alert(
                                            e.location!,
                                            'Open in maps',
                                            [
                                              {
                                                text: 'Google Maps',
                                                onPress: () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`),
                                              },
                                              {
                                                text: 'Apple Maps',
                                                onPress: () => Linking.openURL(`maps://?q=${query}`),
                                              },
                                              { text: 'Cancel', style: 'cancel' },
                                            ],
                                          );
                                        }}>
                                        <IconSymbol name="mappin.and.ellipse" size={13} color={colors.primary} />
                                        <ThemedText style={[styles.eventLocationText, { color: colors.primary }]}>{e.location}</ThemedText>
                                      </Pressable>
                                    ) : null}

                                    {e.tickets && e.tickets.length > 0 ? (
                                      <View style={styles.eventTicketsRow}>
                                        {e.tickets.map((ticket) => (
                                          <Pressable
                                            key={ticket.id}
                                            style={({ pressed }) => [styles.eventTicketChip, { borderColor: colors.primary, opacity: pressed ? 0.6 : 1 }]}
                                            onPress={() => WebBrowser.openBrowserAsync(ticket.url)}>
                                            <IconSymbol name={ticket.type === 'pdf' ? 'doc.fill' : 'photo'} size={11} color={colors.primary} />
                                            <ThemedText style={[styles.eventTicketChipText, { color: colors.primary }]} numberOfLines={1}>
                                              {ticket.name}
                                            </ThemedText>
                                          </Pressable>
                                        ))}
                                      </View>
                                    ) : null}
                                  </ThemedView>
                                ))
                            ) : (
                              <View style={[styles.emptyEventsCard, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                                <ThemedText style={styles.emptyEventsEmoji}>📋</ThemedText>
                                <ThemedText style={[styles.emptyEventsTitle, { color: colors.text }]}>Nothing planned yet</ThemedText>
                                <ThemedText style={[styles.emptyEventsHint, { color: colors.icon }]}>
                                  Tap below to start filling in your day
                                </ThemedText>
                              </View>
                            )}

                            <Pressable
                              style={[styles.addEventInlineButton, { borderColor: colors.border }]}
                              onPress={() => {
                                setSelectedDayId(day.id);
                                setEventName('');
                                setEventTime('');
                                setEventTimeDate(new Date());
                                setEventLocation('');
                                setEventNotes('');
                                setEventTickets([]);
                                setEventError(null);
                                setEditingEventId(null);
                                setEventModalVisible(true);
                              }}>
                              <IconSymbol name="plus" size={16} color={colors.primary} />
                              <ThemedText style={[styles.addEventInlineText, { color: colors.primary }]}>Add Event</ThemedText>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                      </SwipeableDayCard>
                    );
                  })
                ) : (
                  <ThemedText>Your days will appear here.</ThemedText>
                )}
              </ThemedView>
              </View>
            )}

            <Modal visible={dayModalVisible} transparent animationType="fade">
              <View style={styles.modalOverlay}>
                <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
                  <ThemedText style={styles.modalTitle}>
                    {editingDayId ? 'Give a headline to your day!' : 'Add Day'}
                  </ThemedText>

                  <TextInput
                    value={dayName}
                    onChangeText={setDayName}
                    placeholder={editingDayId ? 'e.g. Beach Day, City Tour...' : 'Day name'}
                    placeholderTextColor="#888"
                    style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                  />

                  {/* Date picker — only shown when adding a new day */}
                  {!editingDayId ? (
                    <>
                      <Pressable
                        style={[styles.modalInput, { borderColor: dayDatePickerVisible ? colors.primary : colors.border, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                        onPress={() => setDayDatePickerVisible((v) => !v)}>
                        <IconSymbol name="calendar" size={15} color={dayDatePickerVisible ? colors.primary : colors.icon} />
                        <ThemedText style={{ color: dayDatePickerVisible ? colors.primary : colors.inputText, flex: 1 }}>
                          {formatLongDate(toLocalIsoDate(dayDateDraft))}
                        </ThemedText>
                        <ThemedText style={{ color: colors.icon, fontSize: 12 }}>
                          {dayDatePickerVisible ? 'Hide' : 'Change'}
                        </ThemedText>
                      </Pressable>

                      {dayDatePickerVisible ? (
                        <DateTimePicker
                          value={dayDateDraft}
                          mode="date"
                          display="spinner"
                          onChange={(_e, d) => { if (d) setDayDateDraft(d); }}
                          textColor={colors.text}
                        />
                      ) : null}
                    </>
                  ) : null}

                  <View style={styles.modalActions}>
                    <Pressable
                      style={[styles.modalButton, { borderColor: colors.border }]}
                      onPress={() => {
                        setDayModalVisible(false);
                        setDayName('');
                        setDayDatePickerVisible(false);
                        setDayDateDraft(new Date());
                        setEditingDayId(null);
                      }}>
                      <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.modalButton,
                        styles.modalPrimaryButton,
                        { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                      onPress={() => {
                        if (!tripId) return;
                        const label = dayName.trim();

                        if (editingDayId) {
                          updateItineraryDay(tripId, editingDayId, label);
                          setDayModalVisible(false);
                          setDayName('');
                          setEditingDayId(null);
                          return;
                        }

                        const dateArg = dayDatePickerVisible ? toLocalIsoDate(dayDateDraft) : undefined;
                        if (dateArg && itineraryDays.some((d) => d.date === dateArg)) {
                          Alert.alert('Day already exists', 'A day for this date has already been added.');
                          return;
                        }
                        const day = addItineraryDay(tripId, label, dateArg);
                        setDayModalVisible(false);
                        setDayName('');
                        setDayDatePickerVisible(false);
                        setDayDateDraft(new Date());
                        setEditingDayId(null);
                        setExpandedDayIds((prev) => new Set(prev).add(day.id));
                      }}>
                      <ThemedText style={[styles.modalButtonText, styles.modalPrimaryButtonText]}>Save</ThemedText>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>

            <Modal visible={eventModalVisible} transparent animationType="fade">
              <View style={styles.modalOverlay}>
                <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
                  <ThemedText style={styles.modalTitle}>{editingEventId ? 'Edit Event' : 'Add Event'}</ThemedText>
                  <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                  <TextInput
                    value={eventName}
                    onChangeText={setEventName}
                    placeholder="Event name"
                    placeholderTextColor="#888"
                    style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                  />

                  <ThemedText style={styles.eventModalSectionLabel}>Location</ThemedText>
                  <TextInput
                    value={eventLocation}
                    onChangeText={setEventLocation}
                    placeholder="Address or place name (optional)"
                    placeholderTextColor="#888"
                    style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                  />

                  <ThemedText style={styles.eventModalSectionLabel}>Time</ThemedText>
                  <View style={[styles.timePickerContainer, { borderColor: colors.border }]}>
                    <DateTimePicker
                      value={eventTimeDate}
                      mode="time"
                      display="spinner"
                      onChange={(_event: DateTimePickerEvent, date?: Date) => {
                        if (date instanceof Date && !Number.isNaN(date.getTime())) {
                          setEventTimeDate(date);
                        }
                      }}
                    />
                  </View>

                  <ThemedText style={styles.eventModalSectionLabel}>Notes</ThemedText>
                  <TextInput
                    value={eventNotes}
                    onChangeText={setEventNotes}
                    placeholder="Any notes about this event (optional)"
                    placeholderTextColor="#888"
                    multiline
                    numberOfLines={3}
                    style={[styles.modalInput, styles.notesInput, { borderColor: colors.border, color: colors.inputText }]}
                  />

                  {/* Tickets section */}
                  <ThemedText style={styles.eventModalSectionLabel}>Tickets</ThemedText>
                  {eventTickets.length > 0 ? (
                    <View style={styles.ticketList}>
                      {eventTickets.map((ticket) => (
                        <View key={ticket.id} style={[styles.ticketRow, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                          <IconSymbol
                            name={ticket.type === 'pdf' ? 'doc.fill' : 'photo'}
                            size={16}
                            color={colors.primary}
                          />
                          <ThemedText
                            style={[styles.ticketName, { color: colors.text }]}
                            numberOfLines={1}
                            onPress={() => WebBrowser.openBrowserAsync(ticket.url)}>
                            {ticket.name}
                          </ThemedText>
                          <Pressable
                            hitSlop={8}
                            onPress={() => setEventTickets((prev) => prev.filter((t) => t.id !== ticket.id))}>
                            <IconSymbol name="trash" size={15} color={colors.destructive} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {ticketUploading ? (
                    <View style={styles.ticketUploadingRow}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <ThemedText style={[styles.ticketUploadingText, { color: colors.icon }]}>Uploading…</ThemedText>
                    </View>
                  ) : (
                    <Pressable
                      style={[styles.ticketAttachButton, { borderColor: colors.primary }]}
                      onPress={handleAttachTicket}>
                      <IconSymbol name="plus" size={15} color={colors.primary} />
                      <ThemedText style={[styles.ticketAttachText, { color: colors.primary }]}>Attach Ticket / PDF</ThemedText>
                    </Pressable>
                  )}

                  {eventError ? <ThemedText style={styles.modalErrorText}>{eventError}</ThemedText> : null}
                  </ScrollView>

                  <View style={styles.modalActions}>
                    <Pressable
                      style={[styles.modalButton, { borderColor: colors.border }]}
                      onPress={() => {
                        setEventModalVisible(false);
                        setEventName('');
                        setEventTime('');
                        setEventLocation('');
                        setEventTickets([]);
                        setEventError(null);
                        setEditingEventId(null);
                      }}>
                      <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.modalButton,
                        styles.modalPrimaryButton,
                        { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                      onPress={() => {
                        if (!tripId || !selectedDayId) return;
                        const name = eventName.trim();
                        const time = formatTime24(eventTimeDate);
                        const location = eventLocation.trim();

                        if (!name) {
                          setEventError('Event name is required.');
                          return;
                        }

                        const notes = eventNotes.trim();

                        if (editingEventId) {
                          updateItineraryEvent(tripId, selectedDayId, editingEventId, {
                            name,
                            time,
                            location: location ? location : undefined,
                            notes: notes ? notes : undefined,
                            tickets: eventTickets,
                          });
                        } else {
                          addItineraryEvent(tripId, selectedDayId, name, time, location ? location : undefined, notes ? notes : undefined, eventTickets);
                        }

                        setEventModalVisible(false);
                        setEventName('');
                        setEventTime('');
                        setEventLocation('');
                        setEventNotes('');
                        setEventTickets([]);
                        setEventError(null);
                        setEditingEventId(null);
                      }}>
                      <ThemedText style={[styles.modalButtonText, styles.modalPrimaryButtonText]}>Save</ThemedText>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>

          </ThemedView>
        );
      case 'finances':
        return (
          <ThemedView style={styles.tabContent}>
            <ThemedText style={styles.sectionTitle}>Finances</ThemedText>

            <ThemedView
              style={[
                styles.financesTotalCard,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}>
              <ThemedText style={styles.financesTotalLabel}>Total</ThemedText>
              <ThemedText numberOfLines={2} style={styles.financesTotalValue}>
                {(() => {
                  const totalsByCurrency = expenses.reduce<Record<string, number>>((acc, expense) => {
                    const currency = expense.currency || 'USD';
                    acc[currency] = (acc[currency] ?? 0) + expense.amount;
                    return acc;
                  }, {});

                  const parts = Object.entries(totalsByCurrency)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([currency, amount]) => `${amount.toFixed(2)} ${currency}`);

                  return parts.length ? parts.join(' | ') : '$0.00';
                })()}
              </ThemedText>
            </ThemedView>

            {expenses.length > 0 ? (
              <ThemedView style={styles.financesList}>
                {expenses.map((e) => (
                  <Pressable
                    key={e.id}
                    style={[styles.financeCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    onPress={() => {
                      if (!editMode) return;
                      openExpenseModal({
                        id: e.id,
                        name: e.name,
                        amount: e.amount,
                        currency: e.currency,
                        isSplit: e.isSplit,
                      });
                    }}>
                    <View style={styles.financeHeaderRow}>
                      <ThemedText style={styles.financeName}>{e.name || 'Expense'}</ThemedText>
                      <ThemedText style={styles.financeAmount}>
                        {e.amount.toFixed(2)} {e.currency}
                      </ThemedText>
                    </View>
                    <View style={styles.financeMetaRow}>
                      {e.isSplit ? <ThemedText style={styles.financeMeta}>Split</ThemedText> : null}
                      {editMode ? (
                        <View style={styles.inlineActionsRow}>
                          <Pressable
                            style={styles.inlineActionButton}
                            onPress={() => {
                              openExpenseModal({
                                id: e.id,
                                name: e.name,
                                amount: e.amount,
                                currency: e.currency,
                                isSplit: e.isSplit,
                              });
                            }}>
                            <ThemedText style={[styles.inlineActionText, { color: colors.primary }]}>Edit</ThemedText>
                          </Pressable>
                          <Pressable
                            style={styles.inlineActionButton}
                            onPress={() => {
                              if (!tripId) return;
                              Alert.alert('Delete expense?', 'This cannot be undone.', [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Delete',
                                  style: 'destructive',
                                  onPress: () => deleteExpense(tripId, e.id),
                                },
                              ]);
                            }}>
                            <ThemedText
                              style={[styles.inlineActionText, styles.destructiveText, { color: colors.destructive }]}
                            >
                              Delete
                            </ThemedText>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </ThemedView>
            ) : (
              <ThemedText style={styles.emptyText}>No expenses yet.</ThemedText>
            )}

            <Modal visible={expenseModalVisible} transparent animationType="fade">
              <View style={styles.modalOverlay}>
                <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
                  <ThemedText style={styles.modalTitle}>{editingExpenseId ? 'Edit Expense' : 'Add Expense'}</ThemedText>

                  <TextInput
                    value={expenseName}
                    onChangeText={setExpenseName}
                    placeholder="Name (optional)"
                    placeholderTextColor="#888"
                    style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                  />

                  <TextInput
                    value={expenseAmount}
                    onChangeText={setExpenseAmount}
                    placeholder="Amount"
                    placeholderTextColor="#888"
                    keyboardType="decimal-pad"
                    style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                  />

                  <TextInput
                    value={expenseCurrency}
                    onChangeText={setExpenseCurrency}
                    placeholder="Currency (e.g., USD)"
                    placeholderTextColor="#888"
                    autoCapitalize="characters"
                    style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                  />

                  <Pressable
                    style={[styles.checkboxRow, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
                    onPress={() => setExpenseIsSplit((v) => !v)}>
                    <View
                      style={[
                        styles.checkboxBox,
                        {
                          borderColor: colors.border,
                          backgroundColor: expenseIsSplit ? colors.primary : colors.surface,
                        },
                      ]}
                    />
                    <ThemedText style={styles.checkboxLabel}>Split?</ThemedText>
                  </Pressable>

                  {expenseError ? <ThemedText style={styles.modalErrorText}>{expenseError}</ThemedText> : null}

                  <View style={styles.modalActions}>
                    <Pressable
                      style={[styles.modalButton, { borderColor: colors.border }]}
                      onPress={() => {
                        setExpenseModalVisible(false);
                        setExpenseError(null);
                        setEditingExpenseId(null);
                      }}>
                      <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.modalButton,
                        styles.modalPrimaryButton,
                        { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                      onPress={() => {
                        if (!tripId) return;
                        const currency = expenseCurrency.trim().toUpperCase();
                        const amount = Number.parseFloat(expenseAmount);

                        if (!Number.isFinite(amount) || amount <= 0) {
                          setExpenseError('Please enter a valid amount.');
                          return;
                        }
                        if (!currency) {
                          setExpenseError('Currency is required.');
                          return;
                        }

                        if (editingExpenseId) {
                          updateExpense(tripId, editingExpenseId, {
                            name: expenseName.trim(),
                            amount,
                            currency,
                            isSplit: expenseIsSplit,
                          });
                        } else {
                          addExpense(tripId, {
                            name: expenseName.trim(),
                            amount,
                            currency,
                            isSplit: expenseIsSplit,
                          });
                        }

                        setExpenseModalVisible(false);
                        setExpenseError(null);
                        setEditingExpenseId(null);
                      }}>
                      <ThemedText style={[styles.modalButtonText, styles.modalPrimaryButtonText]}>Save</ThemedText>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>
          </ThemedView>
        );
      case 'feed':
        return (
          <ThemedView style={styles.tabContent}>
            <ThemedText style={styles.sectionTitle}>Feed</ThemedText>
            {sharedTrip && sharedTrip.feed?.length > 0 ? (
              <ThemedView style={styles.journalList}>
                {sharedTrip.feed.map((entry) => {
                  const actor = sharedTrip.members.find((m) => m.userId === entry.actorId);
                  const actorName = actor?.displayName || actor?.phone || 'Someone';
                  const timeAgo = (() => {
                    const diff = Date.now() - new Date(entry.timestamp).getTime();
                    const mins = Math.floor(diff / 60000);
                    if (mins < 1) return 'just now';
                    if (mins < 60) return `${mins}m ago`;
                    const hrs = Math.floor(mins / 60);
                    if (hrs < 24) return `${hrs}h ago`;
                    return `${Math.floor(hrs / 24)}d ago`;
                  })();
                  return (
                    <View key={entry.id} style={[styles.journalCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                      <View style={styles.journalHeaderRow}>
                        <ThemedText style={[styles.journalDate, { color: colors.text }]}>
                          <ThemedText style={{ fontWeight: '700' }}>{actorName}</ThemedText>
                          {` ${entry.action} `}
                          <ThemedText style={{ color: colors.primary }}>{entry.section}</ThemedText>
                          {entry.detail ? `: ${entry.detail}` : ''}
                        </ThemedText>
                        <ThemedText style={[styles.journalDate, { color: colors.icon }]}>{timeAgo}</ThemedText>
                      </View>
                    </View>
                  );
                })}
              </ThemedView>
            ) : (
              <ThemedText style={styles.emptyText}>
                {sharedTrip ? 'No activity yet. Changes made to this trip will appear here.' : 'Feed is only available for shared trips.'}
              </ThemedText>
            )}
          </ThemedView>
        );
      case 'photos':
        return (
          <ThemedView style={styles.tabContent}>
            <ThemedText style={styles.sectionTitle}>Photos</ThemedText>
            <ThemedText>Your trip photos will appear here.</ThemedText>
          </ThemedView>
        );
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        bounces
        alwaysBounceVertical
        overScrollMode="always"
        stickyHeaderIndices={[1]}
        contentContainerStyle={styles.scrollContentContainer}>

        {/* Child 0: Hero (scrolls away naturally — native 120fps) */}
        <View style={[styles.heroContainer, { height: heroMaxHeight }]}>
          {heroDisplayedUrl ? (
            <ExpoImage
              source={{ uri: heroDisplayedUrl }}
              style={styles.heroImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
              priority="high"
            />
          ) : (
            <View style={styles.heroImageFallback} />
          )}

          {heroNextUrl ? (
            <Animated.View style={[styles.heroNextLayer, { opacity: heroNextOpacity }]}>
              <ExpoImage
                source={{ uri: heroNextUrl }}
                style={styles.heroImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
                priority="high"
                onLoadEnd={() => {
                  heroNextOpacity.setValue(1);
                  heroDisplayedUrlRef.current = heroNextUrl;
                  setHeroDisplayedUrl(heroNextUrl);
                  setHeroNextUrl(null);
                  heroNextOpacity.setValue(0);
                  heroSwapInProgressRef.current = false;
                }}
                onError={() => {
                  setHeroNextUrl(null);
                  heroNextOpacity.setValue(0);
                  heroSwapInProgressRef.current = false;
                }}
              />
            </Animated.View>
          ) : null}
          <View style={styles.heroOverlay} />
          <Animated.View style={[styles.heroContent, { opacity: heroCardOpacity, paddingTop: insets.top + 8 }]}>
            <View style={[styles.heroDetailsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.heroCardInner}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.tripDestination, { color: colors.text }]}>{trip?.destination ?? ''}</ThemedText>
                  <ThemedText style={[styles.tripLocationText, { color: colors.icon }]}>
                    {formatTripDateRange(trip?.startDate, trip?.endDate)}
                  </ThemedText>
                </View>
                <View style={styles.heroAvatarsRow}>
                  {tripPeople.slice(0, 4).map((p) => (
                    <View
                      key={p.id}
                      style={[styles.personAvatar, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                      {p.avatarUri ? (
                        <ExpoImage source={{ uri: p.avatarUri }} style={styles.personAvatarImage} contentFit="cover" />
                      ) : (
                        <ThemedText style={styles.personAvatarText}>{getInitials(p.name)}</ThemedText>
                      )}
                    </View>
                  ))}
                  <Pressable
                    style={[styles.personAvatar, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
                    onPress={handleInvitePress}>
                    <IconSymbol name="plus" size={18} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* Child 1: Sticky header — Tabs + edit overlay */}
        <Animated.View
          style={[
            styles.stickyHeaderWrapper,
            {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: showStickyCard ? 0.14 : 0,
              shadowRadius: 8,
              elevation: showStickyCard ? 6 : 0,
            },
          ]}>
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, opacity: wrapperBgOpacity }]}
            pointerEvents="none"
          />
          <Animated.View style={{ height: cardAreaHeight, overflow: 'hidden' }}>
            <Animated.View
              style={[
                styles.heroDetailsCard,
                styles.stickyDetailsCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: stickyFadeAnim,
                  marginTop: insets.top + 2,
                },
              ]}
              pointerEvents="none">
              <View style={styles.heroCardInner}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.tripDestination, { color: colors.text }]}>{trip?.destination ?? ''}</ThemedText>
                  <ThemedText style={[styles.tripLocationText, { color: colors.icon }]}>
                    {formatTripDateRange(trip?.startDate, trip?.endDate)}
                  </ThemedText>
                </View>
                <View style={styles.heroAvatarsRow}>
                  {tripPeople.slice(0, 4).map((p) => (
                    <View
                      key={p.id}
                      style={[styles.personAvatar, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                      {p.avatarUri ? (
                        <ExpoImage source={{ uri: p.avatarUri }} style={styles.personAvatarImage} contentFit="cover" />
                      ) : (
                        <ThemedText style={styles.personAvatarText}>{getInitials(p.name)}</ThemedText>
                      )}
                    </View>
                  ))}
                  <View style={[styles.personAvatar, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                    <IconSymbol name="plus" size={18} color={colors.primary} />
                  </View>
                </View>
              </View>
            </Animated.View>
          </Animated.View>

          <ThemedView style={[styles.tabsContainer, { backgroundColor: colors.surfaceMuted }]}>
            {tabs.map((tab) => (
              <Pressable
                key={tab.key}
                style={[styles.tab, activeTab === tab.key ? { backgroundColor: colors.primary } : undefined]}
                onPress={() => setActiveTab(tab.key)}>
                <ThemedText
                  numberOfLines={1}
                  style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
                  {tab.label}
                </ThemedText>
              </Pressable>
            ))}
          </ThemedView>

          <View style={styles.globalEditOverlay} pointerEvents="box-none">
            {activeTab === 'overview' || activeTab === 'feed' || (activeTab === 'itinerary' && !editMode) ? null : (
              <Pressable
                style={[
                  styles.globalPlusButton,
                  styles.globalPlusButtonPill,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => {
                  if (!tripId) return;
                  if (activeTab === 'itinerary') {
                    setDayName('');
                    // Pre-fill with trip start date if available, otherwise today
                    const defaultDate = trip?.startDate ? new Date(trip.startDate + 'T12:00:00') : new Date();
                    setDayDateDraft(isNaN(defaultDate.getTime()) ? new Date() : defaultDate);
                    setDayDatePickerVisible(true);
                    setEditingDayId(null);
                    setDayModalVisible(true);
                    return;
                  }
                  if (activeTab === 'finances') {
                    openExpenseModal();
                    return;
                  }
                  if (activeTab === 'photos') {
                    Alert.alert('Select photos', 'Photo picking will be added soon.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'OK' },
                    ]);
                  }
                }}>
                <IconSymbol name="plus" size={22} color={colors.primary} />
                {activeTab === 'itinerary' ? (
                  <ThemedText numberOfLines={1} style={[styles.globalPlusLabel, { color: colors.primary }]}>
                    Add Day
                  </ThemedText>
                ) : activeTab === 'finances' ? (
                  <ThemedText numberOfLines={1} style={[styles.globalPlusLabel, { color: colors.primary }]}>
                    Add Expense
                  </ThemedText>
                ) : activeTab === 'photos' ? (
                  <ThemedText numberOfLines={1} style={[styles.globalPlusLabel, { color: colors.primary }]}>
                    Add Photos
                  </ThemedText>
                ) : null}
              </Pressable>
            )}
          </View>
        </Animated.View>

        {/* Child 2: Tab content */}
        <View style={styles.content}>
          {renderTabContent()}
        </View>
      </ScrollView>

      <View
        pointerEvents="box-none"
        style={[
          styles.bottomNavOverlay,
          { bottom: 24 },
        ]}>
        {activeTab === 'itinerary' ? (
          <View ref={helpButtonRef} collapsable={false} style={{ alignItems: 'center', justifyContent: 'center' }}>
            {/* Pulse ring */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.helpPulseRing,
                {
                  borderColor: colors.primary,
                  opacity: helpPulseOpacity,
                  transform: [{ scale: helpPulseScale }],
                },
              ]}
            />
            <Pressable
              style={[styles.bottomNavButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => {
                setShowItineraryTips(true);
                setItineraryTipIndex(0);
              }}>
              <IconSymbol name="questionmark.circle" size={22} color={colors.primary} />
            </Pressable>
          </View>
        ) : null}

        <View ref={pencilButtonRef} collapsable={false}>
          <Pressable
            style={[
              styles.bottomNavButton,
              editMode ? { backgroundColor: colors.primary, borderColor: colors.primary } : null,
              !editMode ? { backgroundColor: colors.surface, borderColor: colors.border } : null,
            ]}
            onPress={() => setEditMode((v) => !v)}>
            <IconSymbol name="pencil" size={22} color={editMode ? '#fff' : colors.primary} />
          </Pressable>
        </View>

        <Pressable
          style={[styles.bottomNavButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => router.back()}>
          <IconSymbol name="house.fill" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {(() => {
        if (!tipAnchor) return null;
        const tip = ITINERARY_TIPS[itineraryTipIndex];
        const screenH = Dimensions.get('window').height;
        const screenW = Dimensions.get('window').width;
        const bubbleMargin = 24;

        let bubblePosition: { top?: number; bottom?: number };
        let arrowLeft: number;

        if (tip?.target === 'dayCards') {
          bubblePosition = { top: Math.max(tipAnchor.y - 14, 80) };
          arrowLeft = screenW / 2 - bubbleMargin - 10;
        } else {
          bubblePosition = { bottom: screenH - tipAnchor.y + 14 };
          arrowLeft = tipAnchor.x + tipAnchor.w / 2 - bubbleMargin - 10;
        }

        const advanceTip = () => {
          if (itineraryTipIndex < ITINERARY_TIPS.length - 1) {
            setItineraryTipIndex((i) => i + 1);
          } else {
            setShowItineraryTips(false);
            setItineraryTipIndex(0);
          }
        };
        const DARK = 'rgba(0,0,0,0.62)';

        return (
          <View style={[StyleSheet.absoluteFill, { zIndex: 9999 }]} pointerEvents="box-none">
            {/* Morphing circular spotlight: 4 rects + 4 corners, all driven by animated values */}
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: tipBackdropOpacity }]} pointerEvents="none">
              {/* Top */}
              <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: spotCyMinusR, backgroundColor: DARK }} />
              {/* Left */}
              <Animated.View style={{ position: 'absolute', left: 0, width: spotCxMinusR, top: spotCyMinusR, height: spotDiameter, backgroundColor: DARK }} />
              {/* Right */}
              <Animated.View style={{ position: 'absolute', left: spotCxPlusR, width: 2000, top: spotCyMinusR, height: spotDiameter, backgroundColor: DARK }} />
              {/* Bottom */}
              <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: spotCyPlusR, height: 2000, backgroundColor: DARK }} />
              {/* Corner TL */}
              <Animated.View style={{ position: 'absolute', left: spotCxMinusR, top: spotCyMinusR, width: spotRAnim, height: spotRAnim, backgroundColor: DARK, borderBottomRightRadius: spotRAnim }} />
              {/* Corner TR */}
              <Animated.View style={{ position: 'absolute', left: spotCx, top: spotCyMinusR, width: spotRAnim, height: spotRAnim, backgroundColor: DARK, borderBottomLeftRadius: spotRAnim }} />
              {/* Corner BL */}
              <Animated.View style={{ position: 'absolute', left: spotCxMinusR, top: spotCy, width: spotRAnim, height: spotRAnim, backgroundColor: DARK, borderTopRightRadius: spotRAnim }} />
              {/* Corner BR */}
              <Animated.View style={{ position: 'absolute', left: spotCx, top: spotCy, width: spotRAnim, height: spotRAnim, backgroundColor: DARK, borderTopLeftRadius: spotRAnim }} />
              {/* Purple ring */}
              <Animated.View style={{ position: 'absolute', left: spotCxMinusR, top: spotCyMinusR, width: spotDiameter, height: spotDiameter, borderRadius: spotRAnim, borderWidth: 2.5, borderColor: colors.primary }} />
            </Animated.View>
            {/* Tap anywhere to advance */}
            <Pressable style={StyleSheet.absoluteFill} onPress={advanceTip} />

            {/* Animated bubble */}
            <Animated.View
              pointerEvents={showItineraryTips ? 'box-none' : 'none'}
              style={[
                styles.tipBubblePositioned,
                { backgroundColor: colors.surface },
                bubblePosition,
                { opacity: tipBubbleOpacity, transform: [{ scale: tipBubbleScale }] },
              ]}>

              {/* Dot indicators */}
              <View style={styles.tipDots}>
                {ITINERARY_TIPS.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.tipDot,
                      {
                        backgroundColor: i === itineraryTipIndex ? colors.primary : colors.border,
                        width: i === itineraryTipIndex ? 18 : 6,
                      },
                    ]}
                  />
                ))}
              </View>

              {/* Tip content with crossfade */}
              <Animated.View style={{ opacity: tipContentOpacity, gap: 6 }}>
                <ThemedText style={[styles.tipLabel, { color: colors.primary }]}>TIP</ThemedText>
                <ThemedText style={[styles.tipText, { color: colors.text }]}>
                  {tip?.text}
                </ThemedText>
              </Animated.View>

              {/* Actions */}
              <View style={styles.tipActions}>
                {itineraryTipIndex > 0 ? (
                  <Pressable
                    hitSlop={8}
                    onPress={() => setItineraryTipIndex((i) => i - 1)}>
                    <ThemedText style={[styles.tipBackText, { color: colors.icon }]}>← Back</ThemedText>
                  </Pressable>
                ) : (
                  <View />
                )}
                {itineraryTipIndex < ITINERARY_TIPS.length - 1 ? (
                  <Pressable
                    style={[styles.tipPillButton, { backgroundColor: colors.primary }]}
                    onPress={() => setItineraryTipIndex((i) => i + 1)}>
                    <ThemedText style={styles.tipPillButtonText}>Next →</ThemedText>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.tipPillButton, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      setShowItineraryTips(false);
                      setItineraryTipIndex(0);
                    }}>
                    <ThemedText style={styles.tipPillButtonText}>Got it ✓</ThemedText>
                  </Pressable>
                )}
              </View>

              <View style={[styles.tipArrowDown, { left: arrowLeft, borderTopColor: colors.surface }]} />
            </Animated.View>
          </View>
        );
      })()}

    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroContainer: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
  },
  heroImageScaleLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImageFallback: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    backgroundColor: '#111',
  },
  heroNextLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  heroContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 16,
  },
  heroDetailsCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  heroCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stickyDetailsCard: {
    marginTop: 8,
    marginHorizontal: 16,
    marginBottom: 2,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 4,
  },
  tripDestination: {
    fontSize: 22,
    fontWeight: '700',
  },
  tripLocationText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tripDates: {
    fontSize: 16,
    opacity: 0.7,
    color: '#fff',
  },
  stickyHeaderWrapper: {
    paddingBottom: 1,
  },
  tabsContainer: {
    marginTop: 6,
    marginHorizontal: 24,
    flexDirection: 'row',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 4,
    gap: 4,
    backgroundColor: '#f0f0f0',
    marginBottom: 8,
  },
  globalEditOverlay: {
    height: 8,
    marginHorizontal: 24,
    marginBottom: -10,
    overflow: 'visible',
  },
  globalPlusButton: {
    position: 'absolute',
    right: 0,
    top: -2,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  globalPlusButtonPill: {
    width: 132,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  globalPlusLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  globalPencilButtonActive: {
    backgroundColor: '#007AFF',
  },
  bottomNavOverlay: {
    position: 'absolute',
    right: 24,
    gap: 12,
    alignItems: 'center',
  },
  bottomNavButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    zIndex: 20,
    elevation: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  activeTabText: {
    color: '#fff',
    fontWeight: '500',
  },
  content: {
    paddingHorizontal: 24,
  },
  scrollContentContainer: {
    paddingBottom: 24,
  },
  tabContent: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  countdownText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  flightCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    backgroundColor: '#fff',
  },
  flightHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  flightAddIconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peopleCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    backgroundColor: '#fff',
  },
  peopleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    paddingVertical: 2,
  },
  sectionHeaderActionSlot: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderActionHidden: {
    opacity: 0,
  },
  sectionChevron: {
    width: 18,
  },
  sectionChevronExpanded: {
    transform: [{ rotate: '90deg' }],
  },
  peopleTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  peopleAvatarsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroAvatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  personAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarText: {
    fontSize: 11,
    fontWeight: '700',
  },
  personAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 100,
  },
  housingCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    backgroundColor: '#fff',
  },
  housingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  housingTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  housingList: {
    gap: 10,
  },
  housingItem: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  housingItemTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  housingItemSubtitle: {
    fontSize: 13,
    opacity: 0.75,
    fontWeight: '600',
  },
  housingDeleteText: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  housingCalLabel: {
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.8,
  },
  housingCalContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  housingCalNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  housingCalNavBtn: {
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  housingCalMonthLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  housingCalDowRow: {
    flexDirection: 'row',
  },
  housingCalDowCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.5,
    paddingVertical: 4,
  },
  housingCalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  housingCalCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  housingCalDayText: {
    fontSize: 14,
    fontWeight: '600',
  },
  housingDateSummary: {
    fontSize: 13,
    fontWeight: '700',
    opacity: 0.8,
    textAlign: 'center',
  },
  housingTimeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  housingTimeField: {
    flex: 1,
    gap: 4,
  },
  housingTimeLabel: {
    fontSize: 13,
    fontWeight: '700',
    opacity: 0.7,
  },
  comingUpCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    backgroundColor: '#fff',
  },
  comingUpHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  comingUpTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  comingUpBody: {
    gap: 10,
  },
  comingUpRow: {
    gap: 4,
  },
  comingUpLabel: {
    fontSize: 12,
    opacity: 0.7,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  comingUpValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  comingUpSubvalue: {
    fontSize: 13,
    opacity: 0.75,
    fontWeight: '600',
  },
  comingUpDivider: {
    height: 1,
    opacity: 0.4,
    backgroundColor: '#ddd',
  },
  flightTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  flightSectionBlock: {
    gap: 8,
  },
  flightSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    opacity: 0.8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  flightSectionList: {
    gap: 10,
  },
  flightsList: {
    gap: 10,
  },
  flightItem: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  flightRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  flightAirportBlock: {
    flex: 1,
  },
  flightAirportBlockRight: {
    alignItems: 'flex-end',
  },
  flightAirportCode: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 1,
  },
  flightAirportCity: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
  },
  flightArrow: {
    fontSize: 20,
    fontWeight: '700',
  },
  flightTimeLine: {
    fontSize: 13,
    opacity: 0.85,
    fontWeight: '600',
  },
  flightItemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  flightSegmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  flightSegmentOption: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  flightSegmentOptionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  flightDetails: {
    gap: 4,
  },
  flightLine: {
    fontSize: 13,
    opacity: 0.8,
  },
  itineraryContainer: {
    gap: 12,
    paddingBottom: 100,
  },
  itineraryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  daysHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editToggleButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  editToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  addDayButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addDayButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#007AFF',
  },
  dayCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  dayCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dayCardTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  dayCardExpandedContent: {
    marginTop: 10,
    gap: 8,
  },
  dayCardSubtitle: {
    fontSize: 14,
    opacity: 0.7,
  },
  itineraryBackButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  itineraryBackText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  itineraryDayTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  addEventButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  addEventButtonText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  eventHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inlineActionButton: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  inlineActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },
  destructiveText: {
    color: '#D12C2C',
  },
  eventsList: {
    flex: 1,
  },
  eventsListContent: {
    paddingBottom: 24,
    gap: 10,
  },
  eventCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    gap: 4,
    backgroundColor: '#fff',
  },
  eventName: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  eventNotes: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  notesInput: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  eventMeta: {
    fontSize: 13,
    opacity: 0.7,
  },
  financesList: {
    gap: 10,
  },
  financeCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  financeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  financeName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  financeAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  financeMeta: {
    fontSize: 13,
    opacity: 0.7,
  },
  financeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  journalList: {
    gap: 10,
  },
  journalCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  journalDate: {
    fontSize: 13,
    opacity: 0.8,
    fontWeight: '600',
  },
  journalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  journalText: {
    fontSize: 14,
    lineHeight: 20,
  },
  journalShareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginTop: 4,
    gap: 12,
  },
  financesTotalCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  financesTotalLabel: {
    fontSize: 18,
    fontWeight: '700',
  },
  financesTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'right',
    flex: 1,
  },
  emptyText: {
    fontSize: 13,
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalSubtitle: {
    fontSize: 14,
    opacity: 0.7,
  },
  modalErrorText: {
    fontSize: 13,
    color: '#D12C2C',
    fontWeight: '500',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111',
  },
  modalMultilineInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  dateSelectButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateSelectButtonText: {
    fontSize: 16,
  },
  datePickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  datePickerCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  datePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  datePickerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  datePickerHeaderButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  datePickerHeaderButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  flightSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  flightBottomSheet: {
    height: '75%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingTop: 8,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ccc',
    alignSelf: 'center',
    marginBottom: 12,
  },
  airlineResultsFloat: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    maxHeight: 200,
    zIndex: 20,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  durationInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    textAlign: 'center',
    width: 60,
  },
  durationLabel: {
    fontSize: 15,
    opacity: 0.6,
    marginRight: 4,
  },
  arrivalHint: {
    fontSize: 12,
    opacity: 0.55,
    marginTop: 6,
    marginLeft: 2,
  },
  flightStepLabel: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.5,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  flightErrorBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    gap: 10,
  },
  flightLookupActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  airlineResults: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    maxHeight: 200,
  },
  airlineResultItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  airlineResultText: {
    fontSize: 14,
    fontWeight: '600',
  },
  flightLookupSummary: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  flightLookupSummaryLine: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.85,
  },
  checkboxRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalPrimaryButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalPrimaryButtonText: {
    color: '#fff',
  },
  tipOverlayBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.62)',
    flex: 1,
  },
  tipBubblePositioned: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 22,
    padding: 22,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 12,
  },
  tipDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tipDot: {
    height: 6,
    borderRadius: 3,
  },
  tipLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  tipText: {
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 25,
  },
  tipBackText: {
    fontSize: 15,
    fontWeight: '600',
  },
  tipActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  tipPillButton: {
    borderRadius: 100,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  tipPillButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tipArrowDown: {
    position: 'absolute',
    bottom: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  tipArrowUp: {
    position: 'absolute',
    top: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  helpPulseRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
  },
  emptyEventsCard: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    gap: 6,
  },
  emptyEventsEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  emptyEventsTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptyEventsHint: {
    fontSize: 13,
    textAlign: 'center',
  },
  addEventInlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addEventInlineText: {
    fontSize: 14,
    fontWeight: '600',
  },
  eventModalSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.6,
    marginTop: 4,
    marginBottom: 2,
  },
  timePickerContainer: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  eventCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  eventTimePillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  eventCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  eventLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  eventLocationText: {
    fontSize: 13,
  },
  eventTicketsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  eventTicketChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 160,
  },
  eventTicketChipText: {
    fontSize: 11,
    fontWeight: '500',
    flexShrink: 1,
  },
  ticketList: {
    gap: 6,
    marginBottom: 8,
  },
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  ticketName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  ticketUploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  ticketUploadingText: {
    fontSize: 13,
  },
  ticketAttachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  ticketAttachText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
