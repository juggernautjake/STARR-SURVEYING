/**
 * Themed text input with optional label and error message.
 *
 * Sized for one-handed use in the field — minHeight 56, large font,
 * generous padding. autoCapitalize/autoCorrect are off by default
 * because most field inputs (email, parcel id, point name) are not
 * sentence-cased.
 */
import { forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors } from './theme';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, style, ...inputProps },
  ref
) {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  return (
    <View style={styles.root}>
      {label ? <Text style={[styles.label, { color: palette.muted }]}>{label}</Text> : null}
      <TextInput
        ref={ref}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={palette.muted}
        {...inputProps}
        style={[
          styles.input,
          {
            color: palette.text,
            backgroundColor: palette.surface,
            borderColor: error ? palette.danger : palette.border,
          },
          style,
        ]}
      />
      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    minHeight: 56,
    paddingHorizontal: 16,
    fontSize: 17,
    borderRadius: 10,
    borderWidth: 1,
  },
  error: {
    marginTop: 6,
    fontSize: 13,
  },
});
