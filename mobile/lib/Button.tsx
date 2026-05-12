/**
 * Themed button. Three variants per plan §7.1:
 *   - primary  (filled accent — main action)
 *   - secondary (outlined accent — alt action)
 *   - danger   (red — sign-out, destructive)
 *
 * Height + corner radius come from the shared `controls` token in
 * theme.ts so a Button and a TextField sitting in the same form row
 * line up. Disabled state dims by 40% rather than 100% so the
 * affordance stays legible in direct sunlight.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, controls } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  /** Accessibility hint read by VoiceOver/TalkBack after the label. */
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityHint,
}: ButtonProps) {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  const isDisabled = disabled || loading;

  const styles = makeStyles({
    background:
      variant === 'primary'
        ? palette.accent
        : variant === 'danger'
        ? palette.danger
        : 'transparent',
    border:
      variant === 'secondary' ? palette.accent : 'transparent',
    text:
      variant === 'secondary' ? palette.accent : '#FFFFFF',
  });

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.root,
        { opacity: isDisabled ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={styles.text.color} />
      ) : (
        <Text style={styles.text}>{label}</Text>
      )}
    </Pressable>
  );
}

function makeStyles(c: { background: string; border: string; text: string }) {
  return StyleSheet.create({
    root: {
      minHeight: controls.height,
      paddingHorizontal: controls.paddingHButton,
      borderRadius: controls.radius,
      backgroundColor: c.background,
      borderWidth: c.border === 'transparent' ? 0 : 2,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      color: c.text,
      fontSize: 17,
      fontWeight: '600',
    },
  });
}
