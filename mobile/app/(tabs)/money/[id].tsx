import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { CategoryPicker, categoryLabel } from '@/lib/CategoryPicker';
import { LoadingSplash } from '@/lib/LoadingSplash';
import { logError } from '@/lib/log';
import { useUnsavedChangesGuard } from '@/lib/useUnsavedChangesGuard';
import { RemotePhoto } from '@/lib/RemotePhoto';
import { TextField } from '@/lib/TextField';
import { useJob } from '@/lib/jobs';
import { formatCents, parseCents } from '@/lib/money';
import {
  type Receipt,
  type ReceiptCategory,
  type ReceiptPatch,
  retryReceiptExtraction,
  useConfirmReceiptReview,
  useDeleteReceipt,
  useReceipt,
  useReceiptPhotoUrl,
  useReceiptRow,
  useResolveReceiptDuplicate,
  useUpdateReceipt,
} from '@/lib/receipts';
import { formatLocalShortDate, formatLocalTime } from '@/lib/timeFormat';
import { type Palette, colors } from '@/lib/theme';

/**
 * Receipt detail / edit screen — F2 #3.
 *
 * Layout (top → bottom):
 *   1. Header (vendor + total summary, Cancel)
 *   2. Photo preview (signed URL, expires after 15min — refreshed on
 *      next render)
 *   3. Extraction status banner (when running / failed)
 *   4. Vendor name + address
 *   5. Transaction date/time
 *   6. Subtotal / tax / tip / total (USD; parsed via lib/money)
 *   7. Category chips
 *   8. Tax-deductibility radio
 *   9. Notes
 *  10. Save / Delete buttons
 *
 * Editing is gated by status — approved/exported receipts are read-only
 * (the bookkeeper has signed off; surveyor can't reopen). Pending and
 * rejected receipts are editable. Server-side RLS enforces the same
 * rule (see seeds/220_starr_field_receipts.sql).
 */
export default function ReceiptDetailScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  const { id } = useLocalSearchParams<{ id: string }>();
  const { receipt, isLoading } = useReceipt(id);

  if (isLoading) return <LoadingSplash />;

  if (!receipt) {
    return <NotFound palette={palette} onBack={() => router.back()} />;
  }

  // Remount the form on two transitions:
  //   - the receipt id changes (user navigates between rows)
  //   - the AI pipeline reaches a terminal state ('done' / 'failed')
  //     after starting in 'queued' / 'running'. Without the second
  //     trigger, a user sitting on the edit screen during extraction
  //     never sees the AI-filled vendor / total — the form state was
  //     initialised when the row was empty.
  //
  // Why a remount instead of useEffect-syncing the 14 fields: the form
  // has 14 controlled inputs each with its own useState. A useEffect
  // that mirrors `receipt` → state would trample mid-edit user input
  // any time extraction touches the row. Re-keying remounts cleanly,
  // re-runs each useState's lazy initialiser, and discards in-flight
  // edits ONLY at the precise extraction-phase boundary — matches what
  // the user expects ("AI just finished — show me what it filled in").
  const extractionPhase =
    receipt.extraction_status === 'done' ||
    receipt.extraction_status === 'failed'
      ? 'final'
      : 'pending';
  return (
    <ReceiptForm
      key={`${receipt.id}:${extractionPhase}`}
      receipt={receipt}
      palette={palette}
    />
  );
}

interface ReceiptFormProps {
  receipt: Receipt;
  palette: Palette;
}

