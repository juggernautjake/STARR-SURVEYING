/**
 * Persistent scanner floating action button.
 *
 * Phase F10.8 — §5.12.9. Renders a green camera-glyph circle in
 * the bottom-right of every tab screen WHEN the signed-in surveyor
 * has at least one active check-out. Hidden when nothing is out
 * (no point pestering the surveyor with a scanner they don&apos;t
 * need).
 *
 * Tapping the FAB opens a fullscreen modal hosting the F10.1j
 * QrScanner shell. On a successful scan we look the QR up against
 * the local equipment_inventory mirror; matches resolve to either
 * (a) a currently-checked-out reservation we own → navigate to
 * that job detail screen so the surveyor can return / extend it,
 * or (b) a non-mine match → show the equipment name + a hint that
 * it&apos;s not theirs to return. Unrecognised QRs surface a brief
 * "not in catalogue" notice and the scanner re-arms for another
 * scan.
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useEquipmentByQr, useMyCheckouts } from './equipment';
import { QrScanner, type QrScannerHandle } from './QrScanner';
import { useAuth } from './auth';
import { logError } from './log';
import { supabase } from './supabase';
import { useActiveTimeEntry } from './timeTracking';

interface ScannerFabProps {
  /** Optional bottom inset so the FAB clears the tab bar. Caller
   *  knows the tab bar height; we don&apos;t hardcode it here so
   *  alternate layouts (modal flows that hide the tab bar) get
   *  correct placement automatically. */
  bottomInset?: number;
}

