// mobile/lib/cameraRollSave.ts — the PURE "should this capture also be saved to the phone's camera roll?"
// decision. The owner's flow: "I take the video or picture. The media shows up in the app AND is saved to
// the phone." So the default is ON (opt-OUT), unlike the app's existing opt-in device-library backup
// (deviceLibrary.getDeviceLibraryPref defaults OFF). This pure helper encodes the owner-correct default so
// the runtime saves to the camera roll unless the surveyor turns it off. Expo-free + deterministic, like the
// other upload engines; the runtime reads it before calling MediaLibrary.

export type CameraRollPref = 'on' | 'off';

/** The owner wants captured media on the phone by default. */
export const DEFAULT_CAMERA_ROLL_PREF: CameraRollPref = 'on';

/** Coerce a persisted/unknown value to a valid preference — anything but an explicit 'off' means ON, so a
 *  missing/corrupt setting still saves the capture (never silently loses it from the phone). */
export function normalizeCameraRollPref(value: unknown): CameraRollPref {
  return value === 'off' ? 'off' : 'on';
}

/** Whether to copy this capture into the camera roll (default ON). */
export function shouldSaveToCameraRoll(pref: unknown): boolean {
  return normalizeCameraRollPref(pref) === 'on';
}

const LABELS: Record<CameraRollPref, string> = {
  on: 'Save captures to my phone',
  off: 'Don’t save to my phone',
};
export function cameraRollPrefLabel(pref: CameraRollPref): string {
  return LABELS[pref];
}
