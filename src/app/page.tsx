// app/page.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

// ---- Serbian-friendly normalization helpers ----

// Basic Cyrillic→Latin for Serbian, enough for brate/брате
function cyrToLat(s: string) {
  const map: Record<string, string> = {
    А: "A",
    Б: "B",
    В: "V",
    Г: "G",
    Д: "D",
    Ђ: "Đ",
    Е: "E",
    Ж: "Ž",
    З: "Z",
    И: "I",
    Ј: "J",
    К: "K",
    Л: "L",
    Љ: "Lj",
    М: "M",
    Н: "N",
    Њ: "Nj",
    О: "O",
    П: "P",
    Р: "R",
    С: "S",
    Т: "T",
    Ћ: "Ć",
    У: "U",
    Ф: "F",
    Х: "H",
    Ц: "C",
    Ч: "Č",
    Џ: "Dž",
    Ш: "Š",
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    ђ: "đ",
    е: "e",
    ж: "ž",
    з: "z",
    и: "i",
    ј: "j",
    к: "k",
    л: "l",
    љ: "lj",
    м: "m",
    н: "n",
    њ: "nj",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    ћ: "ć",
    у: "u",
    ф: "f",
    х: "h",
    ц: "c",
    ч: "č",
    џ: "dž",
    ш: "š",
  };
  return s.replace(/[\u0400-\u04FF]/g, (ch) => map[ch] ?? ch);
}

// Strip diacritics, unify spaces/punct, lower-case
function normalize(s: string) {
  return cyrToLat(s)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Count target in text; Serbian-friendly.
 * wholeWord=true → only whole words
 * allowStretch=true → allow trailing e's like "brateee"
 */
function countWord(
  text: string,
  targetRaw: string,
  opts: { wholeWord?: boolean; allowStretch?: boolean } = {}
) {
  const { wholeWord = true, allowStretch = true } = opts;
  const h = normalize(text);
  const t = normalize(targetRaw);
  if (!t) return 0;

  const stretch = allowStretch ? "(e+)?" : "";
  const core = `${escapeRegExp(t)}${stretch}`;
  const re = wholeWord
    ? new RegExp(`(^|\\s)${core}(?=\\s|$)`, "g")
    : new RegExp(core, "g");
  return (h.match(re) || []).length;
}

// ---- Web Speech setup ----

type RecType = SpeechRecognition;

function getSpeechRecognition(): RecType | null {
  if (typeof window === "undefined") return null;
  const W = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
    mozSpeechRecognition?: new () => SpeechRecognition;
    msSpeechRecognition?: new () => SpeechRecognition;
  };
  const Ctor =
    W.SpeechRecognition ||
    W.webkitSpeechRecognition ||
    W.mozSpeechRecognition ||
    W.msSpeechRecognition;
  if (!Ctor) return null;
  const rec: RecType = new Ctor();

  // Mobile-specific settings
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  // const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (isMobile) {
    // Mobile browsers often work better with these settings
    rec.continuous = false; // Mobile browsers often don't support continuous mode well
    rec.interimResults = false; // Disable interim results on mobile for better performance
    rec.lang = "sr-RS"; // Keep Serbian for all mobile devices
  } else {
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "sr-RS";
  }
  return rec;
}

