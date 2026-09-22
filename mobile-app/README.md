# PharmDetect Mobile App

A real Capacitor project — not just the HTML file opened in a browser. This wraps the
Detector App in native iOS and Android shells and gives it a proper on-device QR
scan engine, so scanning doesn't depend on whichever camera app happens to be
installed on the phone (most stock camera apps don't decode QR codes at all, and the
ones that do won't hand the decoded value to this app anyway).

## How scanning works here

- **On a packaged native device (the actual point of this project):**
  [`@capacitor-mlkit/barcode-scanning`](https://github.com/capawesome-team/capacitor-mlkit)
  runs Google's ML Kit scanner on-device. It's what "Scan" calls when
  `Capacitor.isNativePlatform()` is true. This is a dedicated scan engine bundled
  into the app itself — it works the same way regardless of what camera app the
  phone ships with.
- **In a plain browser (useful while developing, before you've built for a device):**
  falls back automatically to `getUserMedia` + `jsQR`, the same approach the
  standalone `detector_app.html` uses. You'll see which engine is active in the small
  badge at the top of the app.
- **Photo upload fallback:** works identically either way, decoded with `jsQR`.

## Setup

```bash
npm install
npm run sync     # builds the JS bundle and copies it into both native projects
```

`npm run sync` (or `npm run build` alone) is required after **every** change to
`src/main.js` — Capacitor apps load a pre-bundled JS file, not the source directly,
so edits to `src/main.js` don't take effect until you rebuild.

Before your first real build, edit `DEFAULT_API_BASE_URL` near the top of
`src/main.js` to point at your deployed Pharmaceutical Database server (see
`../pharma-server/README.md` and `../DEPLOYMENT.md`), then run `npm run sync` again.

## Building for a device

You'll need the platform's own toolchain installed — Capacitor doesn't replace this:

- **Android:** [Android Studio](https://developer.android.com/studio) installed.
  Run `npm run android` — this builds the web bundle, syncs it, and opens the
  project in Android Studio. From there, Run on a connected device or emulator.
- **iOS:** a Mac with [Xcode](https://developer.apple.com/xcode/) installed. Run
  `npm run ios` — same idea, opens the Xcode project. Camera scanning barely works
  in the iOS Simulator, so test on a physical device once you're past basic UI checks.

## Permissions already configured

- **Android** (`android/app/src/main/AndroidManifest.xml`): `CAMERA`,
  `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`.
- **iOS** (`ios/App/App/Info.plist`): `NSCameraUsageDescription` and
  `NSLocationWhenInUseUsageDescription` — both stores reject submissions missing
  these strings, so don't remove them.

## Publishing to the stores

This project gets you to a device build; app-store submission itself (developer
accounts, signing certificates, store listings, privacy policy) is a separate process
covered in the earlier mobile-packaging guidance — ask if you want that walked
through again now that there's an actual project to submit.
