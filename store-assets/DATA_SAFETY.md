# Data Safety Declaration — Habit Coach (v1.0.0)

Source of truth: verified build behavior (`applicationId io.habitcoach.android`,
Capacitor + `@capacitor-community/sqlite` + `@capacitor-community/speech-recognition`,
`allowBackup=false`, INTERNET permission only). Declaration uses Play's definition
of "collected" = data transmitted off the device or stored off-device.

## Bottom line

**The app does not collect or share any data.** Mark **"No data collected or
shared."** on the Play Console Data safety form.

## Answers for the Play Console form

| Question | Answer / guidance |
| --- | --- |
| Does your app collect or share any of the required user data types? | **No** (all categories: Personal, Financial, Health & fitness, Messages, Photos/Videos, Audio, Files & docs, Calendar, Contacts, App activity, Web browsing, Device or other identifiers, Location) |
| Data collected | None — nothing is transmitted off the device and nothing is stored off-device |
| Data shared with third parties | None |
| Data types (if any) | N/A |
| Collection methods | N/A (no collection) |
| Data encrypted in transit | N/A (no transit) |
| Data encrypted at rest | N/A for the form; locally the DB is unencrypted in the app sandbox (disclose in privacy policy only) |
| Can users request data deletion | Yes — in-app "Delete all data on this device" on the login screen (no sign-in needed); also uninstall / clear app data |
| Sign-in / account | No real account system. Name/email/password fields exist for the local flow but the values are never stored, used, or transmitted — they are discarded immediately. Declare "Not collected" (ephemeral, in-memory only). |
| Health and fitness data | The App is categorized "Health & Fitness" but receives/generates no medical or sensor data; it only stores habits the user types. Declare "Not collected". |
| Audio | **Not collected by the App** — voice commands are transcribed by the Android speech recognition service on the device; the App does not store, upload, or process audio off-device. Note in the privacy policy that speech recognition is handled by the device/Android (under the user's Google account settings), not by the developer. |
| Requires a privacy policy URL | Yes — a publicly hosted copy of `store-assets/PRIVACY_POLICY.md`. Placeholder: `[PRIVACY_POLICY_URL_REQUIRED]` |

## Data flows (verified)

- **On-device, persistent:** goals, habits, completions, check-ins, notes,
  rhythm/insight derivations — SQLite file in app private storage.
- **On-device, ephemeral:** name/email/password typed on login/signup screens
  (read into memory, never persisted, never transmitted).
- **On-device, functional (no collection):** optional local reminders ("Nudges")
  read habit data from the local DB and schedule Android alarms on the device;
  notification taps write completions back to the local DB. Voice input to "Ask
  Habit Coach" is transcribed by the Android speech recognition service on the
  device; recognized words are used only in-app, and neither audio nor speech
  is stored or transmitted.
- **Off-device:** none. No server requests anywhere in the bundle; INTERNET
  permission exists only for Capacitor's local `https://localhost` WebView
  loopback, which is served by the app itself.
- **Backups:** disabled (`allowBackup=false`), so data never reaches Google
  Drive/cloud.
- **SDKs/plugins:** `@capacitor-community/sqlite` (local file I/O only, no
  network); no analytics/ad/crash SDKs.