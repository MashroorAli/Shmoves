import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
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
import RNAnimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TripInviteSheet } from '@/components/trip-invite-sheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { CURRENCIES, CURRENCY_SYMBOLS, inferDestinationCurrency } from '@/constants/currencies';
import { useAuth } from '@/context/auth-context';
import { useHomeCurrency } from '@/context/home-currency-context';
import { type TicketAttachment, useTrips } from '@/context/trips-context';
import { computeBalances, computeTransfers, isPairSettled } from '@shmoves/core';
import { useColors } from '@/hooks/use-colors';
import { useTempUnit } from '@/context/temp-unit-context';
import { useTimeFormat } from '@/context/time-format-context';
import { supabase } from '@/config/supabase';

// Legacy view shapes: the render code below still reads these; they are
// derived from the TripBundle in one place at the top of the component.
type FlightInfo = {
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
};

type ItineraryEvent = {
  id: string;
  name: string;
  time: string;
  endTime?: string;
  location?: string;
  notes?: string;
  tickets?: TicketAttachment[];
};

type ItineraryDay = {
  id: string;
  label: string;
  date: string;
  events: ItineraryEvent[];
};

type TripExpense = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  isSplit: boolean;
  splitType?: 'even';
  splitWith?: string[];
  createdBy?: string;
  paidBy?: string;
  createdAt: string;
};

type TripHousing = {
  id: string;
  location: string;
  startDate: string;
  endDate: string;
  checkInTime?: string;
  checkOutTime?: string;
  earlyCheckInRequested?: boolean;
};

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


function DayCard({ children }: { children: React.ReactNode }) {
  return <View>{children}</View>;
}

