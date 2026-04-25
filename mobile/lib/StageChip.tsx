/**
 * Stage chip matching the web admin's STAGE_CONFIG so a job looks the
 * same on Jacob's phone as on Henry's desk monitor.
 *
 * Source of truth: app/admin/components/jobs/JobCard.tsx STAGE_CONFIG.
 * If a stage is added there, mirror it here. Unknown stages render
 * with the default "quote" treatment (don't crash the row).
 */
import { StyleSheet, Text, View } from 'react-native';

interface StageInfo {
  label: string;
  color: string; // hex; chip uses color + 20% alpha background, color text
  icon: string;
}

const STAGE_CONFIG: Record<string, StageInfo> = {
  quote: { label: 'Quote', color: '#F59E0B', icon: '💰' },
  research: { label: 'Research', color: '#8B5CF6', icon: '🔍' },
  fieldwork: { label: 'Field Work', color: '#059669', icon: '🏗️' },
  drawing: { label: 'Drawing', color: '#3B82F6', icon: '📐' },
  legal: { label: 'Legal', color: '#6366F1', icon: '⚖️' },
  delivery: { label: 'Delivery', color: '#10B981', icon: '📦' },
  completed: { label: 'Completed', color: '#6B7280', icon: '✅' },
  cancelled: { label: 'Cancelled', color: '#EF4444', icon: '❌' },
  on_hold: { label: 'On Hold', color: '#F97316', icon: '⏸️' },
};

const FALLBACK = STAGE_CONFIG.quote;

interface StageChipProps {
  stage: string | null | undefined;
}

export function StageChip({ stage }: StageChipProps) {
  const info = (stage && STAGE_CONFIG[stage]) || FALLBACK;
  // Web admin uses `color + '20'` (12.5% alpha hex) for the bg. We
  // need an 8-char hex (#RRGGBB → #RRGGBB33 for ~20% would be more
  // visible on dark backgrounds; keep `33` for a slightly stronger
  // tint that reads in sunlight).
  const bg = info.color + '33';

  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: info.color }]}>
        {info.icon} {info.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
