/**
 * "My personal kit" Me-tab section.
 *
 * Phase F10.8 §5.12.9.4 — personal-kit flag. Lists every
 * equipment_inventory row marked `is_personal=true` AND
 * `owner_user_id = me`. These are the surveyor&apos;s own field
 * tools (hammers, machetes, gloves) — tracked for chain-of-
 * custody but NOT actively managed by the EM. The §5.12.9.2 EM
 * dashboards filter these out so the EM&apos;s open-maintenance
 * count doesn&apos;t balloon with personal axes that don&apos;t
 * belong to the company.
 *
 * Each row has a Release button that flips `is_personal=false`
 * + `owner_user_id=null` after a confirmation prompt — for when
 * the surveyor sells / loses / gives away an item, or
 * mis-claimed it. The release writes an equipment_events row
 * with event_type='updated' so the §5.12.1 audit log captures
 * the change.
 *
 * Hides itself entirely when the surveyor has no personal kit
 * — no zero-state placeholder cluttering the Me tab.
 */
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { PersonalKitItem } from './equipment';
import { logError } from './log';
import { supabase } from './supabase';
import { type Palette } from './theme';

interface MyPersonalKitSectionProps {
  items: PersonalKitItem[];
  palette: Palette;
}

export function MyPersonalKitSection({
  items,
  palette,
}: MyPersonalKitSectionProps) {
  const [releasingId, setReleasingId] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function handleRelease(item: PersonalKitItem) {
    if (releasingId) return;
    Alert.alert(
      'Release personal kit',
      `Release ${item.name ?? 'this item'} from your personal kit? It returns to the company catalogue and the EM can manage it again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Release',
          style: 'destructive',
          onPress: () => {
            void doRelease(item);
          },
        },
      ]
    );
  }

  async function doRelease(item: PersonalKitItem) {
    setReleasingId(item.id);
    try {
      const { error: updateErr } = await supabase
        .from('equipment_inventory')
        .update({ is_personal: false, owner_user_id: null })
        .eq('id', item.id);
      if (updateErr) throw updateErr;
      // Audit-log the change so the EM&apos;s chain-of-custody
      // log shows the release. Best-effort: row update is the
      // canonical state; an audit failure shouldn&apos;t bubble
      // an error to the surveyor.
      try {
        await supabase.from('equipment_events').insert({
          equipment_id: item.id,
          event_type: 'updated',
          payload: {
            change: 'personal_kit_released',
            source: 'mobile_me_tab',
          },
        });
      } catch (auditErr) {
        logError(
          'MyPersonalKitSection.doRelease',
          'audit insert failed (non-fatal)',
          auditErr,
          { equipment_id: item.id }
        );
      }
    } catch (err) {
      logError(
        'MyPersonalKitSection.doRelease',
        'release update failed',
        err,
        { equipment_id: item.id }
      );
      Alert.alert(
        'Release failed',
        err instanceof Error ? err.message : 'Try again in a moment.'
      );
    } finally {
      setReleasingId(null);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.muted }]}>
        🪓 My personal kit
      </Text>
      <Text style={[styles.subtitle, { color: palette.muted }]}>
        {items.length} item{items.length === 1 ? '' : 's'} brought
        from home — tracked for chain-of-custody, not managed by
        the EM.
      </Text>

      <View style={styles.list}>
        {items.slice(0, 8).map((item) => (
          <View
            key={item.id}
            style={[
              styles.row,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={styles.rowMain}>
              <Text
                style={[styles.rowName, { color: palette.text }]}
                numberOfLines={1}
              >
                {item.name ?? '(no name)'}
              </Text>
              {item.qr_code_id || item.category ? (
                <Text
                  style={[styles.rowMeta, { color: palette.muted }]}
                  numberOfLines={1}
                >
                  {item.qr_code_id ?? ''}
                  {item.qr_code_id && item.category ? ' · ' : ''}
                  {item.category ?? ''}
                </Text>
              ) : null}
              {item.brand || item.model ? (
                <Text
                  style={[styles.rowMeta, { color: palette.muted }]}
                  numberOfLines={1}
                >
                  {[item.brand, item.model].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Release ${item.name ?? 'this item'} from personal kit`}
              onPress={() => {
                void handleRelease(item);
              }}
              disabled={releasingId !== null}
              style={({ pressed }) => [
                styles.releaseBtn,
                {
                  borderColor: palette.border,
                  opacity:
                    releasingId === item.id
                      ? 0.5
                      : pressed
                      ? 0.7
                      : 1,
                },
              ]}
            >
              <Text style={[styles.releaseBtnText, { color: palette.muted }]}>
                {releasingId === item.id ? 'Releasing…' : 'Release'}
              </Text>
            </Pressable>
          </View>
        ))}
        {items.length > 8 ? (
          <Text style={[styles.overflowHint, { color: palette.muted }]}>
            +{items.length - 8} more — full list ships in a
            follow-up batch.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  list: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  releaseBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  releaseBtnText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  overflowHint: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
  },
});
