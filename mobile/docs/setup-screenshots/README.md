# Setup-guide screenshots

These images are referenced by [`../../SETUP_GUIDE_IPHONE_ANDROID.md`](../../SETUP_GUIDE_IPHONE_ANDROID.md).
The guide renders with placeholder callouts until you drop the real PNGs in
here using the **exact filenames** below. Capture them once, on your own
machine, while you walk the guide the first time — then every future operator
sees the real console screens.

> Why these aren't committed already: they're screenshots of *your* Apple
> Developer, App Store Connect, Google Play Console, and Expo accounts —
> account-specific and behind a login, so they can't be generated for you.
> The guide is fully usable from the text alone; the screenshots are a
> nice-to-have that make it foolproof for a non-technical operator.

## Capture list (filename → what to shoot)

| Filename | Screen to capture | When (guide step) |
|---|---|---|
| `01-expo-login.png` | Terminal after `npx eas login` shows "Logged in as …" | §3 |
| `02-check-eas-pass.png` | Terminal `npm run check-eas` printing the green "OK" line | §2 |
| `10-asc-new-app.png` | App Store Connect → My Apps → the **New App** dialog filled in | iPhone §I-2 |
| `11-asc-app-id.png` | App Information page with the **Apple ID** number circled | iPhone §I-2 |
| `12-eas-build-ios-done.png` | Terminal after `eas build … ios` shows the green ✅ + build URL | iPhone §I-3 |
| `13-testflight-invite.png` | The TestFlight email / "Start Testing" button on the phone | iPhone §I-4 |
| `14-testflight-installed.png` | Starr Field on the iPhone home screen | iPhone §I-4 |
| `20-play-create-app.png` | Play Console → Create app dialog filled in | Android §A-2 |
| `21-play-service-account.png` | Google Cloud → the service-account JSON **Create key** step | Android §A-2 |
| `22-eas-build-android-done.png` | Terminal after `eas build … android` shows the green ✅ + APK URL | Android §A-3 |
| `23-android-install-apk.png` | The Android "Install anyway / unknown source" prompt | Android §A-4 |
| `24-play-internal-testing.png` | Play Console → Internal testing → testers list | Android §A-5 |
| `30-app-signin.png` | The Starr Field sign-in screen on a real phone | §6 smoke test |
| `31-app-capture.png` | The Money tab → receipt capture flow | §6 smoke test |

Recommended: crop to the relevant panel, redact any real Apple Team ID /
email if you share the guide outside the company.
