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
 * Read-only in this slice. Claim / release flows ship as
 * follow-up batches.
 *
 * Hides itself entirely when the surveyor has no personal kit
 * — no zero-state placeholder cluttering the Me tab.
 */
import { StyleSheet, Text, View } from 'react-native';

import type { PersonalKitItem } from './equipment';
import { type Palette } from './theme';

interface MyPersonalKitSectionProps {
  items: PersonalKitItem[];
  palette: Palette;
}

export function MyPersonalKitSection({
  items,
  palette,
}: MyPersonalKitSectionProps) {
  if (items.length === 0) return null;

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
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  rowMain: {
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
  overflowHint: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
  },
});
