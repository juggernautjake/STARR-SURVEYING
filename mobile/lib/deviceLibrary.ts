/**
 * Device photo-library backup.
 *
 * Per the user's resilience requirements: "save images and videos and
 * voice recordings to the app and the data also need to be able to be
 * saved to the phone storage as well." This is the second saver — the
 * first is FileSystem.documentDirectory via lib/uploadQueue.ts (the
 * canonical source-of-truth that drives the Supabase upload). This
 * second copy is the user's personal backup in their Photos app, so
 * if something catastrophic happens to the app's storage they still
 * have the photos.
 *
 * Off by default to respect privacy — receipts contain card numbers
 * + amounts, and some users don't want their work imagery
 * intermingled with personal photos. Toggle on via the Me tab; the
 * preference lives in AsyncStorage.
 *
 * Caller flow:
 *
 *   import { saveCopyToDeviceIfEnabled } from './deviceLibrary';
 *   // after a successful capture …
 *   void saveCopyToDeviceIfEnabled(localFileUri, 'fieldMedia.attachPhoto');
 *
 * Permission is requested lazily (first save). If denied, the
 * preference flips off + a logWarn fires; the parent flow continues
 * unaffected.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';

import { logInfo, logWarn } from './log';

const PREF_KEY = '@starr-field/save_to_device_library';
/** The MediaLibrary album the app's saves land in. Keeps work
 *  imagery grouped + easy to find / bulk-delete later. */
const ALBUM_NAME = 'Starr Field';

// ── Preference ────────────────────────────────────────────────────────────────

let cachedPref: boolean | null = null;

export async function getDeviceLibraryPref(): Promise<boolean> {
  if (cachedPref != null) return cachedPref;
  try {
    const raw = await AsyncStorage.getItem(PREF_KEY);
    cachedPref = raw === 'true';
    return cachedPref;
  } catch (err) {
    logWarn('deviceLibrary.getPref', 'AsyncStorage read failed', err);
    return false;
  }
}

export async function setDeviceLibraryPref(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(PREF_KEY, enabled ? 'true' : 'false');
    cachedPref = enabled;
    logInfo('deviceLibrary.setPref', enabled ? 'enabled' : 'disabled');
  } catch (err) {
    logWarn('deviceLibrary.setPref', 'AsyncStorage write failed', err, {
      enabled,
    });
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────

/**
 * Save the file at `localFileUri` to the device's photo library
 * under the "Starr Field" album, but only when the user has enabled
 * the preference. Best-effort: failures (permission denial, library
 * full, etc.) log a warn breadcrumb and return false without
 * disrupting the parent capture flow.
 *
 * Designed to be fired forget: `void saveCopyToDeviceIfEnabled(...)`.
 */
export async function saveCopyToDeviceIfEnabled(
  localFileUri: string,
  scope: string
): Promise<boolean> {
  const enabled = await getDeviceLibraryPref();
  if (!enabled) return false;

  // Permission check + lazy prompt. If denied, flip the pref off so
  // the user doesn't see a prompt every capture.
  const perm = await MediaLibrary.getPermissionsAsync(true);
  let granted = perm.granted;
  if (!granted && perm.canAskAgain) {
    const requested = await MediaLibrary.requestPermissionsAsync(true);
    granted = requested.granted;
  }
  if (!granted) {
    logWarn(
      `${scope}.deviceLibrary`,
      'permission denied — disabling save-to-device pref',
      undefined,
      { can_ask_again: perm.canAskAgain }
    );
    await setDeviceLibraryPref(false);
    return false;
  }

  try {
    const asset = await MediaLibrary.createAssetAsync(localFileUri);
    // Best-effort: drop into the named album so the user can find
    // their work captures alongside their personal photos. If the
    // album doesn't exist, create it.
    let album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
    if (!album) {
      album = await MediaLibrary.createAlbumAsync(ALBUM_NAME, asset, false);
    } else {
      await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    }
    logInfo(`${scope}.deviceLibrary`, 'saved to device', {
      asset_id: asset.id,
      album_id: album.id,
    });
    return true;
  } catch (err) {
    logWarn(`${scope}.deviceLibrary`, 'save failed', err, { localFileUri });
    return false;
  }
}
