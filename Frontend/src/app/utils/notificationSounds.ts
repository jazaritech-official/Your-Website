/**
 * Notification sounds using Web Audio API.
 * Generates short, subtle tones without requiring external audio files.
 * Respects browser autoplay policy — only plays after user interaction.
 */

let audioContext: AudioContext | null = null;
let hasInteracted = false;

/** Track user interaction to respect autoplay policy. */
if (typeof window !== "undefined") {
  const markInteracted = () => {
    hasInteracted = true;
    window.removeEventListener("click", markInteracted);
    window.removeEventListener("keydown", markInteracted);
    window.removeEventListener("touchstart", markInteracted);
  };
  window.addEventListener("click", markInteracted, { once: true });
  window.addEventListener("keydown", markInteracted, { once: true });
  window.addEventListener("touchstart", markInteracted, { once: true });
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    try {
      audioContext = new AudioContext();
    } catch {
      return null;
    }
  }
  return audioContext;
}

/**
 * Play a short "ding" notification sound (new message received).
 * Two quick ascending tones — subtle, WhatsApp-style.
 */
export function playMessageSound(): void {
  if (!hasInteracted) return;
  // Respect prefers-reduced-motion: skip sounds for users who prefer less motion
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = getContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // First tone (short, soft)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now); // A5
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Second tone (slightly higher, quick)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1100, now + 0.1); // ~B5
    gain2.gain.setValueAtTime(0, now + 0.1);
    gain2.gain.linearRampToValueAtTime(0.12, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.25);
  } catch {
    // Silent — sound is non-critical
  }
}

/**
 * Play a short "chime" confirmation sound (order placed successfully).
 * Three ascending tones — pleasant, satisfying.
 */
export function playOrderSound(): void {
  if (!hasInteracted) return;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = getContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes = [523, 659, 784]; // C5, E5, G5 — major chord arpeggio

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      const t = now + i * 0.12;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.15, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch {
    // Silent — sound is non-critical
  }
}
