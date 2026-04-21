# HealthDiary

Mobile-first health management app built with Expo and React Native for Android phones like the Galaxy S23.

## What it does

- Logs meals with text and optional photos.
- Logs workouts with text and optional images.
- Supports running metrics: distance, pace, average heart rate.
- Supports badminton metrics: total time.
- Logs daily weight values on a calendar view.
- Tracks goals and runs AI coaching against current records.
- Works with either OpenAI or Gemini, with a local fallback preview if no key is configured.

## Stack

- Expo SDK 54
- React Native + React Navigation
- AsyncStorage for local persistence
- Expo Image Picker for meal/workout photos
- OpenAI Responses API or Gemini `generateContent` via direct fetch

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Optional: configure AI keys.

```bash
cp .env.example .env.local
```

Fill any of these values:

- `EXPO_PUBLIC_OPENAI_API_KEY`
- `EXPO_PUBLIC_OPENAI_MODEL`
- `EXPO_PUBLIC_GEMINI_API_KEY`
- `EXPO_PUBLIC_GEMINI_MODEL`

3. Start the app:

```bash
npm run android
```

For browser preview:

```bash
npm run web
```

## Galaxy S23 usage

- Install Expo Go on the phone.
- Run `npm run android` or `npm start`.
- Scan the QR code from the Metro terminal.
- The UI is tuned for portrait phone layouts and touch targets.

## Android Studio and APK flow

### 1. View the app on a PC emulator

Install Android Studio and complete the SDK setup. For Expo and React Native, make sure the Android 15 SDK / Platform 35 is installed, along with Android Emulator and SDK Build-Tools.

After installation, set your shell environment to the Android SDK location shown in Android Studio:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools"
```

Reload your shell and verify:

```bash
source ~/.zshrc
adb version
```

Then:

```bash
npm run android
```

### 2. Install as an APK on a phone

This project includes an `eas.json` profile for APK builds.

First-time setup:

```bash
npm run eas:configure
```

Build an installable APK:

```bash
npm run build:apk
```

Build a Play Store style Android App Bundle:

```bash
npm run build:aab
```

Use the APK URL from the Expo build page to install directly on your Galaxy phone, or download the file and install it with `adb`.

## AI provider notes

- Default OpenAI model: `gpt-5-mini`
- Default Gemini model: `gemini-2.5-flash`
- Provider choice and keys can also be edited inside the Goals screen.
- For production, move AI requests to your own backend instead of shipping provider keys in the client.

## Verification

- `npm run typecheck`
- `npx expo export --platform web`