export default function TripDetailsScreen() {
  const { id } = useLocalSearchParams<{
    id?: string;
  }>();
  const router = useRouter();
  const colors = useColors();
  const { formatTemp } = useTempUnit();
  const { timeFormat, formatTime } = useTimeFormat();
  const { homeCurrency, convertToHome } = useHomeCurrency();
  const { uid, profileName, profileAvatarUrl } = useAuth();
  const {
    trips,
    inviteToTrip,
    inviteByUsername,
    inviteByUserId,
    addFlight,
    updateFlight,
    deleteFlight,
    addItineraryDay,
    updateItineraryDay,
    deleteItineraryDay,
    addItineraryItem,
    updateItineraryItem,
    deleteItineraryItem,
    setItinerary,
    addExpense,
    updateExpense,
    deleteExpense,
    addHousing,
    deleteHousing,
    markSettled,
    unmarkSettled,
  } = useTrips();
  const [activeTab, setActiveTab] = useState<'overview' | 'itinerary' | 'finances'>('overview');

  // Every trip is a TripBundle now. Derive the legacy view shapes the render
  // code reads in one place; "shared" just means >1 accepted member.
  const bundle = id ? trips.find((t) => t.trip.id === id) : undefined;
  const trip = bundle
    ? {
        id: bundle.trip.id,
        destination: bundle.trip.destination,
        startDate: bundle.trip.startDate ?? '',
        endDate: bundle.trip.endDate ?? '',
      }
    : undefined;
  const tripId = id;

  const acceptedMembers = useMemo(
    () => (bundle?.members ?? []).filter((m) => m.status === 'accepted'),
    [bundle?.members],
  );
  const isSharedTrip = acceptedMembers.length > 1;

  const flights: FlightInfo[] = useMemo(
    () =>
      (bundle?.flights ?? []).map((f) => ({
        id: f.id,
        segment: f.segment ?? undefined,
        departureDate: f.departureDate ?? '',
        departureTime: f.departureTime ?? '',
        arrivalDate: f.arrivalDate ?? undefined,
        arrivalTime: f.arrivalTime ?? undefined,
        airline: f.airline ?? undefined,
        flightNumber: f.flightNumber ?? undefined,
        from: f.fromAirport ?? undefined,
        fromCity: f.fromCity ?? undefined,
        to: f.toAirport ?? undefined,
        toCity: f.toCity ?? undefined,
      })),
    [bundle?.flights],
  );

  const itineraryDays: ItineraryDay[] = useMemo(
    () =>
      (bundle?.itinerary ?? []).map((d) => ({
        id: d.id,
        label: d.label,
        date: d.date ?? '',
        events: d.items.map((i) => ({
          id: i.id,
          name: i.name,
          time: i.startTime ?? '',
          endTime: i.endTime ?? undefined,
          location: i.location ?? undefined,
          notes: i.notes ?? undefined,
          tickets: i.tickets,
        })),
      })),
    [bundle?.itinerary],
  );

  const expenses: TripExpense[] = useMemo(
    () =>
      (bundle?.expenses ?? []).map((e) => {
        const payer = e.paidBy ?? e.createdBy ?? undefined;
        return {
          id: e.id,
          name: e.name,
          amount: e.amount,
          currency: e.currency,
          isSplit: e.splitType !== 'none' && e.splits.length > 1,
          splitType: 'even' as const,
          splitWith: e.splits.map((s) => s.userId).filter((u) => u !== payer),
          createdBy: e.createdBy ?? undefined,
          paidBy: e.paidBy ?? undefined,
          createdAt: e.createdAt,
        };
      }),
    [bundle?.expenses],
  );
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

        const days = Array.from({ length: totalDays }, (_, i) => {
          const iso = new Date(start.getTime() + i * msPerDay).toISOString().slice(0, 10);
          return {
            label: `Day ${i + 1}`,
            date: iso as string | null,
            items: [] as {
              name: string;
              startTime: string | null;
              endTime: string | null;
              location: string | null;
              notes: string | null;
              tickets: TicketAttachment[];
              estimatedCost: number | null;
              costType: 'total' | 'per_person' | null;
              currency: string | null;
            }[],
          };
        });
        const dateToDay = Object.fromEntries(days.map((d) => [d.date, d]));
        for (const flight of flights) {
          if (!flight.departureDate) continue;
          const day = dateToDay[flight.departureDate];
          if (!day) continue;
          const from = flight.from ?? flight.fromCity ?? '';
          const to = flight.to ?? flight.toCity ?? '';
          const num = flight.flightNumber ?? '';
          const airline = flight.airline ?? '';
          const label = [airline, num, from && to ? `${from} → ${to}` : ''].filter(Boolean).join(' · ');
          const endTime = flight.arrivalDate === flight.departureDate ? (flight.arrivalTime ?? null) : null;
          day.items.push({
            name: label || 'Flight',
            startTime: flight.departureTime ?? '00:00',
            endTime,
            location: null,
            notes: null,
            tickets: [],
            estimatedCost: null,
            costType: null,
            currency: null,
          });
        }
        setItinerary(tripId, days);
      }
    }
  }, [activeTab, tripId, trip?.startDate, trip?.endDate, itineraryDays.length, setItinerary, flights]);

  const [showItineraryTips, setShowItineraryTips] = useState(false);
  const [itineraryTipIndex, setItineraryTipIndex] = useState(0);
  // Lags itineraryTipIndex — only updates while bubble is invisible, so text/dots
  // never flash the new tip's content over the old position.
  const [displayedTipIndex, setDisplayedTipIndex] = useState(0);
  const itineraryTipsShownRef = useRef(false);
  const helpButtonRef = useRef<View>(null);
  const pencilButtonRef = useRef<View>(null);
  // Add Event buttons exist per-day inside expanded day cards. We register each one
  // in this Map so the tip can point at the most recently expanded day's button.
  const addEventRefs = useRef<Map<string, View>>(new Map());
  const lastExpandedDayIdRef = useRef<string | null>(null);
  // Refs for fields inside the Add Event modal (used by tips 3 + 4).
  const locationFieldRef = useRef<View>(null);
  const ticketsFieldRef = useRef<View>(null);
  // Gates whether overlay mounts. Only flips at start (true) and end (false) — never mid-animation.
  const [tipVisible, setTipVisible] = useState(false);

  // Bubble shared values — only opacity + scale run on UI thread.
  const bubbleOpacity = useSharedValue(0);
  const bubbleScale = useSharedValue(0.88);

  // Bubble position lives in React state so React's own reconciler clears top/bottom
  // cleanly when the anchor mode switches (no reanimated style-accumulation issue).
  const [tipPosition, setTipPosition] = useState<{ top?: number; bottom?: number }>({});
  const [arrowLeft, setArrowLeft] = useState(0);
  const [arrowDirection, setArrowDirection] = useState<'up' | 'down'>('down');

  // Help button pulse ring (kept on legacy Animated — works fine, native driver)
  const helpPulseScale = useRef(new Animated.Value(1)).current;
  const helpPulseOpacity = useRef(new Animated.Value(0)).current;

  const bubbleAnimStyle = useAnimatedStyle(() => ({
    opacity: bubbleOpacity.value,
    transform: [{ scale: bubbleScale.value }],
  }));

  const getTipNode = (target: string | undefined): View | null => {
    if (target === 'pencil') return pencilButtonRef.current;
    if (target === 'help') return helpButtonRef.current;
    if (target === 'dayCards') return null;
    if (target === 'location') return locationFieldRef.current;
    if (target === 'tickets') return ticketsFieldRef.current;
    if (target === 'addEvent') {
      const last = lastExpandedDayIdRef.current;
      if (last && addEventRefs.current.has(last)) return addEventRefs.current.get(last) ?? null;
      // Fallback: first registered Add Event button (any expanded day).
      const first = addEventRefs.current.values().next().value;
      return first ?? null;
    }
    return null;
  };

  const getSpotR = (target: string | undefined, w: number, h: number) => {
    if (target === 'dayCards') return 0; // No spotlight hole — fully dark overlay
    const pad = 10;
    return Math.max(w, h) / 2 + pad;
  };

  // Compute bubble position. For 'center' targets x/y/w are ignored.
  const computePosition = (target: string | undefined, x: number, y: number, w: number, h: number) => {
    const screenH = Dimensions.get('window').height;
    const screenW = Dimensions.get('window').width;
    const bubbleMargin = 24;
    if (target === 'center') {
      return { pos: { bottom: 100 } as { top?: number; bottom?: number }, arrow: screenW / 2 - bubbleMargin - 10, arrowDir: 'down' as 'up' | 'down' };
    }
    // Fallbacks for modal-tip targets when measurement fails (e.g. ref not yet set).
    if ((target === 'location' || target === 'tickets') && (y <= 0 || w <= 0)) {
      return target === 'location'
        ? { pos: { top: Math.round(screenH * 0.44) } as { top?: number; bottom?: number }, arrow: screenW / 2 - bubbleMargin - 10, arrowDir: 'up' as 'up' | 'down' }
        : { pos: { bottom: Math.round(screenH * 0.18) } as { top?: number; bottom?: number }, arrow: screenW / 2 - bubbleMargin - 10, arrowDir: 'down' as 'up' | 'down' };
    }
    if (target === 'location') {
      return {
        pos: { top: y + h + 8 } as { top?: number; bottom?: number },
        arrow: x + w / 2 - bubbleMargin - 10,
        arrowDir: 'up' as 'up' | 'down',
      };
    }
    const pos = target === 'dayCards'
      ? { bottom: screenH - y + 8 }
      : { bottom: screenH - y + 14 };
    const arrow = x + w / 2 - bubbleMargin - 10;
    return { pos, arrow, arrowDir: 'down' as 'up' | 'down' };
  };

  // Open / close effect.
  useEffect(() => {
    if (!showItineraryTips) {
      bubbleOpacity.value = withTiming(0, { duration: 220 }, (finished) => {
        if (finished) runOnJS(setTipVisible)(false);
      });
      bubbleScale.value = withSpring(0.88, { damping: 26, stiffness: 200 });
      return;
    }
    const tip = ITINERARY_TIPS[itineraryTipIndex];

    const applyOpen = (x: number, y: number, w: number, h: number) => {
      const { pos, arrow, arrowDir } = computePosition(tip?.target, x, y, w, h);
      bubbleScale.value = 0.88;
      bubbleOpacity.value = 0;
      setTipPosition(pos);
      setArrowLeft(arrow);
      setArrowDirection(arrowDir);
      setDisplayedTipIndex(itineraryTipIndex);
      setTipVisible(true);
      bubbleScale.value   = withSpring(1, { damping: 24, stiffness: 180 });
      bubbleOpacity.value = withTiming(1, { duration: 220 });
    };

    setTimeout(() => {
      if (tip?.target === 'dayCards') {
        findTopmostVisibleDayCard(applyOpen);
        return;
      }
      const node = getTipNode(tip?.target);
      if (node) {
        node.measureInWindow((x, y, w, h) => applyOpen(x, y, w, h));
      } else {
        applyOpen(0, 0, 0, 0);
      }
    }, 50);
  }, [showItineraryTips]); // eslint-disable-line react-hooks/exhaustive-deps

  // Morph effect — fade bubble out, swap text/position while invisible, fade back in.
  const applyMorphForCurrentTip = useCallback(() => {
    const tip = ITINERARY_TIPS[itineraryTipIndex];

    const applyMorph = (x: number, y: number, w: number, h: number) => {
      const { pos, arrow, arrowDir } = computePosition(tip?.target, x, y, w, h);
      setTipPosition(pos);
      setArrowLeft(arrow);
      setArrowDirection(arrowDir);
      setDisplayedTipIndex(itineraryTipIndex);
      bubbleScale.value   = 0.94;
      bubbleScale.value   = withDelay(200, withSpring(1, { damping: 24, stiffness: 180 }));
      bubbleOpacity.value = withDelay(200, withTiming(1, { duration: 220 }));
    };

    // For modal-anchored tips, the modal needs a moment to be fully laid out
    // before measureInWindow returns reliable coordinates.
    const tryMeasure = (attemptsLeft: number) => {
      const node = getTipNode(tip?.target);
      if (!node) {
        if (attemptsLeft > 0 && isModalTip(tip?.target)) {
          setTimeout(() => tryMeasure(attemptsLeft - 1), 80);
        } else {
          applyMorph(0, 0, 0, 0);
        }
        return;
      }
      node.measureInWindow((x, y, w, h) => {
        // If iOS reports zeros mid-animation, retry once.
        if ((y <= 0 || w <= 0) && attemptsLeft > 0 && isModalTip(tip?.target)) {
          setTimeout(() => tryMeasure(attemptsLeft - 1), 80);
        } else {
          applyMorph(x, y, w, h);
        }
      });
    };
    if (tip?.target === 'dayCards') {
      findTopmostVisibleDayCard(applyMorph);
      return;
    }
    tryMeasure(isModalTip(tip?.target) ? 4 : 0);
  }, [itineraryTipIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showItineraryTips || !tipVisible) return;
    const tip = ITINERARY_TIPS[itineraryTipIndex];
    const fadeDuration = 250;
    bubbleOpacity.value = withTiming(0, { duration: fadeDuration }, (finished) => {
      if (finished) runOnJS(applyMorphForCurrentTip)();
    });
  }, [itineraryTipIndex]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const dayCardRefs = useRef<Map<string, View>>(new Map());
  const headerScrollRef = useRef<ScrollView>(null);

  const findTopmostVisibleDayCard = (callback: (x: number, y: number, w: number, h: number) => void) => {
    const screenH = Dimensions.get('window').height;
    const nodes = Array.from(dayCardRefs.current.values());
    if (nodes.length === 0) { callback(0, 0, 0, 0); return; }
    let remaining = nodes.length;
    const results: { x: number; y: number; w: number; h: number }[] = [];
    nodes.forEach((node) => {
      node.measureInWindow((x, y, w, h) => {
        results.push({ x, y, w, h });
        remaining--;
        if (remaining === 0) {
          const visible = results.filter((r) => r.y >= 240 && r.y + r.h <= screenH - 80);
          const pool = visible.length > 0 ? visible : results;
          pool.sort((a, b) => a.y - b.y);
          const top = pool[0];
          callback(top.x, top.y, top.w, top.h);
        }
      });
    });
  };

  const ITINERARY_TIPS: { text: string; target: 'dayCards' | 'pencil' | 'help' | 'center' | 'addEvent' | 'location' | 'tickets' }[] = [
    { text: 'Tap any day to expand it. Long press to rename or delete it.', target: 'dayCards' },
    { text: "Press 'Add Event' to add an event.", target: 'addEvent' },
    { text: 'Add the address or place name here — once saved, tap it in your itinerary to open it in Maps or copy it.', target: 'location' },
    { text: 'Attach any tickets or PDFs here for easy access.', target: 'tickets' },
    { text: "Tap Save to save your event. Use the pencil button to edit your itinerary, or tap '?' anytime to revisit these tips.", target: 'center' },
  ];

  // Targets that live inside the Add Event modal — bubble must render in the modal tree.
  const isModalTip = (target: string | undefined) => target === 'location' || target === 'tickets';

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
    if (activeTab !== 'itinerary') setShowItineraryTips(false);
  }, [activeTab, tripId]);

  // ─── Overview tips ────────────────────────────────────────────────────────
  const [showOverviewTips, setShowOverviewTips] = useState(false);
  const [overviewTipIndex, setOverviewTipIndex] = useState(0);
  const [displayedOverviewTipIndex, setDisplayedOverviewTipIndex] = useState(0);
  const overviewTipActiveRef = useRef(false);
  const overviewHelpButtonRef = useRef<View>(null);
  const overviewFlightsHeaderRef = useRef<View>(null);
  const overviewHousingHeaderRef = useRef<View>(null);
  const [overviewTipVisible, setOverviewTipVisible] = useState(false);
  const overviewBubbleOpacity = useSharedValue(0);
  const overviewBubbleScale = useSharedValue(0.88);
  const [overviewTipPosition, setOverviewTipPosition] = useState<{ top?: number; bottom?: number }>({});
  const [overviewArrowLeft, setOverviewArrowLeft] = useState(0);
  const overviewBubbleAnimStyle = useAnimatedStyle(() => ({
    opacity: overviewBubbleOpacity.value,
    transform: [{ scale: overviewBubbleScale.value }],
  }));

  const OVERVIEW_TIPS = [
    { text: 'Tap an airport code to get directions straight to your terminal.', target: 'flightsHeader' },
    { text: 'Tap the address to get directions straight to your housing.', target: 'housingHeader' },
  ];

  const getOverviewTipNode = (target: string | undefined): View | null => {
    if (target === 'flightsHeader') return overviewFlightsHeaderRef.current;
    if (target === 'housingHeader') return overviewHousingHeaderRef.current;
    return null;
  };

  const computeOverviewPosition = (x: number, y: number, w: number, h: number) => {
    const screenH = Dimensions.get('window').height;
    const screenW = Dimensions.get('window').width;
    const bubbleMargin = 24;
    return {
      pos: { bottom: screenH - y + 8 } as { top?: number; bottom?: number },
      arrow: x + w / 2 - bubbleMargin - 10,
    };
  };

  // Hide tips when leaving overview tab.
  useEffect(() => {
    if (activeTab !== 'overview') {
      setShowOverviewTips(false);
      overviewTipActiveRef.current = false;
    }
  }, [activeTab]);

  // Show flight tip once, the first time the user has a flight and visits overview.
  useEffect(() => {
    if (activeTab !== 'overview' || !tripId || flights.length === 0 || overviewTipActiveRef.current) return;
    const key = `ov_flight_tip_${tripId}`;
    AsyncStorage.getItem(key).then((val) => {
      if (val !== 'true' && !overviewTipActiveRef.current) {
        overviewTipActiveRef.current = true;
        setOverviewTipIndex(0);
        setShowOverviewTips(true);
        AsyncStorage.setItem(key, 'true');
      }
    });
  }, [activeTab, tripId, flights.length]);

  // Show housing tip once, the first time the user has housing and visits overview.
  useEffect(() => {
    if (activeTab !== 'overview' || !tripId || overviewTipActiveRef.current) return;
    const housing = bundle?.housing ?? [];
    if (housing.length === 0) return;
    const key = `ov_housing_tip_${tripId}`;
    AsyncStorage.getItem(key).then((val) => {
      if (val !== 'true' && !overviewTipActiveRef.current) {
        overviewTipActiveRef.current = true;
        setOverviewTipIndex(1);
        setShowOverviewTips(true);
        AsyncStorage.setItem(key, 'true');
      }
    });
  }, [activeTab, tripId, bundle?.housing]);

  // Open / close.
  useEffect(() => {
    if (!showOverviewTips) {
      overviewBubbleOpacity.value = withTiming(0, { duration: 220 }, (finished) => {
        if (finished) runOnJS(setOverviewTipVisible)(false);
      });
      overviewBubbleScale.value = withSpring(0.88, { damping: 26, stiffness: 200 });
      return;
    }
    const tip = OVERVIEW_TIPS[overviewTipIndex];
    setTimeout(() => {
      const node = getOverviewTipNode(tip?.target);
      const apply = (x: number, y: number, w: number, h: number) => {
        const { pos, arrow } = computeOverviewPosition(x, y, w, h);
        overviewBubbleScale.value = 0.88;
        overviewBubbleOpacity.value = 0;
        setOverviewTipPosition(pos);
        setOverviewArrowLeft(arrow);
        setDisplayedOverviewTipIndex(overviewTipIndex);
        setOverviewTipVisible(true);
        overviewBubbleScale.value = withSpring(1, { damping: 24, stiffness: 180 });
        overviewBubbleOpacity.value = withTiming(1, { duration: 220 });
      };
      if (node) node.measureInWindow((x, y, w, h) => apply(x, y, w, h));
      else apply(0, 0, 0, 0);
    }, 50);
  }, [showOverviewTips]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyMorphForCurrentOverviewTip = useCallback(() => {
    const tip = OVERVIEW_TIPS[overviewTipIndex];
    const node = getOverviewTipNode(tip?.target);
    const apply = (x: number, y: number, w: number, h: number) => {
      const { pos, arrow } = computeOverviewPosition(x, y, w, h);
      setOverviewTipPosition(pos);
      setOverviewArrowLeft(arrow);
      setDisplayedOverviewTipIndex(overviewTipIndex);
      overviewBubbleScale.value = 0.94;
      overviewBubbleScale.value = withDelay(200, withSpring(1, { damping: 24, stiffness: 180 }));
      overviewBubbleOpacity.value = withDelay(200, withTiming(1, { duration: 220 }));
    };
    if (node) node.measureInWindow((x, y, w, h) => apply(x, y, w, h));
    else apply(0, 0, 0, 0);
  }, [overviewTipIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Morph when index changes.
  useEffect(() => {
    if (!showOverviewTips || !overviewTipVisible) return;
    overviewBubbleOpacity.value = withTiming(0, { duration: 250 }, (finished) => {
      if (finished) runOnJS(applyMorphForCurrentOverviewTip)();
    });
  }, [overviewTipIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderOverviewTipBubble = () => {
    if (!overviewTipVisible) return null;
    const displayedTip = OVERVIEW_TIPS[displayedOverviewTipIndex];
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 9999 }]} pointerEvents="box-none">
        <RNAnimated.View
          pointerEvents={showOverviewTips ? 'box-none' : 'none'}
          style={[
            styles.tipBubblePositioned,
            { backgroundColor: colors.surface },
            overviewTipPosition,
            overviewBubbleAnimStyle,
          ]}>
          <View style={styles.tipDots}>
            {OVERVIEW_TIPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.tipDot,
                  {
                    backgroundColor: i === displayedOverviewTipIndex ? colors.primary : colors.border,
                    width: i === displayedOverviewTipIndex ? 18 : 6,
                  },
                ]}
              />
            ))}
          </View>
          <View style={{ gap: 6 }}>
            <ThemedText style={[styles.tipLabel, { color: colors.primary }]}>TIP</ThemedText>
            <ThemedText style={[styles.tipText, { color: colors.text }]}>{displayedTip?.text}</ThemedText>
          </View>
          <View style={styles.tipActions}>
            <View />
            {displayedOverviewTipIndex < OVERVIEW_TIPS.length - 1 ? (
              <Pressable
                style={[styles.tipPillButton, { backgroundColor: colors.primary }]}
                onPress={() => setOverviewTipIndex((i) => i + 1)}>
                <ThemedText style={styles.tipPillButtonText}>Next →</ThemedText>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.tipPillButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  setShowOverviewTips(false);
                  setOverviewTipIndex(0);
                  setTimeout(() => { overviewTipActiveRef.current = false; }, 500);
                }}>
                <ThemedText style={styles.tipPillButtonText}>Got it ✓</ThemedText>
              </Pressable>
            )}
          </View>
          <View style={[styles.tipArrowDown, { borderTopColor: colors.surface, left: overviewArrowLeft }]} />
        </RNAnimated.View>
      </View>
    );
  };

  const [dayModalVisible, setDayModalVisible] = useState(false);
  const [dayName, setDayName] = useState('');
  const [editingDayId, setEditingDayId] = useState<string | null>(null);

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
  const [eventEndTimeEnabled, setEventEndTimeEnabled] = useState(false);
  const [eventEndTimeDate, setEventEndTimeDate] = useState(new Date());
  const [itineraryView, setItineraryView] = useState<'list' | 'grid'>('list');

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
  const expenseAmountValue = Number.parseFloat(expenseAmount) || 0;
  const [expenseCurrency, setExpenseCurrency] = useState('USD');
  const [expenseName, setExpenseName] = useState('');

  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [expenseStep, setExpenseStep] = useState<'details' | 'split-type' | 'split-members'>('details');
  const [splitWith, setSplitWith] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<'none' | 'even' | 'uneven'>('none');
  const [pendingSplitMode, setPendingSplitMode] = useState<'none' | 'even' | 'uneven'>('none');
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [paidByPickerVisible, setPaidByPickerVisible] = useState(false);
  const [allTransfersExpanded, setAllTransfersExpanded] = useState(false);

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
  const wrapperBgOpacity = scrollY.interpolate({
    inputRange: [0, heroMaxHeight * 0.3],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  // Card only grows in during the final quarter of the hero scroll so it never
  // overlaps the hero content — the sticky header pins at heroMaxHeight and by
  // then the card is fully revealed.
  const cardAreaHeight = scrollY.interpolate({
    inputRange: [heroMaxHeight * 0.75, heroMaxHeight],
    outputRange: [0, insets.top + 62],
    extrapolate: 'clamp',
  });
  const [showStickyCard, setShowStickyCard] = useState(false);
  const stickyFadeAnim = useRef(new Animated.Value(0)).current;
  const stickyIconsFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const threshold = heroMaxHeight * 0.8;
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
    if (showStickyCard) {
      // Text fades in first, icons follow after text is mostly visible
      Animated.sequence([
        Animated.timing(stickyFadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(stickyIconsFadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(stickyFadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(stickyIconsFadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [showStickyCard, stickyFadeAnim, stickyIconsFadeAnim]);

  const [overviewFlightsCollapsed, setOverviewFlightsCollapsed] = useState(false);
  const [overviewHousingCollapsed, setOverviewHousingCollapsed] = useState(false);
  const [overviewComingUpCollapsed, setOverviewComingUpCollapsed] = useState(false);

  const tripPeople: TripPerson[] = acceptedMembers.length
    ? acceptedMembers.map((m) => ({
        id: m.userId,
        name: (m.userId === uid ? profileName : undefined) || m.displayName || m.phone || '?',
        avatarUri: m.avatarUrl ?? undefined,
      }))
    : [{ id: uid ?? 'me', name: profileName || 'Me', avatarUri: profileAvatarUrl ?? undefined }];

  const tripHousing: TripHousing[] = useMemo(
    () =>
      (bundle?.housing ?? []).map((h) => ({
        id: h.id,
        location: h.location,
        startDate: h.startDate ?? '',
        endDate: h.endDate ?? '',
        checkInTime: h.checkInTime ?? undefined,
        checkOutTime: h.checkOutTime ?? undefined,
        earlyCheckInRequested: h.earlyCheckInRequested,
      })),
    [bundle?.housing],
  );

  const [housingModalVisible, setHousingModalVisible] = useState(false);
  const [housingLocation, setHousingLocation] = useState('');
  const [housingStartDate, setHousingStartDate] = useState<string | null>(null);
  const [housingEndDate, setHousingEndDate] = useState<string | null>(null);
  const [housingCheckIn, setHousingCheckIn] = useState('');
  const [housingCheckOut, setHousingCheckOut] = useState('');
  const [housingEarlyCheckIn, setHousingEarlyCheckIn] = useState(false);
  const [housingError, setHousingError] = useState<string | null>(null);
  const [housingCalMonth, setHousingCalMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const [isInviting, setIsInviting] = useState(false);
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);

  type WeatherData = { tempC: number; description: string; emoji: string; windKph: number };
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  useEffect(() => {
    const destination = trip?.destination?.trim();
    if (!destination) return;
    // Strip country/state — geocoding works best with just the city name
    const cityName = destination.split(',')[0].trim();
    let cancelled = false;
    const run = async () => {
      setWeatherLoading(true);
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`
        );
        const geoJson = await geoRes.json();
        const loc = geoJson?.results?.[0];
        if (!loc || cancelled) return;
        const wxRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code,windspeed_10m&temperature_unit=celsius&windspeed_unit=kmh&timezone=auto`
        );
        const wxJson = await wxRes.json();
        if (cancelled) return;
        const current = wxJson?.current;
        if (!current) return;
        const code: number = current.weather_code ?? 0;
        const emojiMap: [number[], string, string][] = [
          [[0], '☀️', 'Clear sky'],
          [[1], '🌤️', 'Mainly clear'],
          [[2], '⛅', 'Partly cloudy'],
          [[3], '☁️', 'Overcast'],
          [[45, 48], '🌫️', 'Foggy'],
          [[51, 53, 55, 56, 57], '🌦️', 'Drizzle'],
          [[61, 63, 65, 66, 67], '🌧️', 'Rain'],
          [[71, 73, 75, 77], '❄️', 'Snow'],
          [[80, 81, 82], '🌧️', 'Rain showers'],
          [[85, 86], '🌨️', 'Snow showers'],
          [[95], '⛈️', 'Thunderstorm'],
          [[96, 99], '⛈️', 'Thunderstorm with hail'],
        ];
        let emoji = '🌡️', description = 'Unknown';
        for (const [codes, em, desc] of emojiMap) {
          if (codes.includes(code)) { emoji = em; description = desc; break; }
        }
        setWeatherData({
          tempC: Math.round(current.temperature_2m),
          description,
          emoji,
          windKph: Math.round(current.windspeed_10m),
        });
      } catch {
        // non-blocking — weather is best-effort
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [trip?.destination]);

  const handleShareLink = async () => {
    if (!tripId || !trip || isInviting) return;
    setIsInviting(true);
    try {
      const token = await inviteToTrip(tripId);
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
          await inviteByUsername(tripId, cleaned);
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
    setInviteSheetVisible(true);
  };

  const handleInviteById = async (targetUserId: string) => {
    if (!tripId) return;
    await inviteByUserId(tripId, targetUserId);
  };

  const openHousingModal = () => {
    setHousingLocation('');
    setHousingStartDate(null);
    setHousingEndDate(null);
    setHousingCheckIn('');
    setHousingCheckOut('');
    setHousingEarlyCheckIn(false);
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

  const formatTimeDisplay = (time24: string): string => formatTime(time24);

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

  const GRID_TIME_COL_WIDTH = 56;
  const GRID_COLUMN_WIDTH = (Dimensions.get('window').width - GRID_TIME_COL_WIDTH - 12) / 3;
  const GRID_SLOT_HEIGHT = 30;
  const GRID_START_HOUR = 5;
  const GRID_END_HOUR = 24;
  const GRID_TOTAL_SLOTS = (GRID_END_HOUR - GRID_START_HOUR) * 2;
  const GRID_TOTAL_HEIGHT = GRID_TOTAL_SLOTS * GRID_SLOT_HEIGHT;

  const timeToGridMinutes = (time24: string): number => {
    const [h, m] = time24.split(':').map((n) => parseInt(n, 10));
    return (h - GRID_START_HOUR) * 60 + (m || 0);
  };

  const buildGridTimeLabels = (): string[] => {
    const labels: string[] = [];
    for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h++) {
      if (timeFormat === '24h') {
        labels.push(`${String(h).padStart(2, '0')}:00`);
        labels.push(`${String(h).padStart(2, '0')}:30`);
      } else {
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        labels.push(h === 12 ? '12:00 PM' : `${h12}:00`);
        labels.push(`${h12}:30`);
      }
    }
    return labels;
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
    // Normalize AM/PM input to 24h, then delegate to formatTime
    const ampm = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampm) {
      let h = Number(ampm[1]);
      const m = ampm[2];
      const ap = ampm[3].toUpperCase();
      if (ap === 'PM' && h < 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;
      return formatTime(`${String(h).padStart(2, '0')}:${m}`);
    }
    return formatTime(value);
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

  const openExpenseModal = (expense?: { id: string; name: string; amount: number; currency: string; isSplit: boolean; splitType?: 'even'; splitWith?: string[]; paidBy?: string; createdBy?: string }) => {
    if (expense) {
      setEditingExpenseId(expense.id);
      setExpenseAmount(String(expense.amount));
      setExpenseCurrency(expense.currency);
      setExpenseName(expense.name);
      setSplitWith(expense.splitWith ?? []);
      const mode = expense.isSplit ? (expense.splitType === 'even' ? 'even' : 'uneven') : 'none';
      setSplitMode(mode);
      setPendingSplitMode(mode);
      setPaidBy(expense.paidBy ?? expense.createdBy ?? uid ?? null);
    } else {
      setEditingExpenseId(null);
      setExpenseAmount('');
      setExpenseCurrency(homeCurrency);
      setExpenseName('');
      setSplitWith([]);
      setSplitMode('none');
      setPendingSplitMode('none');
      setPaidBy(uid ?? null);
    }
    setExpenseStep('details');
    setExpenseError(null);
    setExpenseModalVisible(true);
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

  const fetchAndCopyAirportAddress = async (code: string, city: string) => {
    try {
      const q = encodeURIComponent(`${city} Airport ${code}`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'Shmoves/1.0' },
      });
      const json = await res.json();
      const address: string = json[0]?.display_name ?? `${city} Airport`;
      await Clipboard.setStringAsync(address);
      Alert.alert('Copied!', address);
    } catch {
      await Clipboard.setStringAsync(`${city} Airport`);
      Alert.alert('Copied!', `${city} Airport`);
    }
  };

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

      const fetchForDate = async (d: string) => {
        const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightIata)}/${encodeURIComponent(d)}`;
        const res = await fetch(url, {
          headers: {
            'X-RapidAPI-Key': RAPIDAPI_KEY,
            'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
          },
        });
        const json = (await res.json()) as any;
        return { res, json };
      };

      let { res, json } = await fetchForDate(date);

      if (!res.ok) {
        const message = typeof json?.message === 'string' ? json.message : undefined;
        setFlightError(`Flight lookup error: ${message ?? 'Request failed.'}`);
        return;
      }

      // AeroDataBox indexes overnight flights by their UTC departure date, which can
      // be one day ahead of the local departure date. Retry with +1 day automatically.
      if (!Array.isArray(json) || json.length === 0) {
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDate = nextDay.toISOString().slice(0, 10);
        const retry = await fetchForDate(nextDate);
        if (retry.res.ok) {
          res = retry.res;
          json = retry.json;
        }
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
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'itinerary' as const, label: 'Itinerary' },
    { key: 'finances' as const, label: 'Finances' },
  ];

  const renderItineraryGrid = () => {
    const sortedDays = [...itineraryDays].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
    const timeLabels = buildGridTimeLabels();
    const totalGridWidth = sortedDays.length * GRID_COLUMN_WIDTH;

    const openEditEvent = (dayId: string, e: ItineraryEvent) => {
      setSelectedDayId(dayId);
      setEditingEventId(e.id);
      setEventName(e.name);
      setEventTime(e.time);
      setEventTimeDate(parseTime24ToDate(e.time));
      setEventLocation(e.location ?? '');
      setEventNotes(e.notes ?? '');
      setEventTickets(e.tickets ?? []);
      setEventEndTimeEnabled(!!e.endTime);
      setEventEndTimeDate(e.endTime ? parseTime24ToDate(e.endTime) : new Date());
      setEventError(null);
      setEventModalVisible(true);
    };

    return (
      <View style={{ flex: 1, marginLeft: -20 }}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: GRID_TIME_COL_WIDTH }} />
          <ScrollView
            horizontal
            scrollEnabled={false}
            ref={headerScrollRef}
            showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', width: totalGridWidth }}>
              {sortedDays.map((day) => (
                <View
                  key={day.id}
                  style={{ width: GRID_COLUMN_WIDTH, paddingVertical: 8, alignItems: 'center', borderBottomWidth: 1, borderColor: colors.border }}>
                  <ThemedText style={{ fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                    {day.label}
                  </ThemedText>
                  {day.date ? (
                    <ThemedText style={{ fontSize: 11, color: colors.icon }}>
                      {formatDayDate(day.date)}
                    </ThemedText>
                  ) : null}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: GRID_TIME_COL_WIDTH }}>
              {timeLabels.map((label, i) => (
                <View
                  key={`${label}-${i}`}
                  style={{
                    height: GRID_SLOT_HEIGHT,
                    justifyContent: 'flex-start',
                    alignItems: 'flex-end',
                    paddingRight: 6,
                    paddingTop: 2,
                  }}>
                  <ThemedText style={{ fontSize: 10, color: colors.icon }}>{label}</ThemedText>
                </View>
              ))}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              onScroll={(e) => {
                headerScrollRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false });
              }}
              scrollEventThrottle={16}>
              <View style={{ flexDirection: 'row', width: totalGridWidth, height: GRID_TOTAL_HEIGHT }}>
                {sortedDays.map((day) => (
                  <View
                    key={day.id}
                    style={{
                      width: GRID_COLUMN_WIDTH,
                      height: GRID_TOTAL_HEIGHT,
                      borderLeftWidth: 1,
                      borderColor: colors.border,
                      position: 'relative',
                    }}>
                    {timeLabels.map((_, i) => (
                      <View
                        key={`slot-${i}`}
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: i * GRID_SLOT_HEIGHT,
                          height: 1,
                          backgroundColor: colors.border,
                          opacity: i % 2 === 0 ? 0.7 : 0.3,
                        }}
                      />
                    ))}
                    {day.events.map((e) => {
                      if (!e.time) return null;
                      const startMins = timeToGridMinutes(e.time);
                      const endMins = e.endTime ? timeToGridMinutes(e.endTime) : startMins + 60;
                      const clampedStart = Math.max(0, startMins);
                      const clampedEnd = Math.min(GRID_TOTAL_SLOTS * 30, endMins);
                      if (clampedEnd <= 0 || clampedStart >= GRID_TOTAL_SLOTS * 30) return null;
                      const top = (clampedStart / 30) * GRID_SLOT_HEIGHT;
                      const height = Math.max(((clampedEnd - clampedStart) / 30) * GRID_SLOT_HEIGHT, GRID_SLOT_HEIGHT);
                      return (
                        <Pressable
                          key={e.id}
                          onPress={() => openEditEvent(day.id, e)}
                          style={{
                            position: 'absolute',
                            top,
                            height,
                            left: 2,
                            right: 2,
                            backgroundColor: colors.primary,
                            borderRadius: 4,
                            paddingHorizontal: 4,
                            paddingVertical: 2,
                            overflow: 'hidden',
                          }}>
                          <ThemedText style={{ fontSize: 11, fontWeight: '700', color: '#fff' }} numberOfLines={1}>
                            {e.name}
                          </ThemedText>
                          <ThemedText style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)' }} numberOfLines={1}>
                            {e.endTime ? `${formatTimeDisplay(e.time)} – ${formatTimeDisplay(e.endTime)}` : formatTimeDisplay(e.time)}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      </View>
    );
  };

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
        const tripEndDateObj = parseTripDate(trip?.endDate);
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const isOnTrip =
          daysUntilTrip <= 0 &&
          tripEndDateObj != null &&
          new Date(tripEndDateObj.getFullYear(), tripEndDateObj.getMonth(), tripEndDateObj.getDate()) >= startOfToday;
        const now = new Date();
        const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        return (
          <ThemedView style={styles.tabContent}>
            <ThemedText style={styles.sectionTitle}>Trip Overview</ThemedText>
            <ThemedText style={styles.countdownText}>
              {isOnTrip
                ? 'You should be on the trip right now!'
                : daysUntilTrip < 0
                  ? `This trip was ${Math.abs(daysUntilTrip)} day${Math.abs(daysUntilTrip) === 1 ? '' : 's'} ago.`
                  : daysUntilTrip === 1
                    ? 'You fly out tomorrow!'
                    : `There are ${daysUntilTrip} days until the trip!`}
            </ThemedText>

            <ThemedView style={[styles.flightCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View ref={overviewFlightsHeaderRef} collapsable={false}>
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
              </View>

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
                                <Pressable
                                  style={({ pressed }) => [styles.flightAirportBlock, { opacity: pressed ? 0.6 : 1 }]}
                                  onPress={() => {
                                    const code = f.from;
                                    if (!code || code === '—') return;
                                    const city = f.fromCity ?? code;
                                    const query = encodeURIComponent(`${code} Airport`);
                                    Alert.alert(code, `Navigate to ${city} Airport`, [
                                      { text: 'Google Maps', onPress: () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`) },
                                      { text: 'Apple Maps', onPress: () => Linking.openURL(`maps://?q=${query}`) },
                                      { text: 'Copy Address', onPress: () => fetchAndCopyAirportAddress(code, city) },
                                      { text: 'Cancel', style: 'cancel' },
                                    ]);
                                  }}>
                                  <ThemedText style={styles.flightAirportCode}>{f.from ?? '—'}</ThemedText>
                                  <ThemedText style={styles.flightAirportCity}>{f.fromCity ?? ''}</ThemedText>
                                </Pressable>

                                <ThemedText style={[styles.flightArrow, { color: colors.primary }]}>→</ThemedText>

                                <Pressable
                                  style={({ pressed }) => [styles.flightAirportBlock, styles.flightAirportBlockRight, { opacity: pressed ? 0.6 : 1 }]}
                                  onPress={() => {
                                    const code = f.to;
                                    if (!code || code === '—') return;
                                    const city = f.toCity ?? code;
                                    const query = encodeURIComponent(`${code} Airport`);
                                    Alert.alert(code, `Navigate to ${city} Airport`, [
                                      { text: 'Google Maps', onPress: () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`) },
                                      { text: 'Apple Maps', onPress: () => Linking.openURL(`maps://?q=${query}`) },
                                      { text: 'Copy Address', onPress: () => fetchAndCopyAirportAddress(code, city) },
                                      { text: 'Cancel', style: 'cancel' },
                                    ]);
                                  }}>
                                  <ThemedText style={styles.flightAirportCode}>{f.to ?? '—'}</ThemedText>
                                  <ThemedText style={styles.flightAirportCity}>{f.toCity ?? ''}</ThemedText>
                                </Pressable>
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
              <View ref={overviewHousingHeaderRef} collapsable={false}>
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
              </View>

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
                            'Open in maps or copy address',
                            [
                              {
                                text: 'Google Maps',
                                onPress: () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`),
                              },
                              {
                                text: 'Apple Maps',
                                onPress: () => Linking.openURL(`maps://?q=${query}`),
                              },
                              {
                                text: 'Copy Address',
                                onPress: () => Clipboard.setStringAsync(h.location),
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
                  <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
                    <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
                      <ThemedText style={styles.modalTitle}>Add Housing</ThemedText>

                      <TextInput
                        value={housingLocation}
                        onChangeText={setHousingLocation}
                        placeholder="Address (e.g. 123 Main St, Hotel Sunrise)"
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

                      <View style={styles.housingTimeRow}>
                        <View style={styles.housingTimeField}>
                          <ThemedText style={styles.housingTimeLabel}>Check-in</ThemedText>
                          <TextInput
                            value={housingCheckIn}
                            onChangeText={setHousingCheckIn}
                            placeholder={timeFormat === '24h' ? 'e.g. 15:00' : 'e.g. 3:00 PM'}
                            placeholderTextColor="#888"
                            style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                          />
                        </View>
                        <View style={styles.housingTimeField}>
                          <ThemedText style={styles.housingTimeLabel}>Check-out</ThemedText>
                          <TextInput
                            value={housingCheckOut}
                            onChangeText={setHousingCheckOut}
                            placeholder={timeFormat === '24h' ? 'e.g. 11:00' : 'e.g. 11:00 AM'}
                            placeholderTextColor="#888"
                            style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                          />
                        </View>
                      </View>

                      <Pressable
                        style={styles.housingCheckboxRow}
                        onPress={() => setHousingEarlyCheckIn((prev) => !prev)}>
                        <View style={[styles.housingCheckbox, { borderColor: colors.primary, backgroundColor: housingEarlyCheckIn ? colors.primary : 'transparent' }]}>
                          {housingEarlyCheckIn ? <ThemedText style={styles.housingCheckboxTick}>✓</ThemedText> : null}
                        </View>
                        <ThemedText style={styles.housingCheckboxLabel}>Early check-in requested</ThemedText>
                      </Pressable>

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
                              startDate: housingStartDate!,
                              endDate: housingEndDate!,
                              checkInTime: housingCheckIn.trim() || null,
                              checkOutTime: housingCheckOut.trim() || null,
                              earlyCheckInRequested: housingEarlyCheckIn,
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

            {isOnTrip && (() => {
              const todayDay = itineraryDays.find((d) => d.date === todayIso);
              const todayEvents = todayDay
                ? [...(todayDay.events ?? [])].sort((a, b) => {
                    const am = parseEventTimeMinutes(a.time);
                    const bm = parseEventTimeMinutes(b.time);
                    return am - bm;
                  })
                : [];
              const todayFlights = sortedFlights.filter(
                (f) => f.departureDate === todayIso || f.arrivalDate === todayIso
              );
              const todayHousing = tripHousing.filter(
                (h) => h.startDate <= todayIso && h.endDate >= todayIso
              );
              const sections: React.ReactNode[] = [];

              // Weather
              sections.push(
                <View key="weather" style={styles.comingUpRow}>
                  <ThemedText style={styles.comingUpLabel}>Weather</ThemedText>
                  {weatherLoading ? (
                    <ActivityIndicator size="small" />
                  ) : weatherData ? (
                    <>
                      <ThemedText style={styles.comingUpValue}>
                        {weatherData.emoji}{'  '}{formatTemp(weatherData.tempC)} — {weatherData.description}
                      </ThemedText>
                      <ThemedText style={styles.comingUpSubvalue}>Wind {weatherData.windKph} km/h</ThemedText>
                    </>
                  ) : (
                    <ThemedText style={styles.comingUpValue}>Unavailable</ThemedText>
                  )}
                </View>
              );

              // Today's itinerary
              sections.push(<View key="div-itinerary" style={[styles.comingUpDivider, { backgroundColor: colors.border }]} />);
              sections.push(
                <View key="itinerary" style={styles.comingUpRow}>
                  <ThemedText style={styles.comingUpLabel}>Today's itinerary</ThemedText>
                  {todayEvents.length > 0 ? todayEvents.map((e) => (
                    <View key={e.id} style={styles.todayEventRow}>
                      {e.time ? <ThemedText style={styles.todayEventTime}>{e.time}</ThemedText> : null}
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.comingUpValue}>{e.name}</ThemedText>
                        {e.location ? <ThemedText style={styles.comingUpSubvalue}>{e.location}</ThemedText> : null}
                      </View>
                    </View>
                  )) : (
                    <ThemedText style={styles.comingUpValue}>Nothing planned yet.</ThemedText>
                  )}
                </View>
              );

              // Flights today
              if (todayFlights.length > 0) {
                sections.push(<View key="div-flights" style={[styles.comingUpDivider, { backgroundColor: colors.border }]} />);
                sections.push(
                  <View key="flights" style={styles.comingUpRow}>
                    <ThemedText style={styles.comingUpLabel}>Flights today</ThemedText>
                    {todayFlights.map((f) => (
                      <View key={f.id}>
                        <ThemedText style={styles.comingUpValue}>
                          {f.from ?? '—'} → {f.to ?? '—'}
                          {f.departureDate === todayIso && f.departureTime ? `  •  Departs ${f.departureTime}` : ''}
                          {f.arrivalDate === todayIso && f.arrivalTime ? `  •  Arrives ${f.arrivalTime}` : ''}
                        </ThemedText>
                        {f.airline || f.flightNumber ? (
                          <ThemedText style={styles.comingUpSubvalue}>
                            {[f.airline, f.flightNumber].filter(Boolean).join(' ')}
                          </ThemedText>
                        ) : null}
                      </View>
                    ))}
                  </View>
                );
              }

              // Housing today
              if (todayHousing.length > 0) {
                sections.push(<View key="div-housing" style={[styles.comingUpDivider, { backgroundColor: colors.border }]} />);
                sections.push(
                  <View key="housing" style={styles.comingUpRow}>
                    <ThemedText style={styles.comingUpLabel}>Staying at</ThemedText>
                    {todayHousing.map((h) => (
                      <View key={h.id}>
                        <ThemedText style={styles.comingUpValue}>{h.location}</ThemedText>
                        <ThemedText style={styles.comingUpSubvalue}>
                          {h.startDate === todayIso ? `Check-in${h.checkInTime ? ` at ${h.checkInTime}` : ''}` :
                           h.endDate === todayIso ? `Check-out${h.checkOutTime ? ` at ${h.checkOutTime}` : ''}` :
                           'Staying tonight'}
                          {h.earlyCheckInRequested ? '  •  Early check-in requested' : ''}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                );
              }

              return (
                <ThemedView style={[styles.comingUpCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <Pressable style={styles.comingUpHeaderRow} onPress={() => toggleSection(setOverviewComingUpCollapsed)}>
                    <View style={styles.sectionHeaderLeft}>
                      <IconSymbol
                        name="chevron.right"
                        size={18}
                        color={colors.primary}
                        style={[styles.sectionChevron, !overviewComingUpCollapsed ? styles.sectionChevronExpanded : null]}
                      />
                      <ThemedText style={styles.comingUpTitle}>Today's Plan</ThemedText>
                    </View>
                    <View style={styles.sectionHeaderActionSlot} />
                  </Pressable>
                  {overviewComingUpCollapsed ? null : (
                    <View style={styles.comingUpBody}>{sections}</View>
                  )}
                </ThemedView>
              );
            })()}

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
                              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
                      <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
                                arrivalDate: flightArrivalDate.trim() || null,
                                arrivalTime: flightArrivalTime.trim() || null,
                                airline: flightAirline.trim() || null,
                                flightNumber: flightNumber.trim() || null,
                                fromAirport: flightFrom.trim() || null,
                                fromCity: flightFromCity.trim() || null,
                                toAirport: flightTo.trim() || null,
                                toCity: flightToCity.trim() || null,
                              };
                              if (editingFlightId) {
                                updateFlight(tripId, editingFlightId, payload);
                              } else {
                                addFlight(tripId, payload);
                                // Sync a new itinerary event for the flight on the matching day
                                const matchingDay = itineraryDays.find((d) => d.date === depDate);
                                if (matchingDay) {
                                  const from = payload.fromAirport ?? payload.fromCity ?? '';
                                  const to = payload.toAirport ?? payload.toCity ?? '';
                                  const num = payload.flightNumber ?? '';
                                  const airline = payload.airline ?? '';
                                  const eventLabel = [airline, num, from && to ? `${from} → ${to}` : ''].filter(Boolean).join(' · ');
                                  const eventEndTime = payload.arrivalDate === depDate ? payload.arrivalTime : null;
                                  addItineraryItem(tripId, matchingDay.id, {
                                    name: eventLabel || 'Flight',
                                    startTime: depTime,
                                    endTime: eventEndTime,
                                  });
                                }
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
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <ThemedText style={[styles.sectionTitle, { marginBottom: 0 }]}>Itinerary</ThemedText>
              <Pressable
                hitSlop={8}
                style={[styles.editToggleButton, { borderColor: colors.border }]}
                onPress={() => setItineraryView((v) => (v === 'list' ? 'grid' : 'list'))}>
                <IconSymbol
                  name={itineraryView === 'list' ? 'rectangle.grid.2x2' : 'list.bullet'}
                  size={18}
                  color={colors.primary}
                />
              </Pressable>
            </View>

            {!tripId ? (
              <ThemedText>Trip not found.</ThemedText>
            ) : itineraryView === 'grid' ? (
              renderItineraryGrid()
            ) : (
              <View ref={dayCardsRef} collapsable={false}>
              <ThemedView style={styles.itineraryContainer}>
                {itineraryDays.length > 0 ? (
                  [...itineraryDays].sort((a, b) => {
                    if (!a.date && !b.date) return 0;
                    if (!a.date) return 1;
                    if (!b.date) return -1;
                    return a.date.localeCompare(b.date);
                  }).map((day, idx) => {
                    const isExpanded = expandedDayIds.has(day.id);
                    return (
                      <View key={day.id} ref={(node) => { if (node) dayCardRefs.current.set(day.id, node); else dayCardRefs.current.delete(day.id); }} collapsable={false}>
                      <DayCard>
                      <View
                        style={[styles.dayCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                        <Pressable
                          style={styles.dayCardHeaderRow}
                          onPress={() => {
                            setExpandedDayIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(day.id)) {
                                next.delete(day.id);
                              } else {
                                next.add(day.id);
                                lastExpandedDayIdRef.current = day.id;
                              }
                              return next;
                            });
                            if (showItineraryTips && itineraryTipIndex === 0) {
                              setItineraryTipIndex(1);
                            }
                          }}
                          onLongPress={() => {
                            Alert.alert(day.label, undefined, [
                              {
                                text: 'Rename',
                                onPress: () => {
                                  setEditingDayId(day.id);
                                  setDayName(day.label);
                                  setDayModalVisible(true);
                                },
                              },
                              { text: 'Cancel', style: 'cancel' },
                            ]);
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
                                          {e.endTime ? `${formatTimeDisplay(e.time)} – ${formatTimeDisplay(e.endTime)}` : formatTimeDisplay(e.time)}
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
                                              setEventEndTimeEnabled(!!e.endTime);
                                              setEventEndTimeDate(e.endTime ? parseTime24ToDate(e.endTime) : new Date());
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
                                                  onPress: () => deleteItineraryItem(tripId, day.id, e.id),
                                                },
                                              ]);
                                            }}>
                                            <IconSymbol name="trash" size={16} color={colors.destructive} />
                                          </Pressable>
                                        </View>
                                      ) : null}
                                    </View>

                                    {e.notes ? (
                                      <ThemedText style={[styles.eventNotes, { color: colors.icon }]}>{e.notes}</ThemedText>
                                    ) : null}

                                    {e.location ? (
                                      <Pressable
                                        style={({ pressed }) => [styles.eventLocationRow, { opacity: pressed ? 0.6 : 1 }]}
                                        onPress={() => {
                                          const query = encodeURIComponent(e.location!);
                                          Alert.alert(
                                            e.location!,
                                            'Open in maps or copy',
                                            [
                                              {
                                                text: 'Google Maps',
                                                onPress: () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`),
                                              },
                                              {
                                                text: 'Apple Maps',
                                                onPress: () => Linking.openURL(`maps://?q=${query}`),
                                              },
                                              {
                                                text: 'Copy',
                                                onPress: () => Clipboard.setStringAsync(e.location!),
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
                              ref={(node) => {
                                if (node) addEventRefs.current.set(day.id, node);
                                else addEventRefs.current.delete(day.id);
                              }}
                              collapsable={false}
                              style={[styles.addEventInlineButton, { borderColor: colors.border }]}
                              onPress={() => {
                                setSelectedDayId(day.id);
                                setEventName('');
                                setEventTime('');
                                setEventTimeDate(new Date());
                                setEventLocation('');
                                setEventNotes('');
                                setEventTickets([]);
                                setEventEndTimeEnabled(false);
                                setEventEndTimeDate(new Date());
                                setEventError(null);
                                setEditingEventId(null);
                                setEventModalVisible(true);
                                // The tip-2 → tip-3 transition is triggered by the Modal's onShow
                                // so the modal is fully laid out before we measure inside it.
                              }}>
                              <IconSymbol name="plus" size={16} color={colors.primary} />
                              <ThemedText style={[styles.addEventInlineText, { color: colors.primary }]}>Add Event</ThemedText>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                      </DayCard>
                      </View>
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
                  <ThemedText style={styles.modalTitle}>Give a headline to your day!</ThemedText>

                  <TextInput
                    value={dayName}
                    onChangeText={setDayName}
                    placeholder="e.g. Beach Day, City Tour..."
                    placeholderTextColor="#888"
                    style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                  />

                  <View style={styles.modalActions}>
                    <Pressable
                      style={[styles.modalButton, { borderColor: colors.border }]}
                      onPress={() => {
                        setDayModalVisible(false);
                        setDayName('');
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
                        if (!tripId || !editingDayId) return;
                        const label = dayName.trim();
                        updateItineraryDay(tripId, editingDayId, label);
                        setDayModalVisible(false);
                        setDayName('');
                        setEditingDayId(null);
                      }}>
                      <ThemedText style={[styles.modalButtonText, styles.modalPrimaryButtonText]}>Save</ThemedText>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>

            <Modal
              visible={eventModalVisible}
              transparent
              animationType={showItineraryTips && itineraryTipIndex === 1 ? 'none' : 'fade'}
              onShow={() => {
                // Modal is fully presented + laid out — safe to advance the tour
                // into a tip that anchors on a field inside the modal.
                if (showItineraryTips && itineraryTipIndex === 1) {
                  setItineraryTipIndex(2);
                }
              }}>
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

                  <View ref={locationFieldRef} collapsable={false}>
                    <ThemedText style={styles.eventModalSectionLabel}>Location</ThemedText>
                    <TextInput
                      value={eventLocation}
                      onChangeText={setEventLocation}
                      placeholder="Address or place name (optional)"
                      placeholderTextColor="#888"
                      style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                    />
                  </View>

                  <ThemedText style={styles.eventModalSectionLabel}>Time</ThemedText>
                  <View style={[styles.timePickerContainer, { borderColor: colors.border }]}>
                    <DateTimePicker
                      value={eventTimeDate}
                      mode="time"
                      display="spinner"
                      minuteInterval={5}
                      onChange={(_event: DateTimePickerEvent, date?: Date) => {
                        if (date instanceof Date && !Number.isNaN(date.getTime())) {
                          setEventTimeDate(date);
                        }
                      }}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <ThemedText style={[styles.eventModalSectionLabel, { marginTop: 0 }]}>End Time</ThemedText>
                    <Switch
                      value={eventEndTimeEnabled}
                      onValueChange={(v) => {
                        setEventEndTimeEnabled(v);
                        if (v) {
                          const d = new Date(eventTimeDate);
                          d.setHours(d.getHours() + 1);
                          setEventEndTimeDate(d);
                        }
                      }}
                      trackColor={{ false: colors.border, true: colors.primary + '66' }}
                      thumbColor={eventEndTimeEnabled ? colors.primary : colors.icon}
                    />
                  </View>
                  {eventEndTimeEnabled && (
                    <View style={[styles.timePickerContainer, { borderColor: colors.border }]}>
                      <DateTimePicker
                        value={eventEndTimeDate}
                        mode="time"
                        display="spinner"
                        minuteInterval={5}
                        onChange={(_e: DateTimePickerEvent, date?: Date) => {
                          if (date instanceof Date && !Number.isNaN(date.getTime())) {
                            setEventEndTimeDate(date);
                          }
                        }}
                      />
                    </View>
                  )}

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
                  <View ref={ticketsFieldRef} collapsable={false}>
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
                  </View>

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
                        setEventEndTimeEnabled(false);
                        setEventEndTimeDate(new Date());
                        setEventError(null);
                        setEditingEventId(null);
                        // Closing the modal during the tour ends it.
                        if (showItineraryTips && isModalTip(ITINERARY_TIPS[itineraryTipIndex]?.target)) {
                          setShowItineraryTips(false);
                          setItineraryTipIndex(0);
                        }
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
                        const endTime24 = eventEndTimeEnabled ? formatTime24(eventEndTimeDate) : undefined;
                        if (endTime24 && endTime24 <= time) {
                          setEventError('End time must be after start time.');
                          return;
                        }

                        const itemInput = {
                          name,
                          startTime: time,
                          endTime: endTime24 ?? null,
                          location: location || null,
                          notes: notes || null,
                          tickets: eventTickets,
                        };
                        if (editingEventId) {
                          updateItineraryItem(tripId, selectedDayId, editingEventId, itemInput);
                        } else {
                          addItineraryItem(tripId, selectedDayId, itemInput);
                        }

                        setEventModalVisible(false);
                        setEventName('');
                        setEventTime('');
                        setEventLocation('');
                        setEventNotes('');
                        setEventTickets([]);
                        setEventEndTimeEnabled(false);
                        setEventEndTimeDate(new Date());
                        setEventError(null);
                        setEditingEventId(null);
                        // Saving while on a modal tip ends the tour.
                        if (showItineraryTips && isModalTip(ITINERARY_TIPS[itineraryTipIndex]?.target)) {
                          setShowItineraryTips(false);
                          setItineraryTipIndex(0);
                        }
                      }}>
                      <ThemedText style={[styles.modalButtonText, styles.modalPrimaryButtonText]}>Save</ThemedText>
                    </Pressable>
                  </View>
                </View>

                {/* Tips that anchor to fields inside this modal render here so they sit above the modal layer. */}
                {isModalTip(ITINERARY_TIPS[displayedTipIndex]?.target) && renderTipBubble()}
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
              <ThemedText style={styles.financesTotalLabel}>Your Total</ThemedText>
              {(() => {
                const myShareByCurrency = expenses.reduce<Record<string, number>>((acc, e) => {
                  const currency = e.currency || 'USD';
                  const payer = e.paidBy ?? e.createdBy;
                  const isPayer = !isSharedTrip || payer === uid || !payer;
                  const isSplitWithMe = e.splitWith?.includes(uid ?? '') ?? false;
                  let share = 0;
                  if (e.isSplit && e.splitType === 'even' && e.splitWith && e.splitWith.length > 0) {
                    const perPerson = e.amount / (e.splitWith.length + 1);
                    if (isPayer || isSplitWithMe) share = perPerson;
                  } else if (isPayer) {
                    share = e.amount;
                  }
                  acc[currency] = (acc[currency] ?? 0) + share;
                  return acc;
                }, {});

                // Attempt to sum everything in home currency
                let homeTotal = 0;
                let allConverted = true;
                for (const [currency, amount] of Object.entries(myShareByCurrency)) {
                  if (amount <= 0) continue;
                  const converted = convertToHome(amount, currency);
                  if (converted === null) { allConverted = false; break; }
                  homeTotal += converted;
                }

                const originalParts = Object.entries(myShareByCurrency)
                  .filter(([, amount]) => amount > 0)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([currency, amount]) => `${amount.toFixed(2)} ${currency}`);

                const hasMultipleCurrencies = originalParts.length > 1 ||
                  (originalParts.length === 1 && !originalParts[0].endsWith(homeCurrency));

                return (
                  <View>
                    <ThemedText numberOfLines={2} style={styles.financesTotalValue}>
                      {allConverted && originalParts.length > 0
                        ? `${homeTotal.toFixed(2)} ${homeCurrency}`
                        : originalParts.length ? originalParts.join(' | ') : '0.00'}
                    </ThemedText>
                    {allConverted && hasMultipleCurrencies && originalParts.length > 0 && (
                      <ThemedText style={[styles.financesTotalSub, { color: colors.icon }]}>
                        {originalParts.join(' | ')}
                      </ThemedText>
                    )}
                  </View>
                );
              })()}
            </ThemedView>

            {(() => {
              const myExpenses = expenses.filter((e) => {
                const payer = e.paidBy ?? e.createdBy;
                const isPayer = !isSharedTrip || payer === uid || !payer;
                const isSplitWithMe = e.splitWith?.includes(uid ?? '') ?? false;
                return isPayer || isSplitWithMe;
              });
              return myExpenses.length > 0 ? (
              <ThemedView style={styles.financesList}>
                {myExpenses.map((e) => (
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
                        splitType: e.splitType,
                        splitWith: e.splitWith,
                        paidBy: e.paidBy,
                        createdBy: e.createdBy,
                      });
                    }}>
                    <View style={styles.financeHeaderRow}>
                      <ThemedText style={styles.financeName}>{e.name || 'Expense'}</ThemedText>
                      <View style={{ alignItems: 'flex-end' }}>
                        {(() => {
                          const converted = convertToHome(e.amount, e.currency);
                          const showOriginal = e.currency !== homeCurrency;
                          if (converted !== null && showOriginal) {
                            return (
                              <>
                                <ThemedText style={styles.financeAmount}>
                                  {converted.toFixed(2)} {homeCurrency}
                                </ThemedText>
                                <ThemedText style={[styles.financeMeta, { color: colors.icon }]}>
                                  {e.amount.toFixed(2)} {e.currency}
                                </ThemedText>
                              </>
                            );
                          }
                          return (
                            <ThemedText style={styles.financeAmount}>
                              {e.amount.toFixed(2)} {e.currency}
                            </ThemedText>
                          );
                        })()}
                      </View>
                    </View>
                    <View style={styles.financeMetaRow}>
                      {e.isSplit && e.splitWith && e.splitWith.length > 0 ? (
                        <ThemedText style={styles.financeMeta}>
                          {'Even split · '}
                          {(() => {
                            const perPerson = e.amount / (e.splitWith.length + 1);
                            const converted = convertToHome(perPerson, e.currency);
                            if (converted !== null && e.currency !== homeCurrency) {
                              return `${converted.toFixed(2)} ${homeCurrency} (${perPerson.toFixed(2)} ${e.currency})`;
                            }
                            return `${perPerson.toFixed(2)} ${e.currency}`;
                          })()}
                          {' each · '}
                          {e.splitWith.length + 1} people
                        </ThemedText>
                      ) : e.isSplit ? (
                        <ThemedText style={styles.financeMeta}>Split</ThemedText>
                      ) : null}
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
                                splitType: e.splitType,
                                splitWith: e.splitWith,
                                paidBy: e.paidBy,
                                createdBy: e.createdBy,
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
            );
            })()}

            {/* Settle Up — only for trips with 2+ accepted members */}
            {(() => {
              if (!isSharedTrip || !bundle || !tripId) return null;
              const members = tripPeople;
              if (members.length < 2) return null;

              const splitExpenses = bundle.expenses.filter(
                (e) => e.splitType !== 'none' && e.splits.length > 1,
              );
              if (!splitExpenses.length) return null;

              // Balance math lives in @shmoves/core so web and phone can
              // never disagree (ADR 0006).
              const { balances, skippedCount, skippedCurrencies } = computeBalances(
                splitExpenses,
                members.map((m) => m.id),
                (amount, currency) => convertToHome(amount, currency || homeCurrency),
              );
              const transfers = computeTransfers(balances);

              const nameOf = (id: string) =>
                id === uid ? 'You' : (members.find((m) => m.id === id)?.name ?? '—');

              const settlements = bundle.settlements;
              const isSettled = (from: string, to: string) => isPairSettled(settlements, from, to);
              const toggleSettlement = (from: string, to: string) => {
                if (isSettled(from, to)) {
                  unmarkSettled(tripId, from, to);
                } else {
                  markSettled(tripId, from, to);
                }
              };

              const youTransfers = transfers.filter((t) => t.from === uid || t.to === uid);
              const otherTransfers = transfers.filter((t) => t.from !== uid && t.to !== uid);

              // A transfer row with optional checkbox
              const TransferRow = ({
                t, rowKey, showCheck,
              }: { t: { from: string; to: string; amount: number }; rowKey: string; showCheck: boolean }) => {
                const settled = isSettled(t.from, t.to);
                const isDebtor = t.from === uid;
                const canToggle = showCheck && (isDebtor || settled);
                return (
                  <Pressable
                    key={rowKey}
                    onPress={canToggle ? () => toggleSettlement(t.from, t.to) : undefined}
                    style={[styles.settleRow, settled && { opacity: 0.45 }]}>
                    {showCheck && (
                      <View style={[
                        styles.settleCheckbox,
                        { borderColor: settled ? colors.primary : (canToggle ? colors.border : 'transparent'), backgroundColor: settled ? colors.primary : colors.surface },
                      ]}>
                        {settled && <ThemedText style={{ color: '#fff', fontSize: 10, lineHeight: 14 }}>✓</ThemedText>}
                      </View>
                    )}
                    <ThemedText style={{ color: colors.text, flex: 1, textDecorationLine: settled ? 'line-through' : 'none' }}>
                      {t.from === uid
                        ? `You owe ${nameOf(t.to)}`
                        : t.to === uid
                        ? `${nameOf(t.from)} owes you`
                        : `${nameOf(t.from)} owes ${nameOf(t.to)}`}
                    </ThemedText>
                    <ThemedText style={{
                      fontWeight: '700',
                      color: settled ? colors.icon : (t.from === uid ? colors.destructive : (t.to === uid ? colors.primary : colors.text)),
                    }}>
                      {t.amount.toFixed(2)} {homeCurrency}
                    </ThemedText>
                  </Pressable>
                );
              };

              const allSettled = transfers.length > 0 && transfers.every((t) => isSettled(t.from, t.to));

              return (
                <ThemedView style={[styles.financeCard, { borderColor: colors.border, backgroundColor: colors.surface, marginTop: 12 }]}>
                  <ThemedText style={[styles.financesTotalLabel, { marginBottom: 8 }]}>Settle Up</ThemedText>

                  {skippedCount > 0 && (
                    <ThemedText style={[styles.financeMeta, { color: colors.icon, marginBottom: 8 }]}>
                      {skippedCount === 1 ? '1 expense' : `${skippedCount} expenses`}
                      {skippedCurrencies.length > 0 ? ` in ${skippedCurrencies.join(', ')}` : ''}
                      {' couldn\'t be converted — rate unavailable.'}
                    </ThemedText>
                  )}

                  {transfers.length === 0 || allSettled ? (
                    <ThemedText style={[styles.financeMeta, { color: colors.icon }]}>
                      You&apos;re all settled up 🎉
                    </ThemedText>
                  ) : null}

                  {transfers.length > 0 && (
                    <>
                      {youTransfers.length > 0 && (
                        <View style={{ marginBottom: 8 }}>
                          <ThemedText style={[styles.checkboxLabel, { marginBottom: 4 }]}>You</ThemedText>
                          {youTransfers.map((t, i) => (
                            <TransferRow key={`you-${i}`} t={t} rowKey={`you-${i}`} showCheck />
                          ))}
                        </View>
                      )}

                      {otherTransfers.length > 0 && (
                        <>
                          <Pressable
                            onPress={() => setAllTransfersExpanded((v) => !v)}
                            style={[styles.settleRow, { paddingVertical: 6 }]}>
                            <ThemedText style={{ color: colors.icon, flex: 1, fontWeight: '600' }}>
                              {`All transfers (${otherTransfers.length})`}
                            </ThemedText>
                            <IconSymbol name={allTransfersExpanded ? 'chevron.down' : 'chevron.right'} size={14} color={colors.icon} />
                          </Pressable>
                          {allTransfersExpanded && otherTransfers.map((t, i) => (
                            <TransferRow key={`all-${i}`} t={t} rowKey={`all-${i}`} showCheck={false} />
                          ))}
                        </>
                      )}
                    </>
                  )}
                </ThemedView>
              );
            })()}

            <Modal visible={expenseModalVisible} transparent animationType="fade">
              <View style={styles.modalOverlay}>
                <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
                  <ThemedText style={styles.modalTitle}>{editingExpenseId ? 'Edit Expense' : 'Add Expense'}</ThemedText>

                  <TextInput
                    value={expenseName}
                    onChangeText={setExpenseName}
                    placeholder="Name"
                    placeholderTextColor="#888"
                    style={[styles.modalInput, { borderColor: colors.border, color: colors.inputText }]}
                  />

                  <View style={[styles.modalInput, { borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }]}>
                    <ThemedText style={{ fontSize: 16, fontWeight: '600', color: colors.icon, marginRight: 8 }}>
                      {CURRENCY_SYMBOLS[expenseCurrency] ?? expenseCurrency}
                    </ThemedText>
                    <TextInput
                      value={expenseAmount}
                      onChangeText={setExpenseAmount}
                      placeholder="Amount"
                      placeholderTextColor="#888"
                      keyboardType="decimal-pad"
                      style={{ flex: 1, fontSize: 16, color: colors.inputText, paddingVertical: 0 }}
                    />
                  </View>

                  {(() => {
                    const destCurrency = inferDestinationCurrency(trip?.destination ?? '');
                    const chips = [
                      { label: 'Home', code: homeCurrency },
                      ...(destCurrency && destCurrency !== homeCurrency
                        ? [{ label: 'Destination', code: destCurrency }]
                        : []),
                    ];
                    return (
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                        {chips.map(chip => {
                          const isActive = expenseCurrency === chip.code;
                          return (
                            <Pressable
                              key={chip.code}
                              onPress={() => setExpenseCurrency(chip.code)}
                              style={[
                                styles.currencyChip,
                                {
                                  borderColor: isActive ? colors.primary : colors.border,
                                  backgroundColor: isActive ? colors.primary + '18' : colors.surfaceMuted,
                                },
                              ]}>
                              <ThemedText style={{ fontSize: 15, fontWeight: '800', color: isActive ? colors.primary : colors.text }}>
                                {chip.code}
                              </ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    );
                  })()}

                  {/* Paid by — only useful with 2+ members */}
                  {isSharedTrip && (
                    <Pressable
                      style={[styles.checkboxRow, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
                      onPress={() => setPaidByPickerVisible(true)}>
                      <ThemedText style={[styles.checkboxLabel, { flex: 1 }]}>Paid by</ThemedText>
                      <ThemedText style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
                        {paidBy === uid ? 'You' : (tripPeople.find((p) => p.id === paidBy)?.name ?? '—')}
                      </ThemedText>
                      <IconSymbol name="chevron.right" size={14} color={colors.icon} style={{ marginLeft: 4 }} />
                    </Pressable>
                  )}

                  {/* Paid-by picker modal */}
                  <Modal visible={paidByPickerVisible} transparent animationType="slide">
                    <View style={styles.modalOverlay}>
                      <View style={[styles.modalCard, { backgroundColor: colors.surface, maxHeight: '70%' }]}>
                        <ThemedText style={styles.modalTitle}>Paid by</ThemedText>
                        <ScrollView style={{ marginBottom: 8 }} showsVerticalScrollIndicator={false}>
                          {tripPeople.map((p) => {
                            const selected = paidBy === p.id;
                            return (
                              <Pressable
                                key={p.id}
                                style={[styles.currencyRow, { borderBottomColor: colors.border, alignItems: 'center' }, selected && { backgroundColor: colors.surfaceMuted }]}
                                onPress={() => { setPaidBy(p.id); setPaidByPickerVisible(false); }}>
                                <View style={[styles.checkboxBox, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface, marginRight: 10, flexShrink: 0 }]} />
                                <ThemedText style={{ color: colors.text, flex: 1 }}>
                                  {p.id === uid ? 'You' : p.name}
                                </ThemedText>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                        <Pressable
                          style={[styles.modalButton, { borderColor: colors.border, alignSelf: 'center' }]}
                          onPress={() => setPaidByPickerVisible(false)}>
                          <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  </Modal>

                  {/* Split button — shows current selection */}
                  <Pressable
                    style={[styles.checkboxRow, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
                    onPress={() => setExpenseStep('split-type')}>
                    <ThemedText style={[styles.checkboxLabel, { flex: 1 }]}>Split</ThemedText>
                    <ThemedText style={{ color: splitMode !== 'none' ? colors.primary : colors.icon, fontSize: 13 }}>
                      {splitMode === 'even'
                        ? splitWith.length > 0 ? `Even · ${splitWith.length + 1} people` : 'Even'
                        : splitMode === 'uneven' ? 'Uneven'
                        : 'None'}
                    </ThemedText>
                    <IconSymbol name="chevron.right" size={14} color={colors.icon} style={{ marginLeft: 4 }} />
                  </Pressable>

                  {/* Step 2: Split type — None / Even / Uneven */}
                  <Modal visible={expenseStep === 'split-type'} transparent animationType="slide">
                    <View style={styles.modalOverlay}>
                      <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
                        <ThemedText style={styles.modalTitle}>How to Split?</ThemedText>

                        {(['none', 'even', 'uneven'] as const).map((option) => {
                          const isDisabled = option === 'uneven';
                          const isSelected = pendingSplitMode === option;
                          const label = option === 'none' ? 'None' : option === 'even' ? 'Even' : 'Uneven';
                          return (
                            <Pressable
                              key={option}
                              disabled={isDisabled}
                              style={[
                                styles.modalButton,
                                { borderColor: isSelected ? colors.primary : colors.border, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
                                isSelected && { backgroundColor: colors.primary + '18' },
                                isDisabled && { opacity: 0.4 },
                              ]}
                              onPress={() => setPendingSplitMode(option)}>
                              <View style={[styles.checkboxBox, { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary : colors.surface, marginRight: 10, flexShrink: 0 }]} />
                              <ThemedText style={[styles.modalButtonText, isSelected && { color: colors.primary, fontWeight: '700' }]}>{label}</ThemedText>
                              {isDisabled && (
                                <ThemedText style={{ color: colors.icon, fontSize: 12, marginLeft: 6 }}>(coming soon)</ThemedText>
                              )}
                            </Pressable>
                          );
                        })}

                        <View style={[styles.modalActions, { marginTop: 8 }]}>
                          <Pressable
                            style={[styles.modalButton, { borderColor: colors.border }]}
                            onPress={() => {
                              setPendingSplitMode(splitMode);
                              setExpenseStep('details');
                            }}>
                            <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
                          </Pressable>
                          <Pressable
                            style={[styles.modalButton, styles.modalPrimaryButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                            onPress={() => {
                              setSplitMode(pendingSplitMode);
                              if (pendingSplitMode === 'none') setSplitWith([]);
                              if (pendingSplitMode === 'even') {
                                setExpenseStep('split-members');
                              } else {
                                setExpenseStep('details');
                              }
                            }}>
                            <ThemedText style={[styles.modalButtonText, styles.modalPrimaryButtonText]}>Confirm</ThemedText>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  </Modal>

                  {/* Step 3: Member selection (even split) */}
                  <Modal visible={expenseStep === 'split-members'} transparent animationType="slide">
                    <View style={styles.modalOverlay}>
                      <View style={[styles.modalCard, { backgroundColor: colors.surface, maxHeight: '70%' }]}>
                        <ThemedText style={styles.modalTitle}>Split With</ThemedText>
                        {splitWith.length > 0 && (
                          <ThemedText style={{ color: colors.primary, fontSize: 13, marginBottom: 8, textAlign: 'center', fontWeight: '600' }}>
                            {expenseCurrency} {(expenseAmountValue / (splitWith.length + 1)).toFixed(2)} per person
                          </ThemedText>
                        )}
                        <ScrollView style={{ marginBottom: 8 }} showsVerticalScrollIndicator={false}>
                          {tripPeople
                            .filter((p) => p.id !== (paidBy ?? uid))
                            .map((p) => {
                              const selected = splitWith.includes(p.id);
                              return (
                                <Pressable
                                  key={p.id}
                                  style={[styles.currencyRow, { borderBottomColor: colors.border, alignItems: 'center' }]}
                                  onPress={() => setSplitWith((prev) => selected ? prev.filter((id) => id !== p.id) : [...prev, p.id])}>
                                  <View style={[styles.checkboxBox, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface, marginRight: 10, flexShrink: 0 }]} />
                                  <ThemedText style={{ color: colors.text, flex: 1 }}>{p.name}</ThemedText>
                                  {selected && (
                                    <ThemedText style={{ color: colors.icon, fontSize: 12 }}>
                                      {expenseCurrency} {(expenseAmountValue / (splitWith.length + 1)).toFixed(2)}
                                    </ThemedText>
                                  )}
                                </Pressable>
                              );
                            })}
                        </ScrollView>
                        <View style={styles.modalActions}>
                          <Pressable
                            style={[styles.modalButton, { borderColor: colors.border }]}
                            onPress={() => {
                              setSplitMode('none');
                              setPendingSplitMode('none');
                              setSplitWith([]);
                              setExpenseStep('details');
                            }}>
                            <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
                          </Pressable>
                          <Pressable
                            style={[styles.modalButton, styles.modalPrimaryButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                            onPress={() => setExpenseStep('details')}>
                            <ThemedText style={[styles.modalButtonText, styles.modalPrimaryButtonText]}>Confirm</ThemedText>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  </Modal>

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
                        const amount = expenseAmountValue;

                        if (!expenseName.trim()) {
                          setExpenseError('Name is required.');
                          return;
                        }
                        if (!Number.isFinite(amount) || amount <= 0) {
                          setExpenseError('Please enter a valid amount.');
                          return;
                        }

                        // Participants include the payer (canonical split model).
                        const effectivePayer = paidBy ?? uid ?? null;
                        const participantIds =
                          splitMode === 'even' && effectivePayer
                            ? [effectivePayer, ...splitWith.filter((pid) => pid !== effectivePayer)]
                            : [];
                        const expenseInput = {
                          name: expenseName.trim(),
                          amount,
                          currency,
                          paidBy: effectivePayer,
                          participantIds,
                        };
                        if (editingExpenseId) {
                          updateExpense(tripId, editingExpenseId, expenseInput);
                        } else {
                          addExpense(tripId, expenseInput);
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
    }
  };

  // Renders the tip bubble. Called from two places:
  // - the main tree (for tips whose target lives outside any modal)
  // - inside the Add Event modal (for tips whose target is a field within it)
  const renderTipBubble = () => {
    if (!tipVisible) return null;
    const displayedTip = ITINERARY_TIPS[displayedTipIndex];

    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 9999 }]} pointerEvents="box-none">
        <RNAnimated.View
          pointerEvents={showItineraryTips ? 'box-none' : 'none'}
          style={[
            styles.tipBubblePositioned,
            { backgroundColor: colors.surface },
            tipPosition,
            bubbleAnimStyle,
          ]}>

          <View style={styles.tipDots}>
            {ITINERARY_TIPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.tipDot,
                  {
                    backgroundColor: i === displayedTipIndex ? colors.primary : colors.border,
                    width: i === displayedTipIndex ? 18 : 6,
                  },
                ]}
              />
            ))}
          </View>

          <View style={{ gap: 6 }}>
            <ThemedText style={[styles.tipLabel, { color: colors.primary }]}>TIP</ThemedText>
            <ThemedText style={[styles.tipText, { color: colors.text }]}>
              {displayedTip?.text}
            </ThemedText>
          </View>

          <View style={styles.tipActions}>
            <View />
            {displayedTipIndex >= 2 && displayedTipIndex < ITINERARY_TIPS.length - 1 ? (
              <Pressable
                style={[styles.tipPillButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  const next = displayedTipIndex + 1;
                  if (ITINERARY_TIPS[next]?.target === 'center') setEventModalVisible(false);
                  setItineraryTipIndex(next);
                }}>
                <ThemedText style={styles.tipPillButtonText}>Next →</ThemedText>
              </Pressable>
            ) : displayedTipIndex === ITINERARY_TIPS.length - 1 ? (
              <Pressable
                style={[styles.tipPillButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  setShowItineraryTips(false);
                  setItineraryTipIndex(0);
                }}>
                <ThemedText style={styles.tipPillButtonText}>Got it ✓</ThemedText>
              </Pressable>
            ) : null}
          </View>

          {ITINERARY_TIPS[displayedTipIndex]?.target !== 'center' && (
            arrowDirection === 'up'
              ? <View style={[styles.tipArrowUp, { borderBottomColor: colors.surface, left: arrowLeft }]} />
              : <View style={[styles.tipArrowDown, { borderTopColor: colors.surface, left: arrowLeft }]} />
          )}
        </RNAnimated.View>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
          listener: () => {
            if (showItineraryTips) setShowItineraryTips(false);
            if (showOverviewTips) setShowOverviewTips(false);
          },
        })}
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
            <View
              style={[
                styles.heroDetailsCard,
                styles.stickyDetailsCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  marginTop: insets.top + 2,
                },
              ]}
              pointerEvents="none">
              <View style={styles.heroCardInner}>
                <Animated.View style={{ flex: 1, opacity: stickyFadeAnim }}>
                  <ThemedText style={[styles.tripDestination, { color: colors.text }]}>{trip?.destination ?? ''}</ThemedText>
                  <ThemedText style={[styles.tripLocationText, { color: colors.icon }]}>
                    {formatTripDateRange(trip?.startDate, trip?.endDate)}
                  </ThemedText>
                </Animated.View>
                <Animated.View style={[styles.heroAvatarsRow, { opacity: stickyIconsFadeAnim }]}>
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
                </Animated.View>
              </View>
            </View>
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
            {activeTab !== 'finances' ? null : (
              <Pressable
                style={[
                  styles.globalPlusButton,
                  styles.globalPlusButtonPill,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => {
                  if (!tripId) return;
                  openExpenseModal();
                }}>
                <IconSymbol name="plus" size={22} color={colors.primary} />
                <ThemedText numberOfLines={1} style={[styles.globalPlusLabel, { color: colors.primary }]}>
                  Add Expense
                </ThemedText>
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
        {activeTab === 'overview' ? (
          <View ref={overviewHelpButtonRef} collapsable={false}>
            <Pressable
              style={[styles.bottomNavButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => {
                setShowOverviewTips(true);
                setOverviewTipIndex(0);
              }}>
              <IconSymbol name="questionmark.circle" size={22} color={colors.primary} />
            </Pressable>
          </View>
        ) : null}

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

      {/* Tips that anchor to elements outside the modal render here. */}
      {!isModalTip(ITINERARY_TIPS[displayedTipIndex]?.target) && renderTipBubble()}
      {renderOverviewTipBubble()}

      <TripInviteSheet
        visible={inviteSheetVisible}
        onClose={() => setInviteSheetVisible(false)}
        existingMemberIds={new Set(bundle?.members.map((m) => m.userId) ?? [])}
        onInviteById={handleInviteById}
        onShareLink={handleShareLink}
      />

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
    paddingBottom: 200,
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
    marginBottom: -10,
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
  housingCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  housingCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  housingCheckboxTick: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  housingCheckboxLabel: {
    fontSize: 14,
    opacity: 0.8,
  },
  comingUpCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
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
    gap: 12,
  },
  comingUpRow: {
    gap: 6,
  },
  comingUpLabel: {
    fontSize: 11,
    opacity: 0.6,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  comingUpValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  comingUpSubvalue: {
    fontSize: 13,
    opacity: 0.75,
    fontWeight: '500',
  },
  comingUpDivider: {
    height: 1,
    opacity: 0.3,
  },
  todayEventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 2,
  },
  todayEventTime: {
    fontSize: 13,
    fontWeight: '700',
    opacity: 0.6,
    width: 60,
    paddingTop: 1,
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
    alignItems: 'flex-start',
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
  financesTotalSub: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right',
    marginTop: 2,
  },
  settleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  settleCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
  currencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  currencyChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 2,
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
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: 14,
    gap: 12,
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
