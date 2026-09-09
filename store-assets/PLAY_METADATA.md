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
- Short description (≤80 chars): *A local-first habit tracker that coaches you
  from your own data.* (64 chars.)
- Full description (≤4000): see below.
- Category: **Health & Fitness**
- Tags / apps links: none used.
- Content rating questionnaire: no required inputs beyond "no content"
  (no violence/blood, no drugs/tobacco/alcohol content, no mature content, no
  gambling, no user-generated content, no interactive elements that require
  rating); recommended result: **Everyone**.
- Data safety form: answer **"No data collected or shared"** — see
  `DATA_SAFETY.md` for the full walkthrough.
- Target audience & content: all ages; privacy-sensitive (local-only is a selling point).
- Pricing: free, no in-app purchases, no ads.

### Required but not yet provided

These must be filled by the Founder (no invented/public URLs or identity):

1. **Privacy policy public URL** — host `PRIVACY_POLICY.md` somewhere public
   (GitHub Pages `/raw`, Notion public, etc.). Placeholder used in-app and in
   docs: `[PRIVACY_POLICY_URL_REQUIRED]`.
2. **Developer contact email** — shown in the play listing, in Data safety,
   and as `[DEVELOPER_CONTACT_EMAIL_REQUIRED]` in the privacy policy text.
3. **Developer legal name / account identity** — Play Console declares the
   developer legal entity; not invented here.

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

The app does **not** collect or share data. Full form walkthrough in
`DATA_SAFETY.md`. Declaration: **"No data collected or shared."**

## Store graphics

- **Icon:** `store-assets/icon-512.png` (512×512, opaque, emblem on white —
  matches launcher).
- **Feature graphic** (REQUIRED, exactly 1024×500, JPEG or 24-bit PNG, **no
  alpha**): `store-assets/feature-graphic.png`. Keep key text/artwork inside
  the center ~80%; preview it cropped to square/2:1 before upload.
- **Phone screenshots** (min 2, max 8; recommended 1080×1920, we use 1080×2340,
  RGB, no alpha — captured on-device):
  1. `store-assets/screenshots/1-today-done.png` — Today with a completed habit
  2. `store-assets/screenshots/2-evening-checkin.png` — evening check-in
  3. `store-assets/screenshots/3-coach.png` — coach observation
  4. `store-assets/screenshots/4-insights.png` — insight patterns
  - Optional 5th: onboarding screen (goal + habit setup).
- **Tablet screenshots:** not needed — App ships phone-only UI; do not declare
  large-screen optimization.

## Privacy compliance (already implemented in v1.0.0)

- In-app `/privacy` route (static, reachable without sign-in) and "Privacy
  policy" link on the login/sign-up screens.
- In-app **"Delete all data on this device"** control on the login screen
  (two-tap confirm, no sign-in required) → permanently deletes the local SQLite
  database, satisfying Play's account/data-deletion requirement.

## Release checklist for the Play Console

1. Upload `app-release.aab` to a **closed/internal track** first.
2. Accept **Play App Signing**.
3. Fill listing (name/desc/icon/feature graphic/screenshots above), content
   rating (Everyone), data safety (No data collected/shared), audience, and
   enter the 3 Founder-provided items in "Required but not yet provided".
4. Provide the privacy policy public URL (host `PRIVACY_POLICY.md`).
5. Cross-check the privacy policy against the in-app `/privacy` page
   (`src/app/privacy/page.tsx`) — keep them in sync.
6. Let Play review (16h+ to a few days, targetSdk 36 compliant).
7. Promote to production after approval.
8. Increase versionCode (and versionName) for every subsequent release; never
   roll back versionCode.