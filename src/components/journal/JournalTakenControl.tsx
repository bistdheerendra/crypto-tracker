"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

type JournalTakenControlProps = {
  verdictId: string | null | undefined;
};

/**
 * Compact personal utility: mark a persisted verdict as "taken" with an optional note.
 * Kept visually secondary — not a primary signal like the tier badge.
 */
export function JournalTakenControl({ verdictId }: JournalTakenControlProps) {
  const [taken, setTaken] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef(note);
  noteRef.current = note;

  useEffect(() => {
    if (!verdictId) {
      setTaken(false);
      setNote("");
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/journal/${encodeURIComponent(verdictId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load journal status");
          return;
        }
        if (data.entry) {
          setTaken(true);
          setNote(typeof data.entry.note === "string" ? data.entry.note : "");
        } else {
          setTaken(false);
          setNote("");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load journal status");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [verdictId]);

  const markTaken = useCallback(async () => {
    if (!verdictId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdictId, note: noteRef.current || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to mark as taken");
      setTaken(true);
      if (data.entry?.note != null) setNote(data.entry.note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark as taken");
    } finally {
      setSaving(false);
    }
  }, [verdictId]);

  const unmark = useCallback(async () => {
    if (!verdictId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/journal/${encodeURIComponent(verdictId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to unmark");
      setTaken(false);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unmark");
    } finally {
      setSaving(false);
    }
  }, [verdictId]);

  const saveNote = useCallback(async () => {
    if (!verdictId || !taken) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdictId, note: noteRef.current || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save note");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  }, [verdictId, taken]);

  if (!verdictId) return null;

  if (loading) {
    return (
      <div className="mt-3 pt-3 border-t border-white/8 flex items-center gap-2 text-[10px] text-text-muted">
        <Loader2 className="w-3 h-3 animate-spin" />
        Journal…
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-white/8 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {taken ? (
          <>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-bull/25 bg-bull/10 text-bull text-[10px] font-mono-data">
              <Check className="w-3 h-3" />
              Taken
            </span>
            <button
              type="button"
              onClick={() => void unmark()}
              disabled={saving}
              className="text-[10px] text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
            >
              Undo
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void markTaken()}
            disabled={saving}
            className="px-2 py-1 rounded border border-white/10 bg-white/3 text-[10px] text-text-muted hover:text-accent hover:border-accent/30 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Mark as taken"}
          </button>
        )}
        {saving && taken && <Loader2 className="w-3 h-3 animate-spin text-text-muted" />}
        {savedFlash && <span className="text-[10px] text-bull">Note saved</span>}
      </div>

      {taken && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => void saveNote()}
            placeholder="Optional note…"
            className="flex-1 min-w-0 bg-bg-card border border-white/8 rounded px-2 py-1 text-[11px] text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-accent/30"
          />
          <button
            type="button"
            onClick={() => void saveNote()}
            disabled={saving}
            className="shrink-0 text-[10px] text-accent hover:text-accent/80 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}

      {error && <p className="text-[10px] text-bear">{error}</p>}
    </div>
  );
}
