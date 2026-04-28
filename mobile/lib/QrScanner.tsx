/**
 * QrScanner — full-screen camera overlay that scans QR codes and
 * calls onScan with the decoded string (Phase F10.1j).
 *
 * Reusable across §5.12.9.1 entry points:
 *   - Loadout card → "Scan to check out"
 *   - Me-tab "What's in my truck" → per-card Return button
 *   - Persistent FAB on the Me tab when any check-out is open
 *
 * Phase F10.1j ships only the scanner shell; the host screens
 * + the §5.12.6 check-in/out flow that consumes the scanned QR
 * land in F10.5. Standalone use works today: parent passes
 * onScan + onClose; this component handles permissions, camera
 * mount, scan detection, scan-line animation hint, dark overlay
 * with reticle window, retry/close affordances.
 *
 * Behaviour:
 *   * Auto-requests camera permission on mount; renders an explainer
 *     + Open Settings button when denied.
 *   * Once a QR is decoded, fires onScan ONCE per session — parent
 *     decides whether to keep the scanner mounted (kit-batch flow,
 *     §5.12.6) or close it (single check-out). The component sets
 *     an internal `armed=false` after first scan so the camera
 *     doesn't fire onScan in a loop while the parent processes.
 *     Parent calls `rearm()` via the imperative ref to scan again.
 *   * Dark backdrop with a centered ~70% width reticle window;
 *     scan-line slides top→bottom inside the reticle (CSS animation
 *     equivalent via React Native Animated).
 *   * Top-right ✕ to close; bottom toast surfaces "Scanning…" then
 *     the matched code or "Not recognised" briefly when onScan
 *     returns no match (parent reports back via the rearm path).
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

export interface QrScannerHandle {
  /** Re-arm the scanner after the parent finishes processing the
   *  previous decode. Used by kit-batch check-out (§5.12.6) to keep
   *  the scanner open across multiple QR captures. */
  rearm(): void;
}

interface QrScannerProps {
  /** Called once per scan with the decoded QR string. The component
   *  is single-shot until the parent calls `rearm()` via ref. */
  onScan: (qrCodeId: string) => void;
  /** Top-right ✕ press handler. */
  onClose: () => void;
  /** Optional helper text rendered below the reticle. */
  hint?: string;
}

export const QrScanner = forwardRef<QrScannerHandle, QrScannerProps>(
  function QrScanner({ onScan, onClose, hint }, ref) {
    const [permission, requestPermission] = useCameraPermissions();
    const [armed, setArmed] = useState(true);
    const [lastCode, setLastCode] = useState<string | null>(null);

    const scanLineAnim = useRef(new Animated.Value(0)).current;

    useImperativeHandle(ref, () => ({
      rearm: () => {
        setArmed(true);
        setLastCode(null);
      },
    }));

    // Loop the scan-line animation while armed. Stop when fired so
    // the visual matches the "captured" state (parent processes).
    useEffect(() => {
      if (!armed) {
        scanLineAnim.stopAnimation();
        return;
      }
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }, [armed, scanLineAnim]);

    // Request permission lazily on first mount so the explainer
    // overlay renders the right state.
    useEffect(() => {
      if (permission && !permission.granted && permission.canAskAgain) {
        void requestPermission();
      }
    }, [permission, requestPermission]);

    const handleScan = useCallback(
      ({ data }: { data: string }) => {
        if (!armed) return;
        const code = (data ?? '').trim();
        if (!code) return;
        if (code === lastCode) return; // de-dup repeated emissions for the same frame
        setArmed(false);
        setLastCode(code);
        onScan(code);
      },
      [armed, lastCode, onScan]
    );

    if (!permission) {
      // Permissions API still loading.
      return (
        <View style={styles.fullscreenDark}>
          <Text style={styles.statusText}>Loading camera…</Text>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.fullscreenDark}>
          <View style={styles.permissionPanel}>
            <Text style={styles.permissionTitle}>Camera access needed</Text>
            <Text style={styles.permissionBody}>
              The QR scanner uses your camera to read equipment stickers.
              We don&apos;t store the camera feed; only the decoded code
              gets sent to the resolver.
            </Text>
            {permission.canAskAgain ? (
              <Pressable
                style={styles.primaryBtn}
                onPress={() => void requestPermission()}
              >
                <Text style={styles.primaryBtnText}>Grant camera access</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.primaryBtn}
                onPress={() => void Linking.openSettings()}
              >
                <Text style={styles.primaryBtnText}>Open Settings</Text>
              </Pressable>
            )}
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.fullscreen}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={armed ? handleScan : undefined}
        />

        {/* Dark backdrop with cut-out reticle window. We achieve the
            "spotlight" effect with four solid overlays around a
            transparent center. */}
        <View pointerEvents="none" style={styles.reticleOverlay}>
          <View style={[styles.dim, styles.dimTop]} />
          <View style={styles.reticleRow}>
            <View style={[styles.dim, styles.dimSide]} />
            <View style={styles.reticle}>
              <View style={[styles.cornerBase, styles.cornerTopLeft]} />
              <View style={[styles.cornerBase, styles.cornerTopRight]} />
              <View style={[styles.cornerBase, styles.cornerBottomLeft]} />
              <View style={[styles.cornerBase, styles.cornerBottomRight]} />
              <Animated.View
                style={[
                  styles.scanLine,
                  {
                    transform: [
                      {
                        translateY: scanLineAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 240],
                        }),
                      },
                    ],
                    opacity: armed ? 1 : 0,
                  },
                ]}
              />
            </View>
            <View style={[styles.dim, styles.dimSide]} />
          </View>
          <View style={[styles.dim, styles.dimBottom]}>
            <Text style={styles.hintText}>
              {armed
                ? (hint ?? 'Center the QR sticker in the frame')
                : `Scanned ${lastCode ?? ''}`}
            </Text>
          </View>
        </View>

        {/* Close button (above overlays so it stays interactive). */}
        <Pressable
          style={styles.closeIconBtn}
          onPress={onClose}
          accessibilityLabel="Close scanner"
        >
          <Text style={styles.closeIconText}>✕</Text>
        </Pressable>
      </View>
    );
  }
);

const RETICLE_SIZE = 240;

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenDark: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  statusText: { color: '#FFF', fontSize: 14 },
  permissionPanel: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 20,
    maxWidth: 340,
    gap: 12,
  },
  permissionTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  permissionBody: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 18,
  },
  primaryBtn: {
    backgroundColor: '#1D3095',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  closeBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  closeBtnText: { color: '#94A3B8', fontSize: 13 },
  reticleOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  dim: { backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  dimTop: { flex: 1 },
  dimSide: { flex: 1 },
  dimBottom: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 24,
  },
  reticleRow: { flexDirection: 'row', height: RETICLE_SIZE },
  reticle: {
    width: RETICLE_SIZE,
    height: RETICLE_SIZE,
    overflow: 'hidden',
  },
  cornerBase: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#FFF',
    borderWidth: 0,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 2,
    backgroundColor: '#15803D',
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  hintText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  closeIconBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIconText: { color: '#FFF', fontSize: 18, fontWeight: '600' },
});
