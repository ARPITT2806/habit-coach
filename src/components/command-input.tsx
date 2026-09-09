"use client";

import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { useCallback, useEffect, useRef, useState } from "react";

import { isNativeApp } from "@/lib/local/database";
import { runVoiceCommand, type CommandReply } from "@/lib/voice/commands";
import { LocalVoiceIntentProvider } from "@/lib/voice/intents";

const parser = new LocalVoiceIntentProvider();

const SUGGESTIONS = [
  "What is my workout today?",
  "Remind me to run at 7pm",
];

export function CommandInput({ onChanged }: { onChanged?: () => void }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<CommandReply | null>(null);
  const listeningRef = useRef(false);
  const pressedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (listeningRef.current) {
        SpeechRecognition.stop().catch(() => undefined);
      }
    };
  }, []);

  const submit = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;

      setBusy(true);
      setReply(null);

      const intent = parser.parse(trimmed);

      try {
        const result = await runVoiceCommand(intent);
        setReply(result);
        if (result.changed) onChanged?.();
      } catch {
        setReply({
          text: "Something went wrong while running that command. Try again.",
          ok: false,
        });
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  const beginListening = useCallback(async () => {
    if (listeningRef.current) return;

    if (!isNativeApp()) {
      setReply({
        text: "Voice isn't available in the web preview. Type your command below instead.",
        ok: false,
      });
      return;
    }

    try {
      const availability = await SpeechRecognition.available();
      if (!availability.available) {
        setReply({
          text: "Speech recognition isn't available on this device. Type your command below instead.",
          ok: false,
        });
        return;
      }
    } catch {
      setReply({
        text: "Speech recognition couldn't start. Type your command below instead.",
        ok: false,
      });
      return;
    }

    const status = await SpeechRecognition.checkPermissions();
    if (status.speechRecognition !== "granted") {
      const requested = await SpeechRecognition.requestPermissions();
      if (requested.speechRecognition !== "granted") {
        setReply({
          text: "Microphone access is needed for voice commands. You can still type them.",
          ok: false,
        });
        return;
      }
    }

    setListening(true);
    listeningRef.current = true;

    if (!pressedRef.current) {
      listeningRef.current = false;
      setListening(false);
      return;
    }

    try {
      const result = await SpeechRecognition.start({
        popup: false,
        partialResults: false,
        maxResults: 1,
      });
      listeningRef.current = false;
      setListening(false);

      const transcript = result.matches?.[0]?.trim();
      if (transcript) {
        setText(transcript);
        await submit(transcript);
      } else {
        setReply({
          text: "I didn't catch anything. Try again, or type your command below.",
          ok: false,
        });
      }
    } catch {
      listeningRef.current = false;
      setListening(false);
      setReply({
        text: "Speech recognition stopped early. You can type your command below.",
        ok: false,
      });
    }
  }, [submit]);

  const stopListening = useCallback(() => {
    if (!listeningRef.current) return;
    SpeechRecognition.stop().catch(() => undefined);
  }, []);

  return (
    <section
      className="animate-rise mt-6 rounded-4xl border border-line bg-surface p-5 shadow-soft"
      aria-labelledby="command-heading"
    >
      <div className="flex items-center justify-between gap-3">
        <p id="command-heading" className="text-sm font-semibold text-ink">
          Ask HabItiva
        </p>
        {listening ? (
          <span className="chip bg-rose-soft text-rose">Listening… release to finish</span>
        ) : null}
      </div>

      <form
        className="mt-4 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit(text);
        }}
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit(text);
            }
          }}
          className="field"
          placeholder="“Mark gym complete”"
          aria-label="Type a command"
          autoCapitalize="off"
          autoCorrect="off"
        />

        <button
          type="button"
          disabled={busy}
          className="btn-primary shrink-0"
          aria-label="Ask"
          onClick={() => submit(text)}
        >
          Ask
        </button>

        <button
          type="button"
          disabled={busy}
          className={`icon-btn shrink-0 transition-colors ${
            listening ? "bg-rose text-white" : ""
          }`}
          aria-label={listening ? "Finish speaking" : "Hold to speak"}
          aria-pressed={listening}
          onPointerDown={() => {
            pressedRef.current = true;
            beginListening();
          }}
          onPointerUp={() => {
            pressedRef.current = false;
            stopListening();
          }}
          onPointerLeave={() => {
            if (pressedRef.current) stopListening();
            pressedRef.current = false;
          }}
          onPointerCancel={() => {
            pressedRef.current = false;
            stopListening();
          }}
        >
          <MicIcon />
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="chip border border-line bg-surface-2 text-muted hover:text-ink"
            onClick={() => {
              setText(suggestion);
              submit(suggestion);
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>

      {reply ? (
        <p
          role="status"
          className={`mt-4 whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${
            reply.ok ? "bg-mint-soft text-ink" : "bg-amber-soft text-ink"
          }`}
        >
          {reply.text}
        </p>
      ) : null}
    </section>
  );
}

function MicIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}