function ReceiptForm({ receipt, palette }: ReceiptFormProps) {
  const updateReceipt = useUpdateReceipt();
  const deleteReceipt = useDeleteReceipt();
  const photoUrl = useReceiptPhotoUrl(receipt);
  const { job } = useJob(receipt.job_id);

  const locked = receipt.status === 'approved' || receipt.status === 'exported';

  const [vendorName, setVendorName] = useState<string>(receipt.vendor_name ?? '');
  const [vendorAddress, setVendorAddress] = useState<string>(receipt.vendor_address ?? '');
  const [transactionAt, setTransactionAt] = useState<string | null>(
    receipt.transaction_at ?? null
  );
  const [subtotalText, setSubtotalText] = useState<string>(
    centsToInputString(receipt.subtotal_cents)
  );
  const [taxText, setTaxText] = useState<string>(centsToInputString(receipt.tax_cents));
  const [tipText, setTipText] = useState<string>(centsToInputString(receipt.tip_cents));
  const [totalText, setTotalText] = useState<string>(
    centsToInputString(receipt.total_cents)
  );
  const [paymentMethod, setPaymentMethod] = useState<string>(receipt.payment_method ?? '');
  const [paymentLast4, setPaymentLast4] = useState<string>(receipt.payment_last4 ?? '');
  const [category, setCategory] = useState<ReceiptCategory | null>(
    (receipt.category as ReceiptCategory | null) ?? null
  );
  const [taxFlag, setTaxFlag] = useState<TaxFlag>(
    (receipt.tax_deductible_flag as TaxFlag | null) ?? 'review'
  );
  const [notes, setNotes] = useState<string>(receipt.notes ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dirty flag for the discard-changes guard. Recomputed cheaply on
  // every keystroke; the hook only fires the prompt when this flag is
  // true at navigation time.
  const dirty = useMemo(() => {
    return (
      vendorName !== (receipt.vendor_name ?? '') ||
      vendorAddress !== (receipt.vendor_address ?? '') ||
      transactionAt !== (receipt.transaction_at ?? null) ||
      subtotalText !== centsToInputString(receipt.subtotal_cents) ||
      taxText !== centsToInputString(receipt.tax_cents) ||
      tipText !== centsToInputString(receipt.tip_cents) ||
      totalText !== centsToInputString(receipt.total_cents) ||
      paymentMethod !== (receipt.payment_method ?? '') ||
      paymentLast4 !== (receipt.payment_last4 ?? '') ||
      category !== ((receipt.category as ReceiptCategory | null) ?? null) ||
      taxFlag !== ((receipt.tax_deductible_flag as TaxFlag | null) ?? 'review') ||
      notes !== (receipt.notes ?? '')
    );
  }, [
    receipt,
    vendorName,
    vendorAddress,
    transactionAt,
    subtotalText,
    taxText,
    tipText,
    totalText,
    paymentMethod,
    paymentLast4,
    category,
    taxFlag,
    notes,
  ]);

  const { attemptDismiss } = useUnsavedChangesGuard({
    dirty,
    scope: 'receiptDetail',
    message: 'Your edits to this receipt haven’t been saved.',
  });

  const totalsValid = useMemo(() => {
    const t = parseCents(totalText);
    return totalText.trim() === '' || t != null;
  }, [totalText]);

  const onSave = async () => {
    if (locked) {
      Alert.alert(
        'Receipt locked',
        'This receipt has been approved by the bookkeeper. Ask them to reopen it before editing.'
      );
      return;
    }
    if (!totalsValid) {
      setError('Total must look like 12.34 (no letters or extra symbols).');
      return;
    }
    setError(null);

    // Build a patch with ONLY the fields that changed. Two reasons:
    //  1. category_source flips to 'user' whenever the patch includes
    //     `category` — sending the AI's value back unchanged would
    //     defeat the bookkeeper's "needs review" badge.
    //  2. Smaller patches mean fewer writes through the PowerSync
    //     queue, which matters on flaky LTE.
    const patch: ReceiptPatch = {};
    const newVendor = vendorName.trim() || null;
    if (newVendor !== (receipt.vendor_name ?? null)) patch.vendor_name = newVendor;
    const newVendorAddr = vendorAddress.trim() || null;
    if (newVendorAddr !== (receipt.vendor_address ?? null)) {
      patch.vendor_address = newVendorAddr;
    }
    if (transactionAt !== (receipt.transaction_at ?? null)) {
      patch.transaction_at = transactionAt;
    }
    const newSubtotal = parseCents(subtotalText);
    if (newSubtotal !== (receipt.subtotal_cents ?? null)) {
      patch.subtotal_cents = newSubtotal;
    }
    const newTax = parseCents(taxText);
    if (newTax !== (receipt.tax_cents ?? null)) patch.tax_cents = newTax;
    const newTip = parseCents(tipText);
    if (newTip !== (receipt.tip_cents ?? null)) patch.tip_cents = newTip;
    const newTotal = parseCents(totalText);
    if (newTotal !== (receipt.total_cents ?? null)) patch.total_cents = newTotal;
    const newPayment = paymentMethod.trim() || null;
    if (newPayment !== (receipt.payment_method ?? null)) {
      patch.payment_method = newPayment;
    }
    const newLast4 = paymentLast4.trim() || null;
    if (newLast4 !== (receipt.payment_last4 ?? null)) {
      patch.payment_last4 = newLast4;
    }
    const currentCategory = (receipt.category as ReceiptCategory | null) ?? null;
    if (category !== currentCategory) patch.category = category;
    if (taxFlag !== (receipt.tax_deductible_flag ?? null)) {
      patch.tax_deductible_flag = taxFlag;
    }
    const newNotes = notes.trim() || null;
    if (newNotes !== (receipt.notes ?? null)) patch.notes = newNotes;

    if (Object.keys(patch).length === 0) {
      // Nothing changed — bail without a network round-trip.
      router.back();
      return;
    }

    setSubmitting(true);
    try {
      await updateReceipt(receipt.id, patch);
      router.back();
    } catch (err) {
      logError('receiptDetail.onSave', 'update failed', err, {
        receipt_id: receipt.id,
        fields: Object.keys(patch).length,
      });
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onRetryExtraction = async () => {
    setRetrying(true);
    try {
      const requeued = await retryReceiptExtraction(receipt.id);
      Alert.alert(
        requeued ? 'Retrying' : 'Already queued',
        requeued
          ? 'AI extraction has been re-queued. The form will refresh when it completes.'
          : 'This receipt is already pending extraction or finished. Pull down to refresh if the fields look stale.'
      );
    } catch (err) {
      logError('receiptDetail.onRetry', 'retry failed', err, {
        receipt_id: receipt.id,
      });
      Alert.alert(
        'Retry failed',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setRetrying(false);
    }
  };

  const onDelete = () => {
    // Vary the body when AI is mid-flight — the user may not realise
    // they're killing in-progress work.
    const inFlight =
      receipt.extraction_status === 'queued' ||
      receipt.extraction_status === 'running';
    const body = inFlight
      ? 'AI extraction is still running on this receipt. Deleting now wastes the work in progress — wait a few seconds, or delete anyway?'
      : 'The photo and any AI-extracted data will be removed. You can re-snap the receipt if you change your mind.';
    Alert.alert(
      'Delete this receipt?',
      body,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReceipt(receipt);
              router.back();
            } catch (err) {
              logError('receiptDetail.onDelete', 'delete failed', err, {
                receipt_id: receipt.id,
                status: receipt.status,
              });
              Alert.alert(
                'Delete failed',
                err instanceof Error ? err.message : String(err)
              );
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heading, { color: palette.text }]} numberOfLines={2}>
                {vendorName.trim() || receipt.vendor_name?.trim() || 'Receipt'}
              </Text>
              <Text style={[styles.subtitle, { color: palette.muted }]}>
                {extractionCaption(receipt)}
              </Text>
            </View>
            <Pressable
              onPress={attemptDismiss}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.cancelText, { color: palette.muted }]}>
                Cancel
              </Text>
            </Pressable>
          </View>

          {locked ? (
            <View
              style={[
                styles.lockedBanner,
                { backgroundColor: palette.surface, borderColor: palette.danger },
              ]}
            >
              <Text style={[styles.lockedTitle, { color: palette.danger }]}>
                {receipt.status === 'exported' ? 'Exported' : 'Approved'}
              </Text>
              <Text style={[styles.lockedBody, { color: palette.text }]}>
                The bookkeeper has signed off on this receipt. Ask them to
                reopen it before editing.
              </Text>
            </View>
          ) : null}

          <DuplicateBanner receipt={receipt} palette={palette} />
          <ReviewBanner receipt={receipt} palette={palette} />

          <View style={styles.photoBlock}>
            <RemotePhoto
              signedUrl={photoUrl}
              aspectRatio={3 / 4}
              accessibilityLabel="Receipt photo"
            />
          </View>

          {/* Vendor */}
          <View style={styles.section}>
            <TextField
              label="Vendor"
              value={vendorName}
              onChangeText={setVendorName}
              placeholder="Buc-ee's, Home Depot, …"
              autoCorrect
              autoCapitalize="words"
              editable={!submitting && !locked}
            />
            <TextField
              label="Vendor address (optional)"
              value={vendorAddress}
              onChangeText={setVendorAddress}
              placeholder="123 Main St, Belton TX"
              autoCorrect
              autoCapitalize="words"
              editable={!submitting && !locked}
            />
          </View>

          {/* Transaction date */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>
              Transaction date
            </Text>
            <TransactionDateField
              value={transactionAt}
              onChange={setTransactionAt}
              showPicker={showDatePicker}
              setShowPicker={setShowDatePicker}
              palette={palette}
              disabled={submitting || locked}
            />
          </View>

          {/* Totals — four-column row at typical phone width */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>
              Amounts
            </Text>
            <View style={styles.amountsRow}>
              <View style={styles.amountField}>
                <TextField
                  label="Subtotal"
                  value={subtotalText}
                  onChangeText={setSubtotalText}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  editable={!submitting && !locked}
                />
              </View>
              <View style={styles.amountField}>
                <TextField
                  label="Tax"
                  value={taxText}
                  onChangeText={setTaxText}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  editable={!submitting && !locked}
                />
              </View>
            </View>
            <View style={styles.amountsRow}>
              <View style={styles.amountField}>
                <TextField
                  label="Tip"
                  value={tipText}
                  onChangeText={setTipText}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  editable={!submitting && !locked}
                />
              </View>
              <View style={styles.amountField}>
                <TextField
                  label="Total"
                  value={totalText}
                  onChangeText={setTotalText}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  error={error}
                  editable={!submitting && !locked}
                />
              </View>
            </View>
          </View>

          {/* Payment method */}
          <View style={styles.section}>
            <View style={styles.amountsRow}>
              <View style={styles.amountField}>
                <TextField
                  label="Payment"
                  value={paymentMethod}
                  onChangeText={setPaymentMethod}
                  placeholder="card / cash / check"
                  autoCapitalize="none"
                  editable={!submitting && !locked}
                />
              </View>
              <View style={styles.amountField}>
                <TextField
                  label="Last 4"
                  value={paymentLast4}
                  onChangeText={(v) => setPaymentLast4(v.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="number-pad"
                  placeholder="1234"
                  editable={!submitting && !locked}
                />
              </View>
            </View>
          </View>

          {/* Category */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>
              Category
            </Text>
            <CategoryPicker
              value={category}
              onChange={setCategory}
              disabled={submitting || locked}
            />
          </View>

          {/* Tax-deductible flag */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>
              Tax-deductible
            </Text>
            <TaxFlagPicker
              value={taxFlag}
              onChange={setTaxFlag}
              disabled={submitting || locked}
              palette={palette}
            />
            <Text style={[styles.taxHint, { color: palette.muted }]}>
              {TAX_FLAG_HINT[taxFlag]}
            </Text>
          </View>

          {/* Job */}
          {job ? (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: palette.muted }]}>
                Job
              </Text>
              <Text style={[styles.jobName, { color: palette.text }]}>
                {job.name?.trim() || '(unnamed job)'}
              </Text>
              <Text style={[styles.jobMeta, { color: palette.muted }]}>
                {[job.job_number, job.client_name].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ) : null}

          {/* Notes */}
          <View style={styles.section}>
            <TextField
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              autoCorrect
              autoCapitalize="sentences"
              placeholder="Client lunch w/ Henry, Belton job site, …"
              editable={!submitting && !locked}
            />
          </View>

          {/* Retry AI extraction (only when extraction failed) */}
          {!locked && receipt.extraction_status === 'failed' ? (
            <>
              <Button
                variant="secondary"
                label="Retry AI extraction"
                onPress={onRetryExtraction}
                loading={retrying}
                disabled={submitting}
                accessibilityHint="Re-runs Claude Vision on this receipt's photo."
              />
              <View style={styles.deleteSpacer} />
            </>
          ) : null}

          {/* Save / Delete */}
          {locked ? null : (
            <>
              <Button
                label="Save"
                onPress={onSave}
                loading={submitting}
                disabled={!totalsValid || retrying}
                accessibilityHint="Saves your edits to this receipt."
              />
              <View style={styles.deleteSpacer} />
              <Button
                variant="danger"
                label="Delete receipt"
                onPress={onDelete}
                disabled={submitting || retrying}
                accessibilityHint="Removes the receipt and its photo. The audit trail is not preserved."
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface TransactionDateFieldProps {
  value: string | null;
  onChange: (next: string | null) => void;
  showPicker: boolean;
  setShowPicker: (next: boolean) => void;
  palette: Palette;
  disabled: boolean;
}

function TransactionDateField({
  value,
  onChange,
  showPicker,
  setShowPicker,
  palette,
  disabled,
}: TransactionDateFieldProps) {
  const date = useMemo(() => (value ? new Date(value) : new Date()), [value]);
  const valid = !Number.isNaN(date.getTime());
  const isAndroid = Platform.OS === 'android';

  // The iOS inline DateTimePicker fires onChange once at mount with
  // whatever date we hand it. When `value` is null we hand it `now`
  // — without this guard we'd auto-set transaction_at to "now" on
  // every screen open and the diff-only patch would treat that as a
  // user edit. Flip the ref the first time a real user interaction
  // produces an `event.type === 'set'`.
  const userInteractedRef = useRef(false);

  const onPickerChange = (event: { type?: string }, picked?: Date) => {
    if (isAndroid) setShowPicker(false);
    if (event?.type === 'dismissed') return;
    if (!picked || Number.isNaN(picked.getTime())) return;

    // First synthetic onChange when value was null at mount — ignore.
    // iOS spinner picker doesn't carry event.type for these. Once the
    // user actually drags the spinner an event arrives with type='set'
    // and userInteractedRef stays true for subsequent changes.
    if (!userInteractedRef.current) {
      if (value === null && event?.type !== 'set') return;
      userInteractedRef.current = true;
    }

    onChange(picked.toISOString());
  };

  if (isAndroid) {
    const display = valid && value
      ? `${formatLocalShortDate(value.slice(0, 10))}, ${formatLocalTime(value) ?? ''}`
      : 'Tap to set';
    return (
      <View>
        <Pressable
          onPress={() => setShowPicker(true)}
          disabled={disabled}
          accessibilityRole="button"
          style={[
            styles.androidValue,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              opacity: disabled ? 0.5 : 1,
            },
          ]}
        >
          <Text style={[styles.androidValueText, { color: palette.text }]}>
            {display}
          </Text>
        </Pressable>
        {showPicker ? (
          <DateTimePicker
            value={valid ? date : new Date()}
            mode="datetime"
            onChange={onPickerChange}
          />
        ) : null}
      </View>
    );
  }

  // iOS picker doesn't take a `disabled` prop — wrap it in a pointer-
  // events guard via the parent View when the form is locked.
  return (
    <View pointerEvents={disabled ? 'none' : 'auto'} style={{ opacity: disabled ? 0.5 : 1 }}>
      <DateTimePicker
        value={valid ? date : new Date()}
        mode="datetime"
        display="default"
        onChange={onPickerChange}
      />
    </View>
  );
}

type TaxFlag = 'full' | 'partial_50' | 'none' | 'review';

const TAX_FLAG_OPTIONS: ReadonlyArray<TaxFlag> = ['full', 'partial_50', 'none', 'review'];

const TAX_FLAG_LABEL: Record<TaxFlag, string> = {
  full: 'Full',
  partial_50: '50% (meals)',
  none: 'None',
  review: 'Review',
};

const TAX_FLAG_HINT: Record<TaxFlag, string> = {
  full:
    'Fully deductible business expense. Common for fuel, supplies, equipment under the §179 limit.',
  partial_50:
    'Half-deductible per IRS 2026 rules. Defaults for meals.',
  none:
    'Not tax-deductible. Common for client entertainment (post-2018).',
  review:
    'Bookkeeper will set the deductibility before export.',
};

interface TaxFlagPickerProps {
  value: TaxFlag;
  onChange: (next: TaxFlag) => void;
  disabled?: boolean;
  palette: Palette;
}

function TaxFlagPicker({ value, onChange, disabled, palette }: TaxFlagPickerProps) {
  return (
    <View style={styles.taxFlagRow}>
      {TAX_FLAG_OPTIONS.map((opt) => {
        const selected = value === opt;
        return (
          <Pressable
            key={opt}
            disabled={disabled}
            onPress={() => onChange(opt)}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            style={({ pressed }) => [
              styles.taxFlagChip,
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
                styles.taxFlagText,
                { color: selected ? '#FFFFFF' : palette.text },
              ]}
            >
              {TAX_FLAG_LABEL[opt]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface NotFoundProps {
  palette: Palette;
  onBack: () => void;
}

/**
 * Duplicate-warning banner. Renders only when the worker found a
 * prior receipt for this user with the same `(vendor, total, date)`
 * fingerprint AND the user hasn't decided yet (`dedup_decision IS
 * NULL`). The user picks "Keep — different receipt" or "Discard
 * the duplicate"; the latter flips status to 'rejected' with
 * `rejected_reason='duplicate'`.
 *
 * After a decision lands, the banner stays visible in a
 * subdued state ("You said: keep / discarded as duplicate") so
 * the office reviewer can trace the call. We never auto-decide.
 */
function DuplicateBanner({
  receipt,
  palette,
}: {
  receipt: Receipt;
  palette: Palette;
}) {
  const matchId = receipt.dedup_match_id ?? null;
  const match = useReceiptRow(matchId);
  const resolveDuplicate = useResolveReceiptDuplicate();
  const [busy, setBusy] = useState<'keep' | 'discard' | null>(null);

  if (!matchId) return null;

  const decision = receipt.dedup_decision as 'keep' | 'discard' | null;
  const decided = decision != null;

  const onPick = async (kind: 'keep' | 'discard') => {
    if (busy) return;
    setBusy(kind);
    try {
      await resolveDuplicate(receipt.id, kind);
    } catch (err) {
      Alert.alert(
        'Couldn’t save your decision',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setBusy(null);
    }
  };

  const matchVendor =
    match?.vendor_name?.trim() ||
    'a previously-captured receipt';
  const matchTotal =
    match?.total_cents != null ? formatCents(match.total_cents) : null;
  const matchTime = match?.transaction_at
    ? `${formatLocalShortDate(match.transaction_at)} ${formatLocalTime(match.transaction_at)}`
    : null;

  return (
    <View
      style={{
        backgroundColor: decided ? palette.surface : '#FEF3C7',
        borderColor: decided ? palette.border : '#D97706',
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
      }}
      accessibilityLiveRegion="polite"
    >
      <Text
        style={{
          color: decided ? palette.muted : '#92400E',
          fontSize: 12,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {decided
          ? `You said: ${decision === 'keep' ? 'keep both' : 'discard duplicate'}`
          : 'Possible duplicate'}
      </Text>
      <Text
        style={{
          color: palette.text,
          fontSize: 14,
          lineHeight: 20,
          marginBottom: 10,
        }}
      >
        This receipt looks like {matchVendor}
        {matchTotal ? ` for ${matchTotal}` : ''}
        {matchTime ? ` on ${matchTime}` : ''}.{' '}
        {decided
          ? 'Tap below to change the call.'
          : 'Same vendor, total, and date. Is this a real second receipt, or a duplicate of the earlier one?'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button
          variant="secondary"
          label={
            busy === 'keep'
              ? 'Saving…'
              : decided && decision === 'keep'
                ? '✓ Kept'
                : 'Keep — different receipt'
          }
          disabled={busy === 'discard'}
          onPress={() => void onPick('keep')}
          accessibilityHint="Keeps both receipts. Pick this when two real purchases share the same vendor, total, and date."
        />
        <Button
          variant="secondary"
          label={
            busy === 'discard'
              ? 'Saving…'
              : decided && decision === 'discard'
                ? '✓ Discarded'
                : 'Discard duplicate'
          }
          disabled={busy === 'keep'}
          onPress={() => void onPick('discard')}
          accessibilityHint="Marks this receipt as a duplicate and rejects it."
        />
      </View>
    </View>
  );
}

/**
 * Review banner — Batch Z. Surfaces a "review the AI-extracted
 * fields" CTA when extraction has completed but the user hasn't
 * confirmed yet. Tapping "Confirm receipt" stamps
 * `user_reviewed_at = now()` so the row clears the "Tap to review"
 * yellow badge in the list and moves to the bookkeeper queue as
 * user-verified data.
 *
 * Hidden when:
 *   - Extraction is still in flight (different banner handles that).
 *   - The row is already user-confirmed.
 *   - The row has been approved/rejected (locked).
 *   - The row is a duplicate the user already discarded.
 */
function ReviewBanner({
  receipt,
  palette,
}: {
  receipt: Receipt;
  palette: Palette;
}) {
  const confirmReview = useConfirmReceiptReview();
  const [busy, setBusy] = useState(false);

  const showBanner =
    receipt.extraction_status === 'done' &&
    !receipt.user_reviewed_at &&
    receipt.status === 'pending' &&
    receipt.dedup_decision !== 'discard';

  if (!showBanner) return null;

  const onConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // We don't track per-field edits in this lightweight CTA —
      // a richer "review wizard" would diff field-by-field, but
      // for v1 the user has been editing inline and confirms when
      // they're satisfied. Pass an empty edits map so
      // user_review_edits records "reviewed, no edits noted."
      await confirmReview(receipt.id);
    } catch (err) {
      Alert.alert(
        'Couldn’t mark as reviewed',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.accent,
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <Text
        style={{
          color: palette.accent,
          fontSize: 12,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        Please review
      </Text>
      <Text
        style={{
          color: palette.text,
          fontSize: 14,
          lineHeight: 20,
          marginBottom: 10,
        }}
      >
        AI filled in the vendor, total, and category. Skim the fields
        below — fix anything wrong — then tap Confirm so the
        bookkeeper sees this as user-verified.
      </Text>
      <Button
        label={busy ? 'Saving…' : '✓ Confirm receipt'}
        onPress={onConfirm}
        disabled={busy}
        accessibilityHint="Marks the AI-extracted data as reviewed by you."
      />
    </View>
  );
}

function NotFound({ palette, onBack }: NotFoundProps) {
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <View style={styles.notFound}>
        <Text style={[styles.heading, { color: palette.text }]}>
          Receipt not found
        </Text>
        <Text style={[styles.subtitle, { color: palette.muted }]}>
          This receipt may have been deleted or hasn&apos;t synced to this
          device yet.
        </Text>
        <Button label="Back" onPress={onBack} />
      </View>
    </SafeAreaView>
  );
}

function centsToInputString(cents: number | null | undefined): string {
  if (cents == null) return '';
  // Show "12.34" — same shape parseCents accepts on save.
  const s = formatCents(cents);
  return s === '—' ? '' : s.replace(/^\$/, '').replace(/,/g, '');
}

function extractionCaption(receipt: Receipt): string {
  if (receipt.extraction_status === 'queued' || receipt.extraction_status === 'running') {
    return 'AI extraction is running…';
  }
  if (receipt.extraction_status === 'failed') {
    return `AI extraction failed${
      receipt.extraction_error ? `: ${receipt.extraction_error}` : ''
    }. Edit the fields manually below.`;
  }
  if (receipt.category) {
    return `${categoryLabel(receipt.category)} · ${formatCents(receipt.total_cents)}`;
  }
  return formatCents(receipt.total_cents);
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 64,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '500',
    paddingTop: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  lockedBanner: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 20,
  },
  lockedTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  lockedBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  photoBlock: {
    marginBottom: 24,
  },
  section: {
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  amountField: {
    flex: 1,
  },
  androidValue: {
    minHeight: 56,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  androidValueText: {
    fontSize: 16,
  },
  taxFlagRow: {
    flexDirection: 'row',
    gap: 8,
  },
  taxFlagChip: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taxFlagText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  taxHint: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 18,
  },
  jobName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  jobMeta: {
    fontSize: 13,
  },
  deleteSpacer: {
    height: 12,
  },
  notFound: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
