# Habit Coach

A local-first habit coach for Android (Capacitor). Everything you log — goals,
habits, completions, check-ins — lives in an on-device SQLite database. Several
screens use a device-only "local profile" path, so the app works fully offline
with no account and no server.

## Stack

- Next.js (App Router) + React 19 + TypeScript + Tailwind CSS v4
- Capacitor 8 for Android packaging
- Community SQLite for on-device storage
- Dormant Prisma/Postgres backend for optional server deployments

## Commands

```bash
npm run dev            # web dev server
npm run lint           # eslint
npx tsc --noEmit       # typecheck
npm run build:android  # NEXT_STATIC_EXPORT=1 next build && npx cap sync android
```

APKs are produced from `android/` with Android Studio or:

```bash
npx cap open android
# then Build > Build App Bundle(s) / APK(s)
```

Release APK: `android/app/build/outputs/apk/release/app-release.apk`

## Themes

The app ships with a quiet-luxury light palette and a full dark mode
(`Light` / `Dark` / `Follow system`). The choice is persisted in
`localStorage` (`habitcoach.theme`) and applied by an inline head script, so
there is no startup flash. Open the Today screen → gear button → Settings.

## Auth modes

The login/sign-up screens are hybrid:

- **Device mode (default).** No env vars required. "Continue with Google" and
  "Continue with email" build an honest local profile; nothing is sent to a
  server and passwords are not collected or stored.
- **Server mode.** Set `NEXT_PUBLIC_HABITFLOW_SERVER=1` and build/deploy with a
  real Node backend and Postgres. The same screens then use real
  email/password sign-in and a real Google sign-in (Google Identity Services
  popup → token verified server-side). See `.env.example` for every required
  variable.

## Environment variables

See `.env.example`. Required for server deployments:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | Session cookie signing secret |
| `GOOGLE_CLIENT_ID` | Server-side Google token verification |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Client-side Google consent popup |
| `NEXT_PUBLIC_HABITFLOW_SERVER` | Enables server-backed auth screens |

Optional: `OPENAI_API_KEY` for server-side coach/insight generation.