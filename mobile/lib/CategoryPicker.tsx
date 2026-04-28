/**
 * Receipt category picker — a row of tappable chips matching plan
 * §5.11.2. A bottom-sheet picker would scale better past 11 options,
 * but for the v1 list (which fits in two wrap-rows on a typical
 * phone width) inline chips are faster and don't require a modal.
 *
 * The chip rendering is deliberately small (paddingVertical 6) so the
 * row doesn't dominate the form, but each tap target is still ≥44 px
 * tall via minHeight to satisfy plan §7.1 rule 2 (glove-friendly).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  type ReceiptCategory,
  RECEIPT_CATEGORIES,
} from './receipts';
import { colors } from './theme';
import { useResolvedScheme } from './themePreference';

interface CategoryPickerProps {
  value: ReceiptCategory | null | undefined;
  onChange: (next: ReceiptCategory | null) => void;
  /** Disables every chip (e.g. while the form is saving). */
  disabled?: boolean;
}

export function CategoryPicker({ value, onChange, disabled }: CategoryPickerProps) {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  // Tapping a selected chip clears the category. The bookkeeper
  // sometimes wants to defer categorisation; without this affordance
  // the user is stuck with whatever AI suggested.
  const onPress = (cat: ReceiptCategory) => {
    onChange(value === cat ? null : cat);
  };

  return (
    <View style={styles.row}>
      {RECEIPT_CATEGORIES.map((cat) => {
        const selected = value === cat;
        return (
          <Pressable
            key={cat}
            disabled={disabled}
            onPress={() => onPress(cat)}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={`Category ${categoryLabel(cat)}${selected ? ' (selected — tap to clear)' : ''}`}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: selected
                  ? palette.accent
                  : pressed
                    ? palette.border
                    : palette.surface,
                borderColor: selected ? palette.accent : palette.border,
                opacity: disabled ? 0.5 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.text,
                {
                  color: selected ? '#FFFFFF' : palette.text,
                },
              ]}
            >
              {categoryLabel(cat)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Display label for a category. Centralised so both the picker and
 *  the receipt card show identical wording. */
export function categoryLabel(cat: ReceiptCategory | string | null | undefined): string {
  switch (cat) {
    case 'fuel':
      return 'Fuel';
    case 'meals':
      return 'Meals';
    case 'supplies':
      return 'Supplies';
    case 'equipment':
      return 'Equipment';
    case 'tolls':
      return 'Tolls';
    case 'parking':
      return 'Parking';
    case 'lodging':
      return 'Lodging';
    case 'professional_services':
      return 'Pro services';
    case 'office_supplies':
      return 'Office';
    case 'client_entertainment':
      return 'Client ent.';
    case 'other':
      return 'Other';
    default:
      return cat ?? '—';
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
});
