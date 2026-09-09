"use client";

import { useState } from "react";

import { testOpenAIConnectivity, type AiConnectivityResult } from "@/lib/actions/ai-test";

/**
 * DEV-ONLY trigger for the OpenAI connectivity test. Rendered exclusively by
 * the /dev/ai-test page, which refuses to render outside development.
 */
export function AiTestButton() {
  const [result, setResult] = useState<AiConnectivityResult | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      setResult(await testOpenAIConnectivity());
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card mt-6 p-6">
      <button type="button" disabled={running} onClick={() => void run()} className="btn-primary w-full">
        {running ? "Testing..." : "Run OpenAI connectivity test"}
      </button>

      {result ? (
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-surface-2 p-4 text-xs leading-5 text-ink">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
