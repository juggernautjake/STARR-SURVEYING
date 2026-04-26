import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { LoadingSplash } from '@/lib/LoadingSplash';
import { useDataPoint } from '@/lib/dataPoints';
import { lookupPrefix } from '@/lib/dataPointCodes';
import { colors } from '@/lib/theme';

/**
 * Photo-capture placeholder — F3 #3 lands here.
 *
 * For F3 #2 we route here after a successful point save so the user
 * sees their work landed (point is in local SQLite, will sync to
 * Supabase when reachable). F3 #3 replaces this body with the
 * multi-photo capture UI: camera comes up immediately, bottom toolbar
 * with photo / video / voice / notes, "Done" returns to the job page.
 */
export default function PointPhotosScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  const { pointId } = useLocalSearchParams<{ pointId: string }>();
  const { point, isLoading } = useDataPoint(pointId);

  if (isLoading) return <LoadingSplash />;

  if (!point) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: palette.background }]}
        edges={['top']}
      >
        <View style={styles.body}>
          <Text style={[styles.title, { color: palette.text }]}>
            Point not found
          </Text>
          <Text style={[styles.caption, { color: palette.muted }]}>
            The point may have been deleted, or hasn&apos;t synced to this
            device yet.
          </Text>
          <Button label="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const prefixInfo = lookupPrefix(point.code_category);
  const hasGps = point.device_lat != null && point.device_lon != null;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View
          style={[
            styles.tag,
            { backgroundColor: prefixInfo.color },
          ]}
        >
          <Text style={styles.tagText}>{point.code_category ?? '—'}</Text>
        </View>
        <Text style={[styles.heading, { color: palette.text }]} numberOfLines={2}>
          {point.name}
        </Text>
        <Text style={[styles.subtitle, { color: palette.muted }]}>
          {prefixInfo.label}
          {hasGps
            ? ` · ${point.device_lat?.toFixed(5)}, ${point.device_lon?.toFixed(5)}`
            : ' · no GPS fix'}
        </Text>

        {point.description ? (
          <View
            style={[
              styles.descriptionBox,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.description, { color: palette.text }]}>
              {point.description}
            </Text>
          </View>
        ) : null}

        <View
          style={[
            styles.placeholder,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.placeholderTitle, { color: palette.text }]}>
            Saved.
          </Text>
          <Text style={[styles.placeholderBody, { color: palette.muted }]}>
            Photos / video / voice memos attach here in the next batch
            (F3 #3). The point row is in your device&apos;s database and
            will sync to the office when you&apos;re back online.
          </Text>
        </View>

        <Button
          label="Done"
          onPress={() =>
            point.job_id
              ? router.replace(`/(tabs)/jobs/${point.job_id}`)
              : router.replace('/(tabs)/jobs')
          }
          accessibilityHint="Returns to the job detail page."
        />

        <View style={{ height: 12 }} />

        <Button
          variant="secondary"
          label="Capture another point"
          onPress={() => router.replace('/(tabs)/capture')}
          accessibilityHint="Starts a new point capture flow."
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
  },
  body: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  tagText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: 'Menlo',
  },
  heading: {
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 24,
    lineHeight: 20,
  },
  descriptionBox: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 24,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  placeholder: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  placeholderBody: {
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  caption: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
});
