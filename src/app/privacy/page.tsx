import Link from "next/link";
import type { Metadata } from "next";

import { DeleteAllData } from "@/components/delete-all-data";

export const metadata: Metadata = {
  title: "Privacy Policy – HabItiva",
  description:
    "HabItiva privacy policy. Everything you enter stays on your device.",
};

const sections: Array<{ heading: string; body: string[] }> = [
  {
    heading: "The short version",
    body: [
      "HabItiva is a local-first habit and behavior tracking app. Everything you enter — goals, habits, completions, check-ins, and notes — is stored only in a SQLite database on your device. Nothing is uploaded to a server, and the app has no account system, no analytics, no advertising SDKs, and no tracking.",
    ],
  },
  {
    heading: "What we collect",
    body: [
      "Nothing. HabItiva does not collect, transmit, or store any personal data on any server.",
      "Goals, habits, completions, and check-ins you record are stored locally in a database on your device and never leave it.",
      "If you enter your name, email, or password on the login or sign-up screens, those values are used only in memory for the local sign-in flow. Your password is never sent anywhere and is not stored. Your email is not stored or used.",
      "We do not use third-party analytics, crash-reporting services, advertising identifiers, or cookies.",
    ],
  },
  {
    heading: "How your data is used",
    body: [
      "Data you enter is used only to power HabItiva's own features on your device: showing your schedule, computing your insights, and generating coach observations. All of this happens locally.",
    ],
  },
  {
    heading: "Permissions",
    body: [
      "The app requests only the Android INTERNET permission, which the app's embedded web runtime uses to serve the app's own bundled interface on the device itself. The app makes no network connections to any remote server.",
      "Android system backups are disabled, so your habit data is not copied to Google Drive or any cloud backup.",
    ],
  },
  {
    heading: "Third-party components",
    body: [
      "The app embeds a third-party open-source SQLite plugin (@capacitor-community/sqlite) that stores your data in a database file on your device. The plugin transmits nothing and has no server component.",
      "The app's interface runs inside its own embedded web view. No third-party analytics, advertising, or crash-reporting SDKs are included.",
    ],
  },
  {
    heading: "Security",
    body: [
      "Your data is stored in an unencrypted SQLite database inside the app's private storage on your device, protected by the operating system's app sandbox.",
      "The app makes no network connections to any remote server, so there is nothing to intercept in transit.",
    ],
  },
  {
    heading: "Retention",
    body: [
      "Your data is retained on your device until you delete it or uninstall the app. There is no server-side storage, so there is no server-side retention.",
    ],
  },
  {
    heading: "Deletion",
    body: [
      "You can permanently delete all data and your local account at any time from the app's login screen using the \"Delete all data on this device\" control.",
      "Deleting the app, or clearing its data in Android settings, also permanently removes all of your habit history. There is nothing stored elsewhere to delete.",
    ],
  },
  {
    heading: "Children",
    body: [
      "The app is not directed at children and does not collect anything from any user regardless of age.",
    ],
  },
  {
    heading: "Changes",
    body: [
      "If this policy ever changes, we will update it here and note the date above.",
    ],
  },
  {
    heading: "Contact",
    body: [
      "For any questions about this policy, contact the developer of HabItiva at [DEVELOPER_CONTACT_EMAIL_REQUIRED].",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="relative mx-auto min-h-full max-w-2xl px-6 py-16">
      <div className="animate-rise relative z-10">
        <p className="eyebrow">HabItiva</p>
        <h1 className="mt-4 font-serif text-3xl leading-tight tracking-tight text-ink">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-muted">Last updated: September 6, 2026</p>

        <div className="card mt-8 space-y-8 p-6 sm:p-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold text-ink">
                {section.heading}
              </h2>
              {section.body.map((paragraph) => (
                <p
                  key={paragraph}
                  className="mt-2 text-sm leading-6 text-muted"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}

          <section className="border-t border-line pt-7">
            <h2 className="text-lg font-semibold text-ink">
              Delete your data
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Permanently delete every habit, check-in, and note on this
              device. This cannot be undone.
            </p>
            <DeleteAllData />
          </section>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          <Link
            href="/login"
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}