export default function Page() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  const [lang, setLang] = useState("sr-RS");
  const [target, setTarget] = useState("brate");
  const [strictWord, setStrictWord] = useState(true);
  const [allowStretch, setAllowStretch] = useState(true);

  const [count, setCount] = useState(0);
  const [liveInterim, setLiveInterim] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");

  const recognitionRef = useRef<RecType | null>(null);

  useEffect(() => {
    const rec = getSpeechRecognition();
    setSupported(!!rec);
    recognitionRef.current = rec;

    // Detect mobile device
    const mobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsMobile(mobile);
    setIsIOS(ios);

    return () => {
      try {
        rec?.stop();
        rec?.abort?.();
      } catch {}
    };
  }, []);

  useEffect(() => {
    if (recognitionRef.current) recognitionRef.current.lang = lang;
  }, [lang]);

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) {
      console.error("Speech recognition not available");
      alert("Speech recognition not supported on this device");
      return;
    }

    console.log("Starting speech recognition with language:", lang);
    console.log("User agent:", navigator.userAgent);
    console.log("Is mobile:", isMobile);
    setLiveInterim("");

    rec.onresult = (event: SpeechRecognitionEvent) => {
      console.log("Speech recognition result:", event);
      let interim = "";
      let finalized = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const text = res[0]?.transcript ?? "";
        console.log(`Result ${i}: "${text}" (final: ${res.isFinal})`);
        if (res.isFinal) finalized += text + " ";
        else interim += text + " ";
      }

      setLiveInterim(interim.trim());

      if (finalized) {
        console.log("Finalized text:", finalized);
        setFinalTranscript((prev) => (prev + " " + finalized).trim());
        const delta = countWord(finalized, target, {
          wholeWord: strictWord,
          allowStretch,
        });
        console.log(`Counted ${delta} instances of "${target}"`);
        if (delta > 0) setCount((c) => c + delta);
      }
    };

    rec.onerror = (event) => {
      console.error("Speech recognition error:", event);
      console.error("Error type:", event.error);
      console.error("Error message:", event.message);

      let errorMessage = "Speech recognition error: ";
      switch (event.error) {
        case "not-allowed":
          errorMessage +=
            "Microphone permission denied. Please allow microphone access in your browser settings.";
          break;
        case "no-speech":
          errorMessage += "No speech detected. Please try speaking louder.";
          break;
        case "audio-capture":
          errorMessage +=
            "Microphone not available. Please check your microphone.";
          break;
        case "network":
          errorMessage +=
            "Network error. Please check your internet connection.";
          break;
        default:
          errorMessage += event.error || "Unknown error";
      }

      alert(errorMessage);
      setListening(false);
    };
    rec.onend = () => {
      console.log("Speech recognition ended");
      setListening(false);

      // On mobile, restart recognition automatically for continuous listening
      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );
      if (isMobile && rec.continuous === false) {
        // Restart after a short delay for mobile
        setTimeout(() => {
          try {
            rec.start();
            setListening(true);
            console.log("Restarted speech recognition for mobile");
          } catch (error) {
            console.error("Failed to restart speech recognition:", error);
          }
        }, 100);
      }
    };

    try {
      rec.start();
      setListening(true);
      console.log("Speech recognition started");
    } catch (error) {
      console.error("Failed to start speech recognition:", error);
    }
  }, [target, strictWord, allowStretch, isMobile, lang]);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {}
    setListening(false);
  }, []);

  const resetAll = useCallback(() => {
    setCount(0);
    setFinalTranscript("");
    setLiveInterim("");
  }, []);

  // Recompute if settings change
  useEffect(() => {
    setCount(
      countWord(finalTranscript, target, {
        wholeWord: strictWord,
        allowStretch,
      })
    );
  }, [target, strictWord, allowStretch, finalTranscript]);

  return (
    <div style={{ maxWidth: 880, margin: "40px auto", padding: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <Image
          src="/bratee_logo.svg"
          alt="БРАТЕ Logo"
          width={200} // tweak as needed
          height={80} // tweak as needed
          priority
        />
      </div>
      <p style={{ marginTop: 4, color: "#666" }}>
        Counts how many times someone says <strong>“brate”</strong> using the
        microphone.
      </p>

      {!supported && (
        <div
          style={{
            padding: 12,
            border: "1px solid #ccc",
            borderRadius: 8,
            background: "#fff8e1",
            margin: "16px 0",
          }}
        >
          Your browser doesn&apos;t support the Web Speech API. Use Chrome/Edge,
          or add a server fallback later.
        </div>
      )}

      {supported && isMobile && (
        <div
          style={{
            padding: 12,
            border: "1px solid #4CAF50",
            borderRadius: 8,
            background: "#e8f5e8",
            margin: "16px 0",
          }}
        >
          📱 <strong>Mobile Mode:</strong> Speech recognition will restart
          automatically after each phrase. Make sure to speak clearly and allow
          microphone permissions.
        </div>
      )}

      {supported && isIOS && (
        <div
          style={{
            padding: 12,
            border: "1px solid #007AFF",
            borderRadius: 8,
            background: "#e6f3ff",
            margin: "16px 0",
          }}
        >
          🍎 <strong>iOS Mode:</strong> Using Serbian language. Say
          &quot;brate&quot; clearly and make sure to allow microphone access
          when prompted. iOS may have limited Serbian support, so speak clearly
          and pause between words.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "1fr 1fr",
          alignItems: "end",
          marginTop: 16,
        }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <span>Target word</span>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="brate"
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              fontSize: 16,
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Language</span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              fontSize: 16,
            }}
          >
            <option value="sr-RS">Srpski (RS)</option>
            <option value="hr-HR">Hrvatski (HR)</option>
            <option value="bs-BA">Bosanski (BA)</option>
            <option value="en-US">English (US)</option>
            <option value="de-DE">Deutsch (DE)</option>
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={strictWord}
            onChange={() => setStrictWord((v) => !v)}
          />
          Whole word only
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={allowStretch}
            onChange={() => setAllowStretch((v) => !v)}
          />
          Allow stretched “brateee”
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          onClick={start}
          disabled={!supported || listening}
          style={{
            padding: "10px 14px",
            borderRadius: 999,
            border: "1px solid #0a7",
            background: listening ? "#bdebdc" : "#d9fbf1",
          }}
        >
          ▶️ Start
        </button>
        <button
          onClick={stop}
          disabled={!listening}
          style={{
            padding: "10px 14px",
            borderRadius: 999,
            border: "1px solid #a00",
            background: "#fde7e7",
          }}
        >
          ⏹ Stop
        </button>
        <button
          onClick={resetAll}
          style={{
            padding: "10px 14px",
            borderRadius: 999,
            border: "1px solid #888",
            background: "#f2f2f2",
          }}
        >
          ♻️ Reset
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "1fr 1fr",
          marginTop: 16,
        }}
      >
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          <div style={{ fontSize: 14, color: "#666", marginBottom: 6 }}>
            Count
          </div>
          <div
            style={{
              fontSize: 48,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {count}
          </div>
          <div style={{ fontSize: 14, color: "#444", marginTop: 8 }}>
            Counting “<strong>{target || "—"}</strong>”
          </div>
        </div>

        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          <div style={{ fontSize: 14, color: "#666", marginBottom: 6 }}>
            Status
          </div>
          <div>
            Mic: <strong>{listening ? "Listening…" : "Idle"}</strong> • Lang:{" "}
            <strong>{lang}</strong>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <div
          style={{
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 8,
            minHeight: 80,
            background: "#fafafa",
          }}
        >
          <div style={{ fontSize: 14, color: "#666", marginBottom: 6 }}>
            Live (interim)
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{liveInterim || "—"}</div>
        </div>
        <div
          style={{
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 8,
            minHeight: 120,
          }}
        >
          <div style={{ fontSize: 14, color: "#666", marginBottom: 6 }}>
            Final transcript
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{finalTranscript || "—"}</div>
        </div>
      </div>

      <p style={{ marginTop: 16, color: "#666", fontSize: 14 }}>
        Note: counting happens on <em>finalized</em> speech to avoid
        double-counting interim guesses. Use HTTPS in production (Vercel does
        this) for mic permissions.
      </p>
    </div>
  );
}
