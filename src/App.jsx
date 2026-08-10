import React, { useState, useEffect, useRef, useCallback } from "react";
import { Clipboard, Trash2, Check, Plus, AlertTriangle, RotateCcw, X, FilePlus2 } from "lucide-react";

// Same shape as the artifact's window.storage API, backed by localStorage.
// This keeps data on this device/browser only. Swap this out for a real
// backend + database later if you want notes to sync across devices.
const storage = {
  async get(key) {
    const value = localStorage.getItem(key);
    return value !== null ? { key, value } : null;
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return { key, deleted: true };
  },
};

// Your API proxy URL (Cloudflare Worker). Set this in a .env file as
// VITE_API_PROXY_URL=https://your-worker.your-subdomain.workers.dev
const API_PROXY_URL = import.meta.env.VITE_API_PROXY_URL || "http://localhost:8787";

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=Archivo+Black&display=swap');
`;

const COLORS = {
  bg: "#1E2228",
  panel: "#242830",
  panelAlt: "#2A2F38",
  grid: "#333941",
  border: "#3A4048",
  amber: "#ECEDEF",
  amberDim: "#4A505A",
  green: "#9FB8A6",
  text: "#ECEDEF",
  textMuted: "#868D96",
  danger: "#D97B6C",
};

const inputBase = {
  background: "transparent",
  border: "none",
  outline: "none",
  color: COLORS.text,
  fontFamily: "'IBM Plex Sans', sans-serif",
  width: "100%",
  resize: "none",
};

function blankNote() {
  return {
    id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
    title: "Untitled page",
    summary: "",
    notes: "",
    tags: [],
    steps: [],
    images: [],
    createdAt: new Date().toISOString(),
  };
}

function newImageId() {
  return String(Date.now()) + Math.random().toString(36).slice(2, 6);
}

function resizeToJpeg(dataUrl, maxDim = 1400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function stripFences(text) {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

function autoGrow(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

export default function SnipNotes() {
  const [notes, setNotes] = useState([]);
  const [current, setCurrent] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("STANDBY"); // STANDBY | ANALYZING | ERROR | PAGE
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef(null);
  const addImageInputRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [currentImages, setCurrentImages] = useState([]); // [{ id, label, thumb }]
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImageId, setLightboxImageId] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [lightboxLoading, setLightboxLoading] = useState(false);
  const fullImageCache = useRef({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await storage.get("snipnotes:all");
        if (mounted && result?.value) setNotes(JSON.parse(result.value));
      } catch (e) {
        // no notes yet
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const persistNotes = useCallback(async (next) => {
    setNotes(next);
    try {
      await storage.set("snipnotes:all", JSON.stringify(next));
    } catch (e) {
      // best-effort
    }
  }, []);

  // update current note both in state and in the notes list, then persist
  const updateCurrent = useCallback((patch, list) => {
    setCurrent((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch };
      const source = list || notes;
      const next = source.some((n) => n.id === updated.id)
        ? source.map((n) => (n.id === updated.id ? updated : n))
        : [updated, ...source];
      persistNotes(next);
      return updated;
    });
  }, [notes, persistNotes]);

  // Flip this to true once the API proxy is live and you're ready to wire
  // AI analysis back in. While false, pasting a snip just builds an empty
  // page in the same template — no network call, no API key needed.
  const AI_ANALYZE_ENABLED = false;

  const saveImageAssets = useCallback(async (imageId, thumbDataUrl, fullDataUrl) => {
    if (!thumbDataUrl) return;
    try {
      await storage.set(`snipnotes:img:${imageId}`, thumbDataUrl);
      await storage.set(`snipnotes:imgfull:${imageId}`, fullDataUrl);
      fullImageCache.current[imageId] = fullDataUrl;
    } catch (e) {
      // best-effort — page still works without the image persisted
    }
  }, []);

  const createEmptyPageFromImage = useCallback(async (jpegDataUrl, thumbDataUrl) => {
    const imageId = newImageId();
    const note = {
      id: String(Date.now()),
      title: "Untitled snip",
      summary: "",
      notes: "",
      tags: [],
      steps: [],
      images: thumbDataUrl ? [{ id: imageId, label: "Snip 1" }] : [],
      createdAt: new Date().toISOString(),
    };
    const next = [note, ...notes];
    setCurrent(note);
    setCurrentImages(thumbDataUrl ? [{ id: imageId, label: "Snip 1", thumb: thumbDataUrl }] : []);
    setStatus("PAGE");
    await persistNotes(next);
    await saveImageAssets(imageId, thumbDataUrl, jpegDataUrl);
  }, [notes, persistNotes, saveImageAssets]);

  const addImageToCurrentPage = useCallback(async (jpegDataUrl, thumbDataUrl) => {
    if (!current) return;
    const imageId = newImageId();
    const existing = current.images || [];
    const label = `Snip ${existing.length + 1}`;
    const images = [...existing, { id: imageId, label }];
    updateCurrent({ images });
    setCurrentImages((prev) => [...prev, { id: imageId, label, thumb: thumbDataUrl }]);
    await saveImageAssets(imageId, thumbDataUrl, jpegDataUrl);
  }, [current, updateCurrent, saveImageAssets]);

  const analyze = useCallback(async (jpegDataUrl, thumbDataUrl) => {
    setStatus("ANALYZING");
    setErrorMsg("");
    try {
      const base64 = jpegDataUrl.split(",")[1];
      const response = await fetch(API_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system:
            "You convert a pasted screenshot into a structured working note. Respond with ONLY raw JSON, no markdown fences, no preamble. Schema: {\"title\": string, \"summary\": string (1-2 sentences), \"tags\": string[] (2-5 short lowercase tags), \"steps\": [{\"title\": string, \"detail\": string}]}. Infer concrete, actionable steps from whatever is in the image (an error, a UI, a diagram, text, code, a process) — if there's genuinely no procedural content, still produce 2-4 steps for how to follow up on or use the captured content.",
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
                { type: "text", text: "Generate the structured note for this snip." },
              ],
            },
          ],
        }),
      });
      if (!response.ok) throw new Error("Request failed");
      const data = await response.json();
      const textBlock = data.content.find((b) => b.type === "text");
      if (!textBlock) throw new Error("No response text");
      const parsed = JSON.parse(stripFences(textBlock.text));
      const imageId = newImageId();
      const note = {
        id: String(Date.now()),
        title: parsed.title || "Untitled snip",
        summary: parsed.summary || "",
        notes: "",
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        steps: Array.isArray(parsed.steps)
          ? parsed.steps.map((s) => ({ title: s.title || "", detail: s.detail || "", done: false }))
          : [],
        images: thumbDataUrl ? [{ id: imageId, label: "Snip 1" }] : [],
        createdAt: new Date().toISOString(),
      };
      const next = [note, ...notes];
      setCurrent(note);
      setCurrentImages(thumbDataUrl ? [{ id: imageId, label: "Snip 1", thumb: thumbDataUrl }] : []);
      setStatus("PAGE");
      await persistNotes(next);
      await saveImageAssets(imageId, thumbDataUrl, jpegDataUrl);
    } catch (e) {
      setStatus("ERROR");
      setErrorMsg("Analysis failed — the snip may be unclear, or the connection dropped. Try again.");
    }
  }, [notes, persistNotes, saveImageAssets]);

  const handleImageFile = useCallback(async (file) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = reader.result;
      try {
        const [jpeg, thumb] = await Promise.all([
          resizeToJpeg(rawDataUrl, 1400, 0.85),
          resizeToJpeg(rawDataUrl, 260, 0.75),
        ]);
        if (current) {
          // a page is already open — treat this as another snip on that
          // page (before/after, multiple angles, whatever's needed)
          addImageToCurrentPage(jpeg, thumb);
        } else if (AI_ANALYZE_ENABLED) {
          setPreview(rawDataUrl);
          analyze(jpeg, thumb);
        } else {
          createEmptyPageFromImage(jpeg, thumb);
        }
      } catch (e) {
        setStatus("ERROR");
        setErrorMsg("Couldn't read that image. Try a different snip.");
      }
    };
    reader.readAsDataURL(file);
  }, [current, analyze, createEmptyPageFromImage, addImageToCurrentPage]);

  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) handleImageFile(file);
          e.preventDefault();
          break;
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [handleImageFile]);

  const toggleStep = (idx) => {
    if (!current) return;
    const updatedSteps = current.steps.map((s, i) => (i === idx ? { ...s, done: !s.done } : s));
    updateCurrent({ steps: updatedSteps });
  };

  const editStep = (idx, field, value) => {
    if (!current) return;
    const updatedSteps = current.steps.map((s, i) => (i === idx ? { ...s, [field]: value } : s));
    setCurrent({ ...current, steps: updatedSteps }); // live edit, persisted on blur via commitCurrent
  };

  const commitCurrent = () => {
    if (!current) return;
    updateCurrent(current);
  };

  const addStep = () => {
    if (!current) return;
    const updated = { ...current, steps: [...current.steps, { title: "", detail: "", done: false }] };
    updateCurrent(updated);
  };

  const removeStep = (idx) => {
    if (!current) return;
    const updatedSteps = current.steps.filter((_, i) => i !== idx);
    updateCurrent({ steps: updatedSteps });
  };

  const addTag = (tag) => {
    if (!current || !tag.trim()) return;
    if (current.tags.includes(tag.trim())) return;
    updateCurrent({ tags: [...current.tags, tag.trim()] });
  };

  const removeTag = (tag) => {
    if (!current) return;
    updateCurrent({ tags: current.tags.filter((t) => t !== tag) });
  };

  const openLightbox = async (imageId) => {
    setLightboxOpen(true);
    setLightboxImageId(imageId);
    setLightboxSrc(fullImageCache.current[imageId] || null);
    if (!fullImageCache.current[imageId]) {
      setLightboxLoading(true);
      try {
        const result = await storage.get(`snipnotes:imgfull:${imageId}`);
        if (result?.value) {
          fullImageCache.current[imageId] = result.value;
          setLightboxSrc(result.value);
        }
      } catch (e) {
        // fall back to whatever thumb we already showed
      } finally {
        setLightboxLoading(false);
      }
    }
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    setLightboxImageId(null);
    setLightboxSrc(null);
  };

  const editImageLabel = (imageId, value) => {
    if (!current) return;
    const images = (current.images || []).map((img) => (img.id === imageId ? { ...img, label: value } : img));
    setCurrent({ ...current, images });
    setCurrentImages((prev) => prev.map((img) => (img.id === imageId ? { ...img, label: value } : img)));
  };

  const removeImage = async (imageId, e) => {
    e?.stopPropagation();
    if (!current) return;
    const images = (current.images || []).filter((img) => img.id !== imageId);
    updateCurrent({ images });
    setCurrentImages((prev) => prev.filter((img) => img.id !== imageId));
    try {
      await storage.delete(`snipnotes:img:${imageId}`);
      await storage.delete(`snipnotes:imgfull:${imageId}`);
    } catch (e) {
      // best-effort
    }
    delete fullImageCache.current[imageId];
    if (lightboxOpen && lightboxImageId === imageId) closeLightbox();
  };

  const deleteNote = async (id, e) => {
    e?.stopPropagation();
    const note = notes.find((n) => n.id === id);
    const next = notes.filter((n) => n.id !== id);
    await persistNotes(next);
    const images = note?.images || (note?.hasImage ? [{ id: note.id }] : []);
    for (const img of images) {
      try {
        await storage.delete(`snipnotes:img:${img.id}`);
      } catch (e) {
        // best-effort
      }
      try {
        await storage.delete(`snipnotes:imgfull:${img.id}`);
      } catch (e) {
        // best-effort
      }
      delete fullImageCache.current[img.id];
    }
    if (current?.id === id) {
      setCurrent(null);
      setPreview(null);
      setCurrentImages([]);
      setStatus("STANDBY");
    }
  };

  const reset = () => {
    setCurrent(null);
    setPreview(null);
    setCurrentImages([]);
    setStatus("STANDBY");
    setErrorMsg("");
  };

  const openNote = async (note) => {
    setCurrent(note);
    setPreview(null);
    setStatus("PAGE");
    setErrorMsg("");
    const images = note.images || (note.hasImage ? [{ id: note.id, label: "Snip" }] : []);
    if (images.length > 0) {
      try {
        const loaded = await Promise.all(
          images.map(async (img) => {
            const result = await storage.get(`snipnotes:img:${img.id}`);
            return { id: img.id, label: img.label || "Snip", thumb: result?.value || null };
          })
        );
        setCurrentImages(loaded);
      } catch (e) {
        setCurrentImages([]);
      }
    } else {
      setCurrentImages([]);
    }
  };

  const newBlankPage = async () => {
    const note = blankNote();
    const next = [note, ...notes];
    setCurrent(note);
    setStatus("PAGE");
    setPreview(null);
    setCurrentImages([]);
    setErrorMsg("");
    await persistNotes(next);
  };

  const statusColor =
    status === "ANALYZING" ? COLORS.amber : status === "ERROR" ? COLORS.danger : status === "PAGE" ? COLORS.green : COLORS.textMuted;

  const [tagDraft, setTagDraft] = useState("");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        backgroundImage: `linear-gradient(${COLORS.grid} 1px, transparent 1px), linear-gradient(90deg, ${COLORS.grid} 1px, transparent 1px)`,
        backgroundSize: "28px 28px",
        color: COLORS.text,
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
      className="p-4 md:p-8"
    >
      <style>{FONTS}</style>

      {/* Header */}
      <div className="max-w-5xl mx-auto mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div
            style={{ fontFamily: "'Archivo Black', sans-serif", letterSpacing: "0.02em", color: COLORS.text }}
            className="text-2xl md:text-3xl"
          >
            SNIP<span style={{ color: COLORS.amber }}>/</span>LOG
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: COLORS.textMuted, fontSize: "12px" }}>
            a binder of pages — snip one in, or write one yourself
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={newBlankPage}
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "12px",
              color: COLORS.amber,
              border: `1px solid ${COLORS.amberDim}`,
              background: COLORS.panel,
            }}
            className="px-3 py-1.5 rounded flex items-center gap-2 hover:bg-white/5"
          >
            <FilePlus2 size={13} /> NEW PAGE
          </button>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "12px",
              color: statusColor,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.panel,
            }}
            className="px-3 py-1.5 rounded flex items-center gap-2"
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: statusColor,
                display: "inline-block",
                boxShadow: status === "ANALYZING" ? `0 0 8px ${statusColor}` : "none",
              }}
            />
            {status}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto grid md:grid-cols-[1fr_320px] gap-5">
        {/* Main panel */}
        <div>
          {!current && status !== "ANALYZING" && status !== "ERROR" && (
            <div
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${COLORS.border}`,
                background: COLORS.panel,
                position: "relative",
                minHeight: "340px",
              }}
              className="rounded-lg flex flex-col items-center justify-center gap-4 cursor-pointer outline-none focus:border-amber-500 transition-colors"
            >
              {["top-2 left-2 border-t-2 border-l-2", "top-2 right-2 border-t-2 border-r-2", "bottom-2 left-2 border-b-2 border-l-2", "bottom-2 right-2 border-b-2 border-r-2"].map(
                (pos, i) => (
                  <span key={i} className={`absolute w-5 h-5 ${pos}`} style={{ borderColor: COLORS.amberDim }} />
                )
              )}
              <Clipboard size={34} color={COLORS.amberDim} strokeWidth={1.5} />
              <div className="text-center px-6">
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "13px", color: COLORS.text }}>
                  ⌘V / CTRL+V TO PASTE A SNIP
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: COLORS.textMuted }} className="mt-1">
                  click to upload an image — or start a blank page from the button above
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])}
              />
            </div>
          )}

          {status === "ANALYZING" && (
            <div
              style={{ border: `1px solid ${COLORS.border}`, background: COLORS.panel, minHeight: "340px" }}
              className="rounded-lg flex flex-col items-center justify-center gap-4 relative overflow-hidden"
            >
              {preview && <img src={preview} alt="snip preview" style={{ maxHeight: 160, opacity: 0.35, borderRadius: 4 }} />}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: "2px",
                  background: COLORS.amber,
                  boxShadow: `0 0 12px ${COLORS.amber}`,
                  animation: "scan 1.6s linear infinite",
                }}
              />
              <style>{`@keyframes scan { 0% { transform: translateY(0); } 100% { transform: translateY(338px); } }`}</style>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "13px", color: COLORS.amber }}>ANALYZING SNIP…</div>
            </div>
          )}

          {status === "ERROR" && (
            <div
              style={{ border: `1px solid ${COLORS.danger}`, background: COLORS.panel, minHeight: "200px" }}
              className="rounded-lg flex flex-col items-center justify-center gap-3 px-6 text-center"
            >
              <AlertTriangle size={28} color={COLORS.danger} />
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "13px", color: COLORS.text }}>{errorMsg}</div>
              <button
                onClick={reset}
                style={{ fontFamily: "'IBM Plex Mono', monospace", color: COLORS.amber, border: `1px solid ${COLORS.amberDim}` }}
                className="px-3 py-1.5 rounded text-xs flex items-center gap-1.5 hover:bg-white/5"
              >
                <RotateCcw size={13} /> RESET
              </button>
            </div>
          )}

          {current && status === "PAGE" && (
            <div style={{ border: `1px solid ${COLORS.border}`, background: COLORS.panel }} className="rounded-lg overflow-hidden">
              <div style={{ borderBottom: `1px solid ${COLORS.border}`, background: COLORS.panelAlt }} className="px-5 py-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: COLORS.amberDim, letterSpacing: "0.1em" }}>
                    PAGE · {new Date(current.createdAt).toLocaleDateString()}
                  </div>
                  <input
                    value={current.title}
                    onChange={(e) => setCurrent({ ...current, title: e.target.value })}
                    onBlur={commitCurrent}
                    style={{
                      ...inputBase,
                      fontFamily: "'Archivo Black', sans-serif",
                      fontSize: "20px",
                      color: COLORS.text,
                      marginTop: "4px",
                    }}
                    placeholder="Page title"
                  />
                </div>
                <button
                  onClick={reset}
                  style={{ fontFamily: "'IBM Plex Mono', monospace", color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}
                  className="px-2.5 py-1.5 rounded text-xs flex items-center gap-1.5 hover:text-white hover:border-white/30 shrink-0"
                >
                  <Plus size={13} /> NEW SNIP
                </button>
              </div>

              <div className="px-5 py-4">
                {/* Snips gallery */}
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: COLORS.textMuted, letterSpacing: "0.1em" }} className="mb-2">
                  SNIPS
                </div>
                <div className="flex items-start gap-3 overflow-x-auto mb-5 pb-1">
                  {currentImages.map((img) => (
                    <div key={img.id} className="flex flex-col items-center gap-1.5 group shrink-0" style={{ width: 74 }}>
                      <div style={{ position: "relative" }}>
                        {img.thumb ? (
                          <img
                            src={img.thumb}
                            alt={img.label}
                            onClick={() => openLightbox(img.id)}
                            style={{
                              width: 68,
                              height: 68,
                              objectFit: "cover",
                              borderRadius: 4,
                              border: `1px solid ${COLORS.border}`,
                              boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
                              cursor: "pointer",
                            }}
                          />
                        ) : (
                          <div
                            style={{ width: 68, height: 68, borderRadius: 4, border: `1px solid ${COLORS.border}`, background: COLORS.panelAlt }}
                          />
                        )}
                        <button
                          onClick={(e) => removeImage(img.id, e)}
                          style={{
                            position: "absolute",
                            top: -6,
                            right: -6,
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            background: COLORS.panel,
                            border: `1px solid ${COLORS.border}`,
                            color: COLORS.textMuted,
                          }}
                          className="flex items-center justify-center opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                        >
                          <X size={10} />
                        </button>
                      </div>
                      <input
                        value={img.label}
                        onChange={(e) => editImageLabel(img.id, e.target.value)}
                        onBlur={commitCurrent}
                        style={{
                          ...inputBase,
                          textAlign: "center",
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: "10px",
                          color: COLORS.textMuted,
                        }}
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => addImageInputRef.current?.click()}
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: 4,
                      border: `1px dashed ${COLORS.border}`,
                      color: COLORS.textMuted,
                      flexShrink: 0,
                    }}
                    className="flex items-center justify-center hover:text-white hover:border-white/30 transition-colors"
                    title="Add another snip"
                  >
                    <Plus size={18} />
                  </button>
                  <input
                    ref={addImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleImageFile(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                </div>

                {/* Summary */}
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: COLORS.textMuted, letterSpacing: "0.1em" }} className="mb-1.5">
                  SUMMARY
                </div>
                <textarea
                  value={current.summary}
                  onChange={(e) => {
                    setCurrent({ ...current, summary: e.target.value });
                    autoGrow(e.target);
                  }}
                  onFocus={(e) => autoGrow(e.target)}
                  onBlur={commitCurrent}
                  placeholder="One or two lines on what this page is about…"
                  rows={1}
                  style={{ ...inputBase, fontSize: "14px", color: COLORS.textMuted, lineHeight: 1.6, overflow: "hidden" }}
                  className="mb-4"
                />

                {/* Tags */}
                <div className="flex flex-wrap items-center gap-1.5 mb-5">
                  {current.tags?.map((tag, i) => (
                    <span
                      key={i}
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: "10px",
                        color: COLORS.amber,
                        border: `1px solid ${COLORS.amberDim}`,
                        background: "rgba(236,237,239,0.06)",
                      }}
                      className="px-2 py-1 rounded flex items-center gap-1"
                    >
                      {tag}
                      <X size={10} className="cursor-pointer hover:text-white" onClick={() => removeTag(tag)} />
                    </span>
                  ))}
                  <input
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && tagDraft.trim()) {
                        addTag(tagDraft);
                        setTagDraft("");
                      }
                    }}
                    placeholder="+ tag"
                    style={{
                      ...inputBase,
                      width: "70px",
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: "10px",
                      color: COLORS.textMuted,
                    }}
                  />
                </div>

                {/* Steps */}
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: COLORS.textMuted, letterSpacing: "0.1em" }} className="mb-2">
                  STEPS
                </div>
                <div className="flex flex-col gap-1 mb-2">
                  {current.steps.map((step, i) => (
                    <div
                      key={i}
                      style={{
                        border: `1px solid ${COLORS.border}`,
                        background: step.done ? "rgba(95,207,138,0.06)" : COLORS.panelAlt,
                      }}
                      className="rounded px-3 py-2.5 flex items-start gap-3 group"
                    >
                      <div
                        onClick={() => toggleStep(i)}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          border: `1.5px solid ${step.done ? COLORS.green : COLORS.border}`,
                          background: step.done ? COLORS.green : "transparent",
                          flexShrink: 0,
                          marginTop: 2,
                          cursor: "pointer",
                        }}
                        className="flex items-center justify-center"
                      >
                        {step.done && <Check size={12} color={COLORS.bg} strokeWidth={3} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <input
                          value={step.title}
                          onChange={(e) => editStep(i, "title", e.target.value)}
                          onBlur={commitCurrent}
                          placeholder="Step title"
                          style={{
                            ...inputBase,
                            fontSize: "13.5px",
                            color: step.done ? COLORS.textMuted : COLORS.text,
                            textDecoration: step.done ? "line-through" : "none",
                          }}
                        />
                        <textarea
                          value={step.detail}
                          onChange={(e) => {
                            editStep(i, "detail", e.target.value);
                            autoGrow(e.target);
                          }}
                          onFocus={(e) => autoGrow(e.target)}
                          onBlur={commitCurrent}
                          placeholder="Details (optional)"
                          rows={1}
                          style={{ ...inputBase, fontSize: "12px", color: COLORS.textMuted, lineHeight: 1.5, marginTop: 2, overflow: "hidden" }}
                        />
                      </div>
                      <Trash2
                        size={13}
                        onClick={() => removeStep(i)}
                        style={{ color: COLORS.textMuted, flexShrink: 0, marginTop: 3, cursor: "pointer" }}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                      />
                    </div>
                  ))}
                  {current.steps.length === 0 && (
                    <div style={{ color: COLORS.textMuted, fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace" }}>
                      no steps yet
                    </div>
                  )}
                </div>
                <button
                  onClick={addStep}
                  style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: COLORS.textMuted, border: `1px dashed ${COLORS.border}` }}
                  className="w-full py-1.5 rounded flex items-center justify-center gap-1.5 hover:text-white hover:border-white/30 mb-5"
                >
                  <Plus size={12} /> ADD STEP
                </button>

                {/* Free-form notes */}
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: COLORS.textMuted, letterSpacing: "0.1em" }} className="mb-1.5">
                  NOTES
                </div>
                <div
                  style={{
                    position: "relative",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: "6px",
                    overflow: "hidden",
                    background: COLORS.panelAlt,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 34,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: "rgba(226,99,79,0.3)",
                      pointerEvents: "none",
                    }}
                  />
                  <textarea
                    value={current.notes}
                    onChange={(e) => {
                      setCurrent({ ...current, notes: e.target.value });
                      autoGrow(e.target);
                    }}
                    onFocus={(e) => autoGrow(e.target)}
                    onBlur={commitCurrent}
                    placeholder="Write anything else here — context, follow-ups, links…"
                    rows={4}
                    style={{
                      ...inputBase,
                      fontSize: "13.5px",
                      lineHeight: "26px",
                      padding: "10px 14px 12px 44px",
                      minHeight: "120px",
                      overflow: "hidden",
                      backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent 25px, ${COLORS.border} 25px, ${COLORS.border} 26px)`,
                      backgroundAttachment: "local",
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Binder sidebar */}
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: COLORS.textMuted, letterSpacing: "0.1em" }} className="mb-2 px-1">
            BINDER — {notes.length} PAGE{notes.length === 1 ? "" : "S"}
          </div>
          <div style={{ border: `1px solid ${COLORS.border}`, background: COLORS.panel }} className="rounded-lg divide-y max-h-[560px] overflow-y-auto">
            {!loaded && (
              <div style={{ color: COLORS.textMuted, fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace" }} className="p-4">
                loading…
              </div>
            )}
            {loaded && notes.length === 0 && (
              <div style={{ color: COLORS.textMuted, fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace" }} className="p-4">
                the binder is empty
              </div>
            )}
            {notes.map((note) => (
              <div
                key={note.id}
                onClick={() => openNote(note)}
                style={{ borderColor: COLORS.border, background: current?.id === note.id ? COLORS.panelAlt : "transparent" }}
                className="px-3.5 py-3 cursor-pointer hover:bg-white/[0.03] flex items-start justify-between gap-2 group"
              >
                <div className="min-w-0 flex items-start gap-2">
                  {(note.images?.length > 0 || note.hasImage) && (
                    <span
                      style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.amber, marginTop: 5, flexShrink: 0 }}
                      title={`${note.images?.length || 1} snip${(note.images?.length || 1) === 1 ? "" : "s"}`}
                    />
                  )}
                  <div>
                    <div style={{ fontSize: "13px", color: COLORS.text }} className="truncate">
                      {note.title || "Untitled page"}
                    </div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: COLORS.textMuted }} className="mt-1">
                      {new Date(note.createdAt).toLocaleDateString()} · {note.steps?.filter((s) => s.done).length || 0}/{note.steps?.length || 0} done
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => deleteNote(note.id, e)}
                  style={{ color: COLORS.textMuted }}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity shrink-0 mt-0.5"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {lightboxOpen && (
        <div
          onClick={closeLightbox}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,12,14,0.88)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            cursor: "zoom-out",
          }}
        >
          <button
            onClick={closeLightbox}
            style={{
              position: "absolute",
              top: 20,
              right: 20,
              color: COLORS.text,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.panel,
            }}
            className="p-2 rounded hover:border-white/40"
          >
            <X size={16} />
          </button>
          {lightboxLoading && !lightboxSrc && (
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px", color: COLORS.textMuted }}>
              loading full snip…
            </div>
          )}
          {lightboxSrc && (
            <img
              src={lightboxSrc}
              alt="full snip"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: "90vw",
                maxHeight: "90vh",
                borderRadius: 6,
                border: `1px solid ${COLORS.border}`,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                cursor: "default",
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
