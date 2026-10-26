"use client";

import { AlertCircle, Copy, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { showToast } from "@/app/utils/commonFunctions";
import { useGeminiAI, type GeminiContext } from "@/app/utils/useGeminiAI";

export interface AiGeneratorButtonProps {
  name: string;
  onGenerate: (text: string) => void;
  context?: GeminiContext;
  extraContext?: string;
  disabled?: boolean;
}

function AiGeneratorButton({
  name,
  onGenerate,
  context = "general",
  extraContext,
  disabled = false,
}: AiGeneratorButtonProps) {
  const { generate, loading, error, lastResult } = useGeminiAI({
    context,
    maxOutputTokens: 800,
    temperature: 0.9,
  });
  const [hasGenerated, setHasGenerated] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  if (!name || !name.trim()) return null;

  const isBusy = loading || disabled || cooldown;

  const handleGenerate = async () => {
    const text = await generate(name, extraContext);
    if (text) {
      onGenerate(text);
      setHasGenerated(true);
      showToast("Viral description ready!", "success");
    }
    // Cooldown: prevent double-clicks immediately after a generation finishes
    setCooldown(true);
    setTimeout(() => setCooldown(false), 1500);
  };

  const handleCopy = async () => {
    if (!lastResult) return;
    try {
      await navigator.clipboard.writeText(lastResult);
      showToast("Copied to clipboard", "success");
    } catch {
      showToast("Failed to copy to clipboard", "error");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isBusy}
        className="inline-flex items-center gap-2 border-4 border-black bg-indigo-600 px-4 py-2 font-black uppercase tracking-widest text-xs text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Crafting...
          </>
        ) : (
          <>
            <Sparkles size={14} />
            {hasGenerated ? "Regenerate Viral Description" : "Generate Viral Description"}
          </>
        )}
      </button>

      {hasGenerated && !loading && lastResult && (
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 font-black uppercase tracking-widest text-xs text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 hover:bg-zinc-100"
        >
          <Copy size={14} />
          Copy
        </button>
      )}

      {hasGenerated && !loading && (
        <button
          type="button"
          onClick={handleGenerate}
          className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 font-black uppercase tracking-widest text-xs text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 hover:bg-zinc-100"
        >
          <RefreshCw size={14} />
          Regenerate
        </button>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2 border-4 border-red-600 bg-red-50 px-3 py-2 font-bold text-xs uppercase text-red-700">
          <AlertCircle size={14} />
          <span>Generation failed</span>
          <button
            type="button"
            onClick={handleGenerate}
            className="ml-1 underline hover:text-red-900"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export default AiGeneratorButton;
