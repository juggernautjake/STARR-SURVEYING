/**
 * Cross-platform "share a generated file" helper.
 *
 * Used by F1 #9 timesheet CSV export — the user taps Export, we
 * generate a CSV in the app's cache directory, then hand the file
 * URI to expo-sharing's OS share sheet (Mail / AirDrop / Files /
 * etc on iOS; Gmail / Drive / etc on Android).
 *
 * Cache-dir lifetime: the OS may evict cache files at any time, but
 * by the time the user dismisses the share sheet they've either
 * sent the file OR copied it elsewhere — we don't need persistent
 * storage. expo-file-system writes the file synchronously, then
 * shareAsync awaits the OS sheet.
 *
 * Returns true on successful share, false if the user cancelled OR
 * sharing isn't available (rare — almost every device supports it).
 */
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export interface ShareTextFileOptions {
  /** Target filename including extension. */
  filename: string;
  /** File contents (UTF-8 text). */
  contents: string;
  /** MIME type for the share-sheet hint. Defaults to text/csv. */
  mimeType?: string;
  /** Title shown atop the share sheet on iOS. */
  dialogTitle?: string;
}

export async function shareTextFile(opts: ShareTextFileOptions): Promise<boolean> {
  const mimeType = opts.mimeType ?? 'text/csv';
  const dialogTitle = opts.dialogTitle ?? 'Share';

  // expo-sharing.isAvailableAsync returns false on iOS Simulator
  // pre-iOS 14 and on web; surface that as a graceful no-op rather
  // than an exception.
  const available = await Sharing.isAvailableAsync();
  if (!available) return false;

  const uri = `${FileSystem.cacheDirectory ?? ''}${opts.filename}`;

  try {
    await FileSystem.writeAsStringAsync(uri, opts.contents, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    await Sharing.shareAsync(uri, {
      mimeType,
      dialogTitle,
      UTI: mimeType === 'text/csv' ? 'public.comma-separated-values-text' : undefined,
    });
    return true;
  } catch (err) {
    // User-dismissed share isn't an error on iOS but on Android can
    // surface as a thrown exception. Treat as a no-op.
    console.warn('[share] shareTextFile failed:', err);
    return false;
  }
}
