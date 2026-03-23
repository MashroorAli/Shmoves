import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useTrips } from '@/context/trips-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function HomeScreen() {
  const { addTrip } = useTrips();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme];
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [activePicker, setActivePicker] = useState<'start' | 'end' | null>(null);
  const [draftDate, setDraftDate] = useState<Date>(new Date());

  const [errors, setErrors] = useState<{ destination?: string; startDate?: string; endDate?: string }>({});
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [cityQuery, setCityQuery] = useState('');

  const cities = [
    'Bangkok, Thailand',
    'Paris, France',
    'Lisbon, Portugal',
    'London, United Kingdom',
    'Dubai, UAE',
    'Singapore',
    'New York City, USA',
    'Hong Kong',
    'Istanbul, Turkey',
    'Kuala Lumpur, Malaysia',
    'Tokyo, Japan',
    'Antalya, Turkey',
    'Seoul, South Korea',
    'Osaka, Japan',
    'Phuket, Thailand',
    'Mecca, Saudi Arabia',
    'Pattaya, Thailand',
    'Shenzhen, China',
    'Milan, Italy',
    'Taipei, Taiwan',
    'Rome, Italy',
    'Guangzhou, China',
    'Delhi, India',
    'Shanghai, China',
    'Barcelona, Spain',
    'Agra, India',
  ];

  const filteredCities = useMemo(() =>
    cities.filter((city) =>
      city.toLowerCase().includes(cityQuery.toLowerCase())
    ), [cityQuery]
  );

  const onCitySelect = (city: string) => {
    setDestination(city);
    setCityQuery(city);
    setShowCityDropdown(false);
    if (errors.destination) {
      setErrors((prev) => ({ ...prev, destination: undefined }));
    }
  };

  const onDestinationChange = (value: string) => {
    setCityQuery(value);
    setDestination(value);
    setShowCityDropdown(value.trim().length > 0);
    if (errors.destination) {
      setErrors((prev) => ({ ...prev, destination: undefined }));
    }
  };

  const onDestinationBlur = () => {
    // If the current value doesn't exactly match a city, clear it
    if (cityQuery && !cities.includes(cityQuery)) {
      setCityQuery('');
      setDestination('');
      setErrors((prev) => ({ ...prev, destination: 'Please select a city from the list.' }));
    }
    setShowCityDropdown(false);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const safeDate = (value?: Date) => {
    const d = value instanceof Date ? value : undefined;
    return d && !Number.isNaN(d.getTime()) ? d : new Date();
  };

  const formatDate = (date?: Date) => {
    if (!date) return '';
    return date.toLocaleDateString();
  };

  const minSelectableDate = (() => {
    if (activePicker === 'end' && startDate instanceof Date && !Number.isNaN(startDate.getTime())) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      return start > today ? start : today;
    }
    return today;
  })();

  const clampToMinDate = (value: Date) => {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d < minSelectableDate ? minSelectableDate : value;
  };

  const canSubmit = destination.trim().length > 0 && !!startDate && !!endDate;

  const onSubmit = () => {
    const nextErrors: { destination?: string; startDate?: string; endDate?: string } = {};

    if (destination.trim().length === 0) nextErrors.destination = 'Destination is required.';
    if (!startDate) nextErrors.startDate = 'Start date is required.';
    if (!endDate) nextErrors.endDate = 'End date is required.';

    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      nextErrors.endDate = 'End date must be on or after start date.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    addTrip({
      destination: destination.trim(),
      startDate: startDate ? startDate.toISOString() : '',
      endDate: endDate ? endDate.toISOString() : '',
    });

    router.push('/my-trips');
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Shmoves</ThemedText>

      <ThemedView style={styles.section}>
        <ThemedText style={styles.label}>Where are you going?</ThemedText>
        <View style={styles.typeaheadContainer}>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.inputText },
              errors.destination ? styles.inputError : undefined,
            ]}
            placeholder="Destination"
            placeholderTextColor="#888"
            value={cityQuery}
            onChangeText={onDestinationChange}
            onFocus={() => setShowCityDropdown(cityQuery.trim().length > 0)}
            onBlur={onDestinationBlur}
          />
          {!!showCityDropdown && filteredCities.length > 0 && (
            <View style={[styles.cityDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
                {filteredCities.map((city: string) => (
                  <Pressable
                    key={city}
                    style={[styles.cityOption, { borderBottomColor: colors.surfaceMuted }]}
                    onPress={() => onCitySelect(city)}>
                    <ThemedText>{city}</ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
        {!!errors.destination && <ThemedText style={styles.errorText}>{errors.destination}</ThemedText>}

        <ThemedText style={styles.label}>When are you going?</ThemedText>

        <Pressable
          onPress={() => {
            const initial = safeDate(startDate);
            setDraftDate(clampToMinDate(initial));
            setActivePicker('start');
          }}
          style={[styles.inputButton, { borderColor: colors.border }, errors.startDate ? styles.inputError : undefined]}>
          <ThemedText style={[styles.inputButtonText, { color: colors.inputText }]}>
            {startDate ? formatDate(startDate) : 'Start date'}
          </ThemedText>
        </Pressable>
        {!!errors.startDate && <ThemedText style={styles.errorText}>{errors.startDate}</ThemedText>}

        <Pressable
          onPress={() => {
            const initial = safeDate(endDate);
            setDraftDate(clampToMinDate(initial));
            setActivePicker('end');
          }}
          style={[styles.inputButton, { borderColor: colors.border }, errors.endDate ? styles.inputError : undefined]}>
          <ThemedText style={[styles.inputButtonText, { color: colors.inputText }]}>
            {endDate ? formatDate(endDate) : 'End date'}
          </ThemedText>
        </Pressable>
        {!!errors.endDate && <ThemedText style={styles.errorText}>{errors.endDate}</ThemedText>}

        <Pressable
          onPress={onSubmit}
          style={[
            styles.submitButton,
            { backgroundColor: colors.primary },
            !canSubmit ? styles.submitButtonDisabled : undefined,
          ]}>
          <ThemedText style={styles.submitButtonText}>Submit</ThemedText>
        </Pressable>
      </ThemedView>

      <Modal
        visible={activePicker !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setActivePicker(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setActivePicker(null)} style={styles.modalButton}>
                <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
              </Pressable>

              <ThemedText style={styles.modalTitle}>
                {activePicker === 'start' ? 'Start date' : 'End date'}
              </ThemedText>
              <Pressable
                onPress={() => {
                  if (activePicker === 'start') {
                    setStartDate(draftDate);
                    if (errors.startDate) setErrors((prev) => ({ ...prev, startDate: undefined }));
                  }
                  if (activePicker === 'end') {
                    setEndDate(draftDate);
                    if (errors.endDate) setErrors((prev) => ({ ...prev, endDate: undefined }));
                  }
                  setActivePicker(null);
                }}
                style={styles.modalButton}>
                <ThemedText style={styles.modalButtonText}>Done</ThemedText>
              </Pressable>
            </View>

            <DateTimePicker
              value={safeDate(draftDate)}
              mode="date"
              display="spinner"
              minimumDate={minSelectableDate}
              onChange={(_event: DateTimePickerEvent, date?: Date) => {
                if (date instanceof Date && !Number.isNaN(date.getTime())) {
                  setDraftDate(clampToMinDate(date));
                }
              }}
            />
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  section: {
    width: '100%',
    marginTop: 16,
    maxWidth: 320,
  },
  label: {
    marginBottom: 8,
    fontSize: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  typeaheadContainer: {
    position: 'relative',
    zIndex: 1,
  },
  cityDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderTopWidth: 0,
    borderRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    zIndex: 2,
  },
  cityOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  inputError: {
    borderColor: '#d33',
  },
  errorText: {
    marginTop: -6,
    marginBottom: 12,
    color: '#d33',
    fontSize: 13,
  },
  inputButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  inputButtonText: {
    fontSize: 16,
    color: '#111',
  },
  submitButton: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    paddingTop: 12,
    paddingBottom: 24,
    borderRadius: 16,
    width: '100%',
    maxWidth: 360,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});