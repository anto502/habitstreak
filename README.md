# Habit Streak

Offline-first daily habit tracker with streaks, achievement badges, dark mode, local reminders, and non-intrusive AdMob monetization (banner, interstitial, rewarded).

## What's included
- `index.html` / `js/app.js` — the full app (Material Design 3 style, single-page)
- `manifest.json`, `service-worker.js`, `icons/` — PWA install + offline support
- `privacy-policy.html`, `store-listing.md` — Play Store compliance content
- `capacitor.config.json`, `package.json` — native Android wrapper config
- `.github/workflows/build.yml` — builds a debug APK automatically on every push, no PC needed

## Before you build: replace placeholder AdMob IDs
In `js/app.js`, replace these three placeholders with your real AdMob unit IDs from your AdMob console:
```
ca-app-pub-XXXXXXXXXXXXXXXX/BANNER_ID
ca-app-pub-XXXXXXXXXXXXXXXX/INTERSTITIAL_ID
ca-app-pub-XXXXXXXXXXXXXXXX/REWARDED_ID
```
Also add your AdMob App ID to `android/app/src/main/AndroidManifest.xml` (created after `cap add android`) inside the `<application>` tag:
```xml
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY"/>
```

## How ads stay non-intrusive
- **Banner**: one fixed adaptive banner at the bottom only — never overlaps content or buttons.
- **Interstitial**: throttled to roughly once every 6 habit check-ins (`AdManager.interstitialEveryNActions` in `app.js`), never shown mid-action.
- **Rewarded**: fully opt-in via the "Watch a short ad" card on the Badges screen — never forced.

---

## Exporting this project to an Android APK / AAB (from your phone, same workflow as Velo VPN)

**1. Push this project to a new GitHub repo**
- Create a new repo (e.g. `habitstreak`) on GitHub from your phone browser or GitHub app.
- Upload all files in this project (keeping the folder structure, including the hidden `.github/workflows/build.yml`).

**2. Let GitHub Actions build the first APK**
- Go to the repo's **Actions** tab → select **Build Android APK** → **Run workflow**.
- The workflow installs Capacitor, runs `npx cap add android` automatically (creates the `android/` folder in the repo on first run — commit it back, or let the workflow regenerate it each run), then builds `app-debug.apk`.
- Once it finishes, open the workflow run → **Artifacts** → download `habitstreak-debug-apk`. Install it directly on your phone to test.

**3. Generate a signed release build (required for Play Store)**
A release AAB must be signed. Since you're on mobile-only, do this with GitHub Actions + repo secrets instead of a local keystore:
- Generate a keystore once using an online Java keytool service or ask a friend with a PC to run:
  `keytool -genkey -v -keystore release.keystore -alias habitstreak -keyalg RSA -keysize 2048 -validity 10000`
- Base64-encode the keystore file and add these as GitHub repo **Settings → Secrets and variables → Actions**:
  - `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`
- Extend `build.yml` with a release job that decodes the secret back to a `.keystore` file, points `android/app/build.gradle` `signingConfigs` at it, and runs `./gradlew bundleRelease` to produce `app-release.aab` — the file you upload to Play Console.
- (If you'd like, ask me next and I'll write that exact signing job for you.)

**4. Upload to Google Play Console**
- Create an app in [Play Console](https://play.google.com/console) (one-time $25 registration fee if you haven't already).
- Fill in the Store Listing using `store-listing.md` (title, descriptions, keywords).
- Upload `icons/icon-512.png` as the app icon, and create a 1024x500 feature graphic.
- Upload screenshots (see suggestions in `store-listing.md`).
- Host `privacy-policy.html` somewhere public (GitHub Pages works: enable Pages on this repo, pointing to the root — the URL becomes `https://yourusername.github.io/habitstreak/privacy-policy.html`) and paste that URL into the Privacy Policy field.
- Upload the signed `app-release.aab` under **Production → Create new release**.
- Complete the Content rating questionnaire, Data safety form (mention AdMob's ad ID + usage data collection), and target audience settings.
- Submit for review.

That's the same push-to-GitHub → Actions-builds-it flow you're already using for Velo VPN — just a different repo.