export function ScannerFab({ bottomInset = 80 }: ScannerFabProps) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { summary } = useMyCheckouts(userId);
  // Active time entry — drives the "Borrow for current job" CTA on
  // not-yours matches. When no entry is open, the CTA falls back
  // to "Hand it to the EM" (the surveyor isn't on the clock so we
  // don't know which job to attribute the borrow to).
  const { active: activeTimeEntry } = useActiveTimeEntry();
  const [open, setOpen] = useState(false);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const scannerRef = useRef<QrScannerHandle>(null);
  // Latch to prevent re-firing the alert on every render after the
  // hook resolves. Cleared when pendingCode changes (new scan).
  const handledCodeRef = useRef<string | null>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    setPendingCode(null);
    handledCodeRef.current = null;
  }, []);

  const handleScan = useCallback(
    (code: string) => {
      handledCodeRef.current = null;
      setPendingCode(code);
    },
    []
  );

  // Resolve the scanned QR. PowerSync useQuery re-fires on the
  // pendingCode change; the row arrives synchronously from the
  // local SQLite mirror.
  const { row, isLoading } = useEquipmentByQr(pendingCode);

  // Drive a one-shot alert per resolved code. The handledCodeRef
  // latch keeps a re-render with the same row from re-firing.
  useEffect(() => {
    if (!pendingCode) return;
    if (isLoading) return;
    if (handledCodeRef.current === pendingCode) return;
    handledCodeRef.current = pendingCode;

    if (!row) {
      Alert.alert(
        'Not recognised',
        `${pendingCode} isn't in the catalogue. Check the sticker and try again.`,
        [
          {
            text: 'OK',
            onPress: () => {
              setPendingCode(null);
              handledCodeRef.current = null;
              scannerRef.current?.rearm();
            },
          },
        ]
      );
      return;
    }

    const myItem = summary.items.find(
      (item) => item.equipment_id === row.id
    );
    if (myItem) {
      Alert.alert(
        row.name ?? 'Equipment',
        `Open ${myItem.job_number ? `${myItem.job_number} ` : ''}${myItem.job_name ?? 'job'} to return or extend?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setPendingCode(null);
              handledCodeRef.current = null;
              scannerRef.current?.rearm();
            },
          },
          {
            text: 'Open job',
            onPress: () => {
              setPendingCode(null);
              setOpen(false);
              handledCodeRef.current = null;
              router.push({
                pathname: '/(tabs)/jobs/[id]',
                params: { id: myItem.job_id },
              });
            },
          },
        ]
      );
    } else {
      // F10.8 — "Borrow for current job" + "Claim as personal"
      // CTAs. Borrow only fires when the surveyor is on the clock
      // against a specific job (no job → no place to attribute the
      // borrow). Claim only fires when the row isn't already
      // someone's personal kit (row.is_personal === 0). Both
      // optional buttons stack into one Alert; if neither applies
      // we keep the original "hand it to the EM" fallback.
      const currentJobId = activeTimeEntry?.job_id ?? null;
      const cancelButton = {
        text: 'Cancel',
        style: 'cancel' as const,
        onPress: () => {
          setPendingCode(null);
          handledCodeRef.current = null;
          scannerRef.current?.rearm();
        },
      };

      // Already-someone-else's-personal-kit branch — short-circuit.
      if (row.is_personal === 1) {
        Alert.alert(
          row.name ?? 'Equipment',
          `${row.qr_code_id ?? pendingCode} is in someone else's personal kit. Hand it back to them.`,
          [cancelButton]
        );
      } else {
        const buttons: Array<{
          text: string;
          style?: 'cancel' | 'destructive' | 'default';
          onPress?: () => void;
        }> = [cancelButton];
        if (currentJobId) {
          buttons.push({
            text: 'Borrow',
            onPress: () => {
              void submitBorrow(row.id, currentJobId, row.name);
            },
          });
        }
        buttons.push({
          text: 'Claim as personal',
          onPress: () => {
            void submitClaim(row.id, row.name);
          },
        });

        Alert.alert(
          row.name ?? 'Equipment',
          `${row.qr_code_id ?? pendingCode} isn't on your reservation list. ${
            currentJobId
              ? 'Borrow for your current job, or claim it as part of your personal kit?'
              : "You're off the clock — claim as personal kit or hand it to the EM?"
          }`,
          buttons
        );
      }
    }
  }, [
    isLoading,
    pendingCode,
    row,
    summary.items,
    activeTimeEntry?.job_id,
  ]);

  // F10.8 — borrow submitter. Inserts a `borrowed_during_field_
  // work` row into equipment_events directly via Supabase. The
  // canonical admin endpoint (POST /admin/equipment/borrow-from-
  // other-crew) ALSO fans out notifications to crew leads + EMs;
  // mobile uses Supabase auth instead of NextAuth so it can't
  // hit that endpoint — a Postgres trigger on equipment_events
  // INSERT will replay the same fan-out as a follow-up batch.
  // For now: audit row lands; notifications come from the
  // admin reconciliation path or the (pending) trigger.
  const submitBorrow = useCallback(
    async (
      equipmentId: string,
      currentJobId: string,
      equipmentName: string | null
    ) => {
      try {
        const { error } = await supabase
          .from('equipment_events')
          .insert({
            equipment_id: equipmentId,
            event_type: 'borrowed_during_field_work',
            job_id: currentJobId,
            payload: {
              actor_email: session?.user.email ?? null,
              source: 'mobile_scanner_fab',
            },
          });
        if (error) {
          throw error;
        }
        Alert.alert(
          'Borrow logged',
          `${equipmentName ?? 'Equipment'} is now in your audit trail. The EM will reconcile during morning review.`,
          [
            {
              text: 'OK',
              onPress: () => {
                setPendingCode(null);
                handledCodeRef.current = null;
                scannerRef.current?.rearm();
              },
            },
          ]
        );
      } catch (err) {
        logError(
          'ScannerFab.submitBorrow',
          'audit insert failed',
          err,
          { equipment_id: equipmentId, job_id: currentJobId }
        );
        Alert.alert(
          'Borrow log failed',
          err instanceof Error
            ? err.message
            : 'Try again, or hand it to the EM.',
          [
            {
              text: 'OK',
              onPress: () => {
                setPendingCode(null);
                handledCodeRef.current = null;
                scannerRef.current?.rearm();
              },
            },
          ]
        );
      }
    },
    [session?.user.email]
  );

  // F10.8 — claim-as-personal submitter. Updates equipment_
  // inventory (is_personal=true, owner_user_id=me) + writes an
  // equipment_events audit row. Mirrors the Release flow on the
  // Me-tab MyPersonalKitSection but in the opposite direction.
  // PowerSync sync re-projects the row so MyPersonalKitSection
  // picks it up on the next tick.
  const submitClaim = useCallback(
    async (equipmentId: string, equipmentName: string | null) => {
      if (!userId) {
        Alert.alert(
          'Not signed in',
          'Re-open the app while online to claim this item.'
        );
        return;
      }
      try {
        const { error: updateErr } = await supabase
          .from('equipment_inventory')
          .update({
            is_personal: true,
            owner_user_id: userId,
          })
          .eq('id', equipmentId);
        if (updateErr) throw updateErr;
        // Best-effort audit row.
        try {
          await supabase.from('equipment_events').insert({
            equipment_id: equipmentId,
            event_type: 'updated',
            payload: {
              change: 'personal_kit_claimed',
              source: 'mobile_scanner_fab',
              actor_email: session?.user.email ?? null,
            },
          });
        } catch (auditErr) {
          logError(
            'ScannerFab.submitClaim',
            'audit insert failed (non-fatal)',
            auditErr,
            { equipment_id: equipmentId }
          );
        }
        Alert.alert(
          'Claimed',
          `${equipmentName ?? 'This item'} is now in your personal kit. The EM dashboards will skip it; check the Me tab to release later.`,
          [
            {
              text: 'OK',
              onPress: () => {
                setPendingCode(null);
                handledCodeRef.current = null;
                scannerRef.current?.rearm();
              },
            },
          ]
        );
      } catch (err) {
        logError(
          'ScannerFab.submitClaim',
          'claim update failed',
          err,
          { equipment_id: equipmentId }
        );
        Alert.alert(
          'Claim failed',
          err instanceof Error
            ? err.message
            : 'Try again in a moment.',
          [
            {
              text: 'OK',
              onPress: () => {
                setPendingCode(null);
                handledCodeRef.current = null;
                scannerRef.current?.rearm();
              },
            },
          ]
        );
      }
    },
    [session?.user.email, userId]
  );

  // Don&apos;t render the FAB at all when the user has nothing out.
  if (summary.total === 0) return null;

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[
          styles.layer,
          { bottom: bottomInset },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open scanner. ${summary.total} item${summary.total === 1 ? '' : 's'} checked out.`}
          accessibilityHint="Scans a QR to find a piece of gear in your truck"
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.fab,
            { transform: [{ scale: pressed ? 0.94 : 1 }] },
          ]}
        >
          <Text style={styles.glyph}>🔎</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{summary.total}</Text>
          </View>
        </Pressable>
      </View>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={handleClose}
      >
        <SafeAreaView style={styles.modalSafe} edges={['top']}>
          <QrScanner
            ref={scannerRef}
            onScan={handleScan}
            onClose={handleClose}
            hint={
              summary.total === 1
                ? 'Scan a QR to manage your checked-out item.'
                : `Scan a QR to manage one of your ${summary.total} checked-out items.`
            }
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    right: 16,
    alignItems: 'flex-end',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 8,
      },
    }),
  },
  glyph: {
    fontSize: 26,
    color: '#FFFFFF',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '800',
  },
  modalSafe: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
