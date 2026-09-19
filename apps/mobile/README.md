# TNigazhvu
# CM News Tamil Nadu — mobile app

Expo (React Native) app. White-first monochrome editorial design: white, black and black at
controlled opacity only; publisher photos are rendered in black and white.
Talks only to our backend API (never to GDELT).

```bash
npm install
npx expo start   # Expo Go: the app calls the API on this computer's LAN IP, port 3000
npm run typecheck
```

For release builds set `EXPO_PUBLIC_API_BASE_URL=https://<API_DOMAIN>` (or `expo.extra.apiBaseUrl`
in `app.json`) and build with EAS (`npx eas build`). Deep links: `cmnews://article/<id>`,
`cmnews://category/<slug>`, `cmnews://search`.

Structure: `src/api` (client + TanStack Query hooks), `src/state` (settings, auth, bookmarks),
`src/theme/tokens.ts` (colours, type scale, spacing, radius, icons, motion), `src/components`, `src/screens`, `src/navigation`.
App icons, splash and onboarding images live in `assets/` and must stay monochrome. The app is
light-only (`userInterfaceStyle: "light"`), so there is no dark splash variant.

## Android releases and in-app updates

The app uses Google Play's official In-App Updates API through a small local Expo module
(`modules/play-app-update`, Kotlin, wrapping `com.google.android.play:app-update`). The policy and
UI live in `src/updates/`. Nothing is downloaded or installed by the app itself: Google Play does it.

- **Normal release:** users see a "New version available" sheet (Update now / Later). The update
  downloads in the background while they keep reading, then a "Restart now" card appears.
  "Later" keeps the app quiet for the rest of that session.
- **Mandatory release:** publish it with an in-app update priority of **4 or 5**. Users get
  Google Play's own full-screen immediate update; backing out of it shows it again.
  (Threshold: `IMMEDIATE_PRIORITY` in `src/updates/updatePolicy.ts`.)
- **Never blocks the app:** the first check runs about 2.5 s after launch, in the background.
  Resume checks run at most every 6 hours, except while an update is in progress. Any failure
  (sideloaded APK, no Play Store, offline, timeout) is silent.
- **Off in debug builds**, on iOS, and in Expo Go.

### Publishing a release

1. Increase `expo.android.versionCode` in `app.json` (Google Play compares versionCode, not
   `version`). Optionally bump `expo.version` (shown in Settings as `0.1.0 (1)`).
2. Point the app at the production API over **HTTPS**: `EXPO_PUBLIC_API_BASE_URL=https://api.example.org`.
   Release builds block plain `http`, so a release built against `http://localhost:3000` cannot load news.
3. `npx expo prebuild --platform android` then `cd android && ./gradlew bundleRelease`.
   Google Play needs an **AAB** (`app/build/outputs/bundle/release/app-release.aab`), signed with
   your **upload key**. The generated project signs release builds with the debug key, which
   Google Play rejects: configure a release keystore (or use EAS Build) before uploading.
4. Setting the update priority: the Play Console UI does not expose it. Set `inAppUpdatePriority`
   (0-5) on the release with the Google Play Developer API (`edits.tracks.update`) when publishing.

### Testing updates (must be done through Google Play)

In-app updates only work for builds installed **from Google Play**. A locally installed APK
always sees "no update", which is also a useful check that the app stays silent.

1. Upload build N (versionCode N) to **Internal testing** (or use **Internal app sharing**) and
   install it on a device from the Play Store with a tester account.
2. Upload build N+1 to the same track. Open the Play Store page once so the device learns about it.
3. Open build N:
   - priority 0-3: the sheet appears, then "Update now" → background download → "Restart now" →
     the new version starts. Also check "Later", backgrounding during the download, and closing
     the app after it finishes (on reopen, "Restart now" is offered again).
   - priority 4-5: Google Play's immediate update appears; cancelling shows it again.
4. Airplane mode, or a device without the Play Store: the app opens normally with no messages.
