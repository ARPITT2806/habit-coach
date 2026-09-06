# Play Store Release Pack — Habit Coach v1.0.0 (versionCode 1)

Application ID (permanent): `io.habitcoach.android`
Target / compile SDK: 36 (Android 16) · Min SDK: 24 · versionCode 1 · versionName 1.0.0

## Signing

- APK/AAB signed with `android/release-keystore.jks`, alias `habitcoach`
  (store/key password in `android/keystore.properties`, both gitignored).
- Cert SHA-256: `7d4c591b3e05b973f5111ab2580f13a5f2bd47401f93be66ba7ce09a6893a3c4`
  (CN=Habit Coach) — valid to 2054.
- Enable **Play App Signing** on first upload; the key above becomes the upload key.
  Google signs the AAB for distribution; keep keystore + passwords backed up off-machine.
- Release candidate: `android/app/build/outputs/bundle/release/app-release.aab`
  (validated with bundletool 1.18.3).

## Store listing inputs

- App name (≤30): **Habit Coach**
- Short description (≤80 chars): *A local-first habit tracker with an adaptive
  coach that gives you data-driven nudges.*
- Full description (≤4000): see below.
- Category: **Health & Fitness**
- Tags / apps links: none used.
- Content rating questionnaire: no required inputs beyond "no content"
  (no violence/blood, no drugs/tobacco/alcohol content, no mature content, no
  gambling, no user-generated content, no interactive elements that require
  rating); recommended result: **Everyone**.
- Data safety form: see section below.
- Target audience & content: all ages; privacy-sensitive (local-only is a selling point).
- Pricing: free, no in-app purchases, no ads.

## Full description (draft)

> **Build habits that actually fit your life.**
>
> Habit Coach is a quiet, local-first habit tracker. You name a goal, choose
> one habit to start with, and describe how it fits your schedule. Then the
> coach watches your real behavior — what you complete, skip, or miss, and
> why — and only suggests changes when the data supports them.
>
> Nothing is uploaded. Your habits, check-ins, and history live in a local
> database on your device. No account needed, no ads, no trackers.
>
> **How it works**
> - **Today** — your day at a glance: what's scheduled, what's done, and a
>   ten-second evening check-in.
> - **Coach** — actionable observations based on what you actually logged, with
>   plain-language explanations. No generic motivational spam.
> - **Insights** — your real patterns: schedule fit, timing shifts, and the
>   effectiveness of the habits you changed. Everything is derived locally from
>   your own history.
>
> Start with one habit. Understand more. Change only when the data says so.
>
> Data stays on this device.

## Data safety form (answers)

The app does **not** collect or share data.

| Question | Answer |
| --- | --- |
| Does your app collect or share user data? | No — see below |
| Data collected | None (no personal, financial, health, location, photos, messages, etc. is collected, transmitted, or stored off-device) |
| Data shared | None |
| Data types | N/A |
| Collection methods | N/A |
| Data encrypted in transit | N/A (no transit) |
| Can user request data deletion | Yes — deleting the app removes all data (local only) |
| Policy URL | Must be a public URL; host `store-assets/PRIVACY_POLICY.md` (Founder task) |
| Sign-in | Not collected (local in-memory only; email/password never stored or transmitted) |
| Health-related | The app is "Health & Fitness" in category but tracks no medical or fitness sensor data; no fit data collected — declare "Not collected" accurately |

Declaration is safe to mark **"No data collected or shared."**

## Screenshots (phone, 9:16 ideal)

Capture from device:
1. Login / entry
2. Onboarding (goal + habit)
3. Today (with a scheduled habit + check-in)
4. Coach (an observation from logged data)
5. Insights (pattern stats)

Use `store-assets/screenshots/` in portrait 1080×2340. [BLOCKED on device — airplane-mode test still running]

## Store icon

`store-assets/icon-512.png` (512×512, opaque, emblem on white — matches launcher).

## Release checklist for the Play Console

1. Upload `app-release.aab` to a **closed/internal track** first.
2. Accept **Play App Signing**.
3. Fill listing (name/desc/screenshots/icon above), content rating, data safety, audience.
4. Provide privacy policy public URL (host `PRIVACY_POLICY.md`).
5. Let Play review (16h+ to a few days, targetSdk 36 compliant).
6. Promote to production after approval.
7. Increase versionCode (and versionName) for every subsequent release; never roll back versionCode.