# Privacy Policy — Habit Coach

_Last updated: September 6, 2026_

_[DEVELOPER_LEGAL_NAME_REQUIRED]_ ("we", "us", "the developer") operates the
Habit Coach app ("the App", available on Google Play under the app ID
`io.habitcoach.android`).

## The short version

Habit Coach is a local-first habit and behavior tracking app. Everything you
enter — your goals, habits, completions, check-ins, and notes — is stored only
in a SQLite database on your device. Nothing is uploaded to a server, and the
App has no account system, no analytics, no advertising SDKs, and no tracking.

## What we access and collect

Nothing. We do not collect, transmit, or store any personal data on any server.

- Habits, goals, completions, and check-ins you record are stored locally in a
  database on your device and never leave it. The App only reads and writes
  this data to power its own features.
- If you enter your name, email, or password on the login or sign-up screens,
  those values are used only in memory for the local sign-in flow. Your
  password is never sent anywhere and is not stored. Your email is not stored
  or used.
- We do not use third-party analytics, crash-reporting services, advertising
  identifiers, or cookies.

## How your data is used

Data you enter is used only to power the App's features on your device:
showing your schedule, computing your insights, and generating coach
observations. All of this happens locally. No data is used for any other
purpose.

## How your data is shared

We do not share any data with third parties, because there is no data to
share. There is no server component, no data brokers, and no third parties
paid or otherwise able to access your data.

## Third-party components (SDKs and plugins)

- The App embeds a third-party open-source SQLite plugin
  (`@capacitor-community/sqlite`) that stores your data in a database file on
  your device. The plugin transmits nothing and has no server component.
- The App's interface runs inside its own embedded web view (Capacitor
  runtime). No third-party analytics, advertising, or crash-reporting SDKs are
  included.

## Reminders and voice input

- Reminders ("Nudges") are scheduled and delivered entirely on your device by
  the Android operating system. Your habit details and reminder times are read
  from the local database on your device and are never transmitted anywhere.
- "Ask Habit Coach" interprets your commands (typing or speaking) locally on
  your device. If you use voice input, your speech is processed by the Android
  speech recognition service on your device; the recognized words are used only
  to fill in the command on your device. Nothing is sent to the developer, and
  no speech or audio is stored by the App.

## Permissions

- The App requests only the Android `INTERNET` permission, which the App's
  embedded web runtime uses to serve the App's own bundled interface on the
  device itself. The App makes no network connections to any remote server.
- The App requests `POST_NOTIFICATIONS` so it can show the optional reminder
  notifications you choose to schedule ("Nudges"). These are delivered locally.
- The App declares `RECORD_AUDIO` so you can speak commands to "Ask Habit
  Coach" if you choose to. Audio is used only for on-device speech recognition
  and is not stored or transmitted by the App.
- The App requests `SCHEDULE_EXACT_ALARM` so scheduled reminders can fire at
  the precise time you picked. You control this in Android settings.
- Android system backups are disabled, so your habit data is not copied to
  Google Drive or to any cloud backup.

## Security

- Your data is stored in an unencrypted SQLite database inside the App's
  private storage on your device, protected by the operating system's app
  sandbox.
- The App makes no network connections to any remote server, so there is
  nothing to intercept in transit.

## Retention

Your data is retained on your device until you delete it or uninstall the
App. There is no server-side storage, so there is no server-side retention.

## Data deletion

- You can permanently delete all data and your local account at any time from
  the App's login screen using the "Delete all data on this device" control
  (no sign-in required).
- Deleting the App, or clearing its data in Android settings, also permanently
  removes all of your habit history. There is nothing stored elsewhere to
  delete, so no separate deletion request to us is needed.

## Children

The App is not directed at children, and it collects nothing from any user
regardless of age.

## Changes

If this policy ever changes, we will update it at this URL and note the date
above.

## Contact

For any questions about this policy, contact the developer of Habit Coach at
[DEVELOPER_CONTACT_EMAIL_REQUIRED].