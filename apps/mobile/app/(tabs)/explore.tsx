import { useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function TabTwoScreen() {
  const { destination, startDate, endDate } = useLocalSearchParams<{
    destination?: string;
    startDate?: string;
    endDate?: string;
  }>();

  const formatParamDate = (value?: string) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString();
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText>Destination: {destination || ''}</ThemedText>
      <ThemedText>Start date: {formatParamDate(startDate)}</ThemedText>
      <ThemedText>End date: {formatParamDate(endDate)}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
  },
});
