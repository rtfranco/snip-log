import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Clipboard, Trash2, Check, Plus, AlertTriangle, RotateCcw, X, FilePlus2, Search,
  ChevronDown, ChevronLeft, ChevronRight, Pencil, Square, ArrowUpRight, Eraser, Save,
  Book, Type, LayoutGrid, Settings as SettingsIcon, Download, Palette,
} from "lucide-react";

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

const API_PROXY_URL = import.meta.env.VITE_API_PROXY_URL || "http://localhost:8787";

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=Archivo+Black&family=Source+Serif+4:wght@400;600;700&family=Playfair+Display:wght@700;800&display=swap');
`;

const THEMES = {
  slate: {
    label: "Slate",
    bg: "#1E2228",
    panel: "#242830",
    panelAlt: "#2A2F38",
    grid: "#333941",
    border: "#3A4048",
    amber: "#ECEDEF",
    amberDim: "#4A505A",
    green: "#9FB8A6",
    blue: "#7EB6FF",
    ink: "#12151A",
    text: "#ECEDEF",
    textMuted: "#868D96",
    danger: "#D97B6C",
  },
  crt: {
    label: "Amber CRT",
    bg: "#0B0D08",
    panel: "#14170F",
    panelAlt: "#1A1E13",
    grid: "#2A2F1C",
    border: "#3A3F26",
    amber: "#FFB000",
    amberDim: "#8C6218",
    green: "#7CFF9E",
    blue: "#7EB6FF",
    ink: "#050600",
    text: "#FFD27A",
    textMuted: "#8C8358",
    danger: "#FF6B4A",
  },
  paper: {
    label: "Paper",
    bg: "#F4F1E8",
    panel: "#FBFAF4",
    panelAlt: "#EFEBDD",
    grid: "#E3DEC9",
    border: "#D8D2BA",
    amber: "#1F2937",
    amberDim: "#8A8365",
    green: "#3F7355",
    blue: "#2F5FA8",
    ink: "#1A1A1A",
    text: "#1F2320",
    textMuted: "#75705C",
    danger: "#B0432E",
  },
};

const FONT_STACKS = {
  technical: {
    label: "Technical",
    display: "'Archivo Black', sans-serif",
    sans: "'IBM Plex Sans', sans-serif",
    mono: "'IBM Plex Mono', monospace",
  },
  classic: {
    label: "Classic",
    display: "'Playfair Display', serif",
    sans: "'Source Serif 4', Georgia, serif",
    mono: "'IBM Plex Mono', monospace",
  },
  minimal: {
    label: "Minimal",
    display: "-apple-system, system-ui, sans-serif",
    sans: "-apple-system, system-ui, sans-serif",
    mono: "ui-monospace, 'SF Mono', monospace",
  },
};

const FONT_SCALES = { sm: 0.9, md: 1, lg: 1.15 };



const DEFAULT_NOTEBOOK = "General";

const TEMPLATES = {
  blank: { label: "Blank Page", steps: [] },
  troubleshooting: {
    label: "Troubleshooting",
    steps: [
      "Document the symptom and when it started",
      "Identify what changed recently",
      "Isolate the root cause",
      "Apply the fix",
      "Verify and document resolution",
    ],
  },
  procedure: {
    label: "Procedure / SOP",
    steps: ["Purpose and scope", "Prerequisites", "Step-by-step actions", "Verification", "Rollback plan"],
  },
  security: {
    label: "Security Finding",
    steps: ["Finding description", "Affected asset(s)", "Risk / impact", "Remediation steps", "Verification"],
  },
};

function blankNote(templateKey = "blank") {
  const template = TEMPLATES[templateKey] || TEMPLATES.blank;
  return {
    id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
    title: "Untitled page",
    summary: "",
    notes: "",
    tags: [],
    notebook: DEFAULT_NOTEBOOK,
    steps: template.steps.map((title) => ({ title, detail: "", done: false })),
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

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

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

  const [themeKey, setThemeKey] = useState("slate");
  const [fontKey, setFontKey] = useState("technical");
  const [fontScale, setFontScale] = useState("md");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState("idle"); // idle | working | done
  const [extraNotebooks, setExtraNotebooks] = useState([]);
  const [newNotebookOpen, setNewNotebookOpen] = useState(false);
  const [newNotebookDraft, setNewNotebookDraft] = useState("");

  const T = THEMES[themeKey] || THEMES.slate;
  const F = FONT_STACKS[fontKey] || FONT_STACKS.technical;

  const inputBase = {
    background: "transparent",
    border: "none",
    outline: "none",
    color: T.text,
    fontFamily: F.sans,
    width: "100%",
    resize: "none",
  };

  const monoLabel = {
    fontFamily: F.mono,
    fontSize: "10px",
    color: T.textMuted,
    letterSpacing: "0.1em",
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await storage.get("snipnotes:all");
        if (mounted && result?.value) setNotes(JSON.parse(result.value));
      } catch (e) {
        // no notes yet
      }
      try {
        const settingsResult = await storage.get("snipnotes:settings");
        if (mounted && settingsResult?.value) {
          const s = JSON.parse(settingsResult.value);
          if (s.themeKey) setThemeKey(s.themeKey);
          if (s.fontKey) setFontKey(s.fontKey);
          if (s.fontScale) setFontScale(s.fontScale);
        }
      } catch (e) {
        // defaults are fine
      }
      try {
        const nbResult = await storage.get("snipnotes:notebooks");
        if (mounted && nbResult?.value) setExtraNotebooks(JSON.parse(nbResult.value));
      } catch (e) {
        // none created yet
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const saveSettings = useCallback(async (patch) => {
    const next = {
      themeKey: patch.themeKey ?? themeKey,
      fontKey: patch.fontKey ?? fontKey,
      fontScale: patch.fontScale ?? fontScale,
    };
    if (patch.themeKey) setThemeKey(patch.themeKey);
    if (patch.fontKey) setFontKey(patch.fontKey);
    if (patch.fontScale) setFontScale(patch.fontScale);
    try {
      await storage.set("snipnotes:settings", JSON.stringify(next));
    } catch (e) {
      // best-effort
    }
  }, [themeKey, fontKey, fontScale]);

  const addNotebook = async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = Array.from(new Set([...extraNotebooks, trimmed]));
    setExtraNotebooks(next);
    try {
      await storage.set("snipnotes:notebooks", JSON.stringify(next));
    } catch (e) {
      // best-effort
    }
    setNotebookFilter(trimmed);
    setNewNotebookDraft("");
    setNewNotebookOpen(false);
  };

  const exportAllData = async () => {
    setExportStatus("working");
    try {
      const imageMap = {};
      for (const note of notes) {
        for (const img of note.images || []) {
          try {
            const thumbRes = await storage.get(`snipnotes:img:${img.id}`);
            const fullRes = await storage.get(`snipnotes:imgfull:${img.id}`);
            imageMap[img.id] = { thumb: thumbRes?.value || null, full: fullRes?.value || null };
          } catch (e) {
            // skip missing images
          }
        }
      }
      const payload = { exportedAt: new Date().toISOString(), app: "FIELDNOTE", notes, images: imageMap };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fieldnote-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportStatus("done");
      setTimeout(() => setExportStatus("idle"), 2000);
    } catch (e) {
      setExportStatus("idle");
    }
  };

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
      notebook: DEFAULT_NOTEBOOK,
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
        notebook: DEFAULT_NOTEBOOK,
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
    setCurrent({ ...current, steps: updatedSteps });
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
      } catch (e) {}
      try {
        await storage.delete(`snipnotes:imgfull:${img.id}`);
      } catch (e) {}
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
        const loadedImgs = await Promise.all(
          images.map(async (img) => {
            const result = await storage.get(`snipnotes:img:${img.id}`);
            return { id: img.id, label: img.label || "Snip", thumb: result?.value || null };
          })
        );
        setCurrentImages(loadedImgs);
      } catch (e) {
        setCurrentImages([]);
      }
    } else {
      setCurrentImages([]);
    }
  };

  const newPageFromTemplate = async (templateKey) => {
    const note = blankNote(templateKey);
    const next = [note, ...notes];
    setCurrent(note);
    setStatus("PAGE");
    setPreview(null);
    setCurrentImages([]);
    setErrorMsg("");
    setTemplateMenuOpen(false);
    await persistNotes(next);
  };

  const setNotebook = (name) => {
    if (!current) return;
    updateCurrent({ notebook: name || DEFAULT_NOTEBOOK });
  };

  const statusColor =
    status === "ANALYZING" ? T.amber : status === "ERROR" ? T.danger : status === "PAGE" ? T.green : T.textMuted;

  const [tagDraft, setTagDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [notebookFilter, setNotebookFilter] = useState("All");
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [dayFilter, setDayFilter] = useState(null);

  // Annotation (drawing on top of a snip in the lightbox)
  const [annotating, setAnnotating] = useState(false);
  const [annotateTool, setAnnotateTool] = useState("pen"); // pen | rect | arrow | text
  const [annotateColor, setAnnotateColor] = useState(T.danger);
  const [textInputPos, setTextInputPos] = useState(null); // { canvasX, canvasY, cssLeft, cssTop }
  const [textInputValue, setTextInputValue] = useState("");
  const baseCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const drawingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const lastPosRef = useRef({ x: 0, y: 0 });

  const matchesSearch = (note, query) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const haystacks = [
      note.title,
      note.summary,
      note.notes,
      ...(note.tags || []),
      ...(note.steps || []).flatMap((s) => [s.title, s.detail]),
      ...(note.images || []).map((img) => img.label),
    ];
    return haystacks.some((h) => (h || "").toLowerCase().includes(q));
  };

  const notebooks = Array.from(new Set([DEFAULT_NOTEBOOK, ...extraNotebooks, ...notes.map((n) => n.notebook || DEFAULT_NOTEBOOK)]));

  const visibleNotes = notes.filter(
    (n) =>
      (notebookFilter === "All" || (n.notebook || DEFAULT_NOTEBOOK) === notebookFilter) &&
      (!dayFilter || sameDay(new Date(n.createdAt), dayFilter)) &&
      matchesSearch(n, searchQuery)
  );

  const today = startOfDay(new Date());
  const weekBase = new Date(today);
  weekBase.setDate(weekBase.getDate() + weekOffset * 7);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekBase);
    d.setDate(d.getDate() - 6 + i);
    return d;
  });
  const countForDay = (d) => notes.filter((n) => sameDay(new Date(n.createdAt), d)).length;

  // ---- image annotation helpers ----
  const getCanvasPoint = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const drawArrow = (ctx, x1, y1, x2, y2, color) => {
    const headLen = 14;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  };

  const startAnnotating = () => {
    if (!lightboxSrc) return;
    setAnnotating(true);
    setTimeout(() => {
      const base = baseCanvasRef.current;
      const overlay = overlayCanvasRef.current;
      if (!base || !overlay) return;
      const img = new Image();
      img.onload = () => {
        base.width = img.width;
        base.height = img.height;
        overlay.width = img.width;
        overlay.height = img.height;
        base.getContext("2d").drawImage(img, 0, 0);
      };
      img.src = lightboxSrc;
    }, 0);
  };

  const clearAnnotations = () => {
    const base = baseCanvasRef.current;
    if (!base || !lightboxSrc) return;
    const img = new Image();
    img.onload = () => {
      base.getContext("2d").clearRect(0, 0, base.width, base.height);
      base.getContext("2d").drawImage(img, 0, 0);
    };
    img.src = lightboxSrc;
  };

  const commitTextAnnotation = () => {
    if (textInputValue.trim() && textInputPos) {
      const base = baseCanvasRef.current;
      const ctx = base.getContext("2d");
      ctx.font = "bold 28px 'IBM Plex Mono', monospace";
      ctx.fillStyle = annotateColor;
      ctx.textBaseline = "top";
      ctx.fillText(textInputValue, textInputPos.canvasX, textInputPos.canvasY);
    }
    setTextInputPos(null);
    setTextInputValue("");
  };

  const handleAnnotatePointerDown = (e) => {
    const overlay = overlayCanvasRef.current;
    const base = baseCanvasRef.current;
    const wrap = canvasWrapRef.current;
    if (!overlay || !base || !wrap) return;

    if (annotateTool === "text") {
      const canvasPt = getCanvasPoint(e, overlay);
      const wrapRect = wrap.getBoundingClientRect();
      setTextInputPos({
        canvasX: canvasPt.x,
        canvasY: canvasPt.y,
        cssLeft: e.clientX - wrapRect.left,
        cssTop: e.clientY - wrapRect.top,
      });
      return;
    }

    drawingRef.current = true;
    const pt = getCanvasPoint(e, overlay);
    startPosRef.current = pt;
    lastPosRef.current = pt;
    if (annotateTool === "pen") {
      const ctx = base.getContext("2d");
      ctx.fillStyle = annotateColor;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const handleAnnotatePointerMove = (e) => {
    if (!drawingRef.current) return;
    const overlay = overlayCanvasRef.current;
    const base = baseCanvasRef.current;
    if (!overlay || !base) return;
    const pt = getCanvasPoint(e, overlay);
    if (annotateTool === "pen") {
      const ctx = base.getContext("2d");
      ctx.strokeStyle = annotateColor;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      lastPosRef.current = pt;
    } else {
      const octx = overlay.getContext("2d");
      octx.clearRect(0, 0, overlay.width, overlay.height);
      if (annotateTool === "rect") {
        octx.strokeStyle = annotateColor;
        octx.lineWidth = 3;
        octx.strokeRect(startPosRef.current.x, startPosRef.current.y, pt.x - startPosRef.current.x, pt.y - startPosRef.current.y);
      } else if (annotateTool === "arrow") {
        drawArrow(octx, startPosRef.current.x, startPosRef.current.y, pt.x, pt.y, annotateColor);
      }
      lastPosRef.current = pt;
    }
  };

  const handleAnnotatePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const overlay = overlayCanvasRef.current;
    const base = baseCanvasRef.current;
    if (!overlay || !base) return;
    if (annotateTool !== "pen") {
      const ctx = base.getContext("2d");
      if (annotateTool === "rect") {
        ctx.strokeStyle = annotateColor;
        ctx.lineWidth = 3;
        ctx.strokeRect(
          startPosRef.current.x,
          startPosRef.current.y,
          lastPosRef.current.x - startPosRef.current.x,
          lastPosRef.current.y - startPosRef.current.y
        );
      } else if (annotateTool === "arrow") {
        drawArrow(ctx, startPosRef.current.x, startPosRef.current.y, lastPosRef.current.x, lastPosRef.current.y, annotateColor);
      }
      overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
    }
  };

  const saveAnnotatedImage = async () => {
    if (!current || !baseCanvasRef.current) return;
    const dataUrl = baseCanvasRef.current.toDataURL("image/jpeg", 0.9);
    const thumb = await resizeToJpeg(dataUrl, 260, 0.75);
    const imageId = newImageId();
    const existing = current.images || [];
    const label = "Annotated";
    const images = [...existing, { id: imageId, label }];
    updateCurrent({ images });
    setCurrentImages((prev) => [...prev, { id: imageId, label, thumb }]);
    await saveImageAssets(imageId, thumb, dataUrl);
    setAnnotating(false);
    closeLightbox();
  };

  const ANNOTATE_COLORS = [T.danger, T.amber, T.green, T.blue, T.ink];

  return (
    <div
      style={{
        height: "100vh",
        background: T.bg,
        color: T.text,
        fontFamily: F.sans,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zoom: FONT_SCALES[fontScale] || 1,
      }}
    >
      <style>{FONTS}</style>

      {/* TOP BAR */}
      <div
        style={{ borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}
        className="flex items-center justify-between px-4 py-2 gap-4"
      >
        <div style={{ fontFamily: F.display, fontSize: "15px", letterSpacing: "0.02em" }} className="shrink-0">
          FIELD<span style={{ color: T.amber }}>NOTE</span>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => setWeekOffset((o) => o - 1)} style={{ color: T.textMuted }} className="p-1.5 rounded hover:bg-white/5">
            <ChevronLeft size={14} />
          </button>
          {weekDays.map((d, i) => {
            const isToday = sameDay(d, today);
            const isSelected = dayFilter && sameDay(d, dayFilter);
            const count = countForDay(d);
            return (
              <button
                key={i}
                onClick={() => setDayFilter((prev) => (prev && sameDay(prev, d) ? null : d))}
                style={{
                  fontFamily: F.mono,
                  width: 38,
                  background: isSelected ? T.amber : "transparent",
                  color: isSelected ? T.bg : isToday ? T.text : T.textMuted,
                  border: isToday && !isSelected ? `1px solid ${T.amberDim}` : "1px solid transparent",
                }}
                className="rounded flex flex-col items-center py-1 hover:bg-white/5 relative"
              >
                <span style={{ fontSize: "9px" }}>{DAY_LETTERS[d.getDay()]}</span>
                <span style={{ fontSize: "12px", fontWeight: 600 }}>{d.getDate()}</span>
                {count > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: 2,
                      width: 3,
                      height: 3,
                      borderRadius: "50%",
                      background: isSelected ? T.bg : T.green,
                    }}
                  />
                )}
              </button>
            );
          })}
          <button onClick={() => setWeekOffset((o) => o + 1)} style={{ color: T.textMuted }} className="p-1.5 rounded hover:bg-white/5">
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => {
              setWeekOffset(0);
              setDayFilter(null);
            }}
            style={{ fontFamily: F.mono, fontSize: "11px", color: T.textMuted, border: `1px solid ${T.border}` }}
            className="ml-2 px-2.5 py-1.5 rounded hover:text-white hover:border-white/30"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setSettingsOpen(true)}
            style={{ color: T.textMuted, border: `1px solid ${T.border}` }}
            className="p-1.5 rounded hover:text-white hover:border-white/30"
            title="Settings"
          >
            <SettingsIcon size={15} />
          </button>
          <div
            style={{
              fontFamily: F.mono,
              fontSize: "11px",
              color: statusColor,
              border: `1px solid ${T.border}`,
            }}
            className="px-2.5 py-1.5 rounded flex items-center gap-2"
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: statusColor,
                boxShadow: status === "ANALYZING" ? `0 0 8px ${statusColor}` : "none",
              }}
            />
            {status}
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* LEFT RAIL */}
        <div style={{ width: 210, borderRight: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }} className="flex flex-col p-3 overflow-y-auto">
          <div style={{ position: "relative" }} className="mb-3">
            <button
              onClick={() => setTemplateMenuOpen((v) => !v)}
              style={{
                fontFamily: F.mono,
                fontSize: "12px",
                color: T.amber,
                border: `1px solid ${T.amberDim}`,
                background: T.panelAlt,
              }}
              className="w-full px-3 py-2 rounded flex items-center justify-center gap-2 hover:bg-white/5"
            >
              <FilePlus2 size={13} /> NEW PAGE <ChevronDown size={12} />
            </button>
            {templateMenuOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 30 }} onClick={() => setTemplateMenuOpen(false)} />
                <div
                  style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: T.panelAlt, border: `1px solid ${T.border}`, zIndex: 31 }}
                  className="rounded-lg overflow-hidden shadow-lg"
                >
                  {Object.entries(TEMPLATES).map(([key, t]) => (
                    <button
                      key={key}
                      onClick={() => newPageFromTemplate(key)}
                      style={{ fontFamily: F.mono, fontSize: "11.5px", color: T.text, borderBottom: `1px solid ${T.border}` }}
                      className="w-full text-left px-3 py-2.5 hover:bg-white/5 flex flex-col gap-0.5"
                    >
                      <span>{t.label}</span>
                      {t.steps.length > 0 && <span style={{ color: T.textMuted, fontSize: "10px" }}>{t.steps.length} preset steps</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{ border: `1px solid ${T.border}`, background: T.panelAlt }} className="rounded-lg flex items-center gap-2 px-2.5 py-2 mb-3">
            <Search size={12} color={T.textMuted} className="shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search…"
              style={{ ...inputBase, fontFamily: F.mono, fontSize: "11px", color: T.text }}
            />
            {searchQuery && <X size={12} color={T.textMuted} className="cursor-pointer hover:text-white shrink-0" onClick={() => setSearchQuery("")} />}
          </div>

          <div className="flex items-center justify-between mb-1.5 px-1">
            <div style={monoLabel}>NOTEBOOKS</div>
            <button onClick={() => setNewNotebookOpen((v) => !v)} style={{ color: T.textMuted }} className="hover:text-white" title="New notebook">
              <Plus size={12} />
            </button>
          </div>
          {newNotebookOpen && (
            <div style={{ border: `1px solid ${T.border}`, background: T.panelAlt }} className="rounded flex items-center gap-1.5 px-2 py-1.5 mb-1.5">
              <input
                autoFocus
                value={newNotebookDraft}
                onChange={(e) => setNewNotebookDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addNotebook(newNotebookDraft); if (e.key === "Escape") { setNewNotebookOpen(false); setNewNotebookDraft(""); } }}
                placeholder="Notebook name…"
                style={{ ...inputBase, fontFamily: F.mono, fontSize: "11px" }}
              />
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => setNotebookFilter("All")}
              style={{
                fontFamily: F.mono,
                fontSize: "12px",
                color: notebookFilter === "All" ? T.text : T.textMuted,
                background: notebookFilter === "All" ? T.panelAlt : "transparent",
              }}
              className="w-full text-left px-2.5 py-1.5 rounded flex items-center gap-2 hover:bg-white/5"
            >
              <LayoutGrid size={12} /> All Pages
              <span style={{ marginLeft: "auto", fontSize: "10px" }}>{notes.length}</span>
            </button>
            {notebooks.map((nb) => (
              <button
                key={nb}
                onClick={() => setNotebookFilter(nb)}
                style={{
                  fontFamily: F.mono,
                  fontSize: "12px",
                  color: notebookFilter === nb ? T.text : T.textMuted,
                  background: notebookFilter === nb ? T.panelAlt : "transparent",
                }}
                className="w-full text-left px-2.5 py-1.5 rounded flex items-center gap-2 hover:bg-white/5"
              >
                <Book size={12} /> {nb}
                <span style={{ marginLeft: "auto", fontSize: "10px" }}>{notes.filter((n) => (n.notebook || DEFAULT_NOTEBOOK) === nb).length}</span>
              </button>
            ))}
          </div>
        </div>

        {/* CENTER */}
        <div className="flex-1 overflow-y-auto p-5">
          {!current && status !== "ANALYZING" && status !== "ERROR" && (
            <>
              <div
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                style={{ border: `1.5px dashed ${T.border}`, background: T.panel }}
                className="rounded-lg flex items-center gap-3 px-4 py-3 mb-4 cursor-pointer hover:border-white/20 transition-colors"
              >
                <Clipboard size={18} color={T.amberDim} />
                <div style={{ fontFamily: F.mono, fontSize: "12px", color: T.text }}>
                  ⌘V / CTRL+V to paste a snip, or click to upload
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])} />
              </div>

              <div style={monoLabel} className="mb-2">
                {dayFilter ? `PAGES · ${dayFilter.toLocaleDateString()}` : searchQuery.trim() ? `${visibleNotes.length} OF ${notes.length} PAGES` : `${notes.length} PAGE${notes.length === 1 ? "" : "S"}`}
              </div>
              <div className="flex flex-col gap-1.5">
                {loaded && notes.length === 0 && (
                  <div style={{ color: T.textMuted, fontSize: "12px", fontFamily: F.mono }} className="p-6 text-center">
                    the binder is empty
                  </div>
                )}
                {loaded && notes.length > 0 && visibleNotes.length === 0 && (
                  <div style={{ color: T.textMuted, fontSize: "12px", fontFamily: F.mono }} className="p-6 text-center">
                    no pages match
                  </div>
                )}
                {visibleNotes.map((note) => (
                  <div
                    key={note.id}
                    onClick={() => openNote(note)}
                    style={{ border: `1px solid ${T.border}`, background: T.panel }}
                    className="rounded-lg px-4 py-3 cursor-pointer hover:border-white/20 transition-colors flex items-start justify-between gap-3 group"
                  >
                    <div className="min-w-0 flex items-start gap-2.5">
                      {(note.images?.length > 0 || note.hasImage) && (
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.amber, marginTop: 6, flexShrink: 0 }} />
                      )}
                      <div className="min-w-0">
                        <div style={{ fontSize: "14px", color: T.text }} className="truncate">{note.title || "Untitled page"}</div>
                        <div style={{ fontFamily: F.mono, fontSize: "10.5px", color: T.textMuted }} className="mt-1">
                          {note.notebook || DEFAULT_NOTEBOOK} · {new Date(note.createdAt).toLocaleDateString()} · {note.steps?.filter((s) => s.done).length || 0}/{note.steps?.length || 0} done
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteNote(note.id, e)}
                      style={{ color: T.textMuted }}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity shrink-0 mt-0.5"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {status === "ANALYZING" && (
            <div style={{ border: `1px solid ${T.border}`, background: T.panel, minHeight: "300px" }} className="rounded-lg flex flex-col items-center justify-center gap-4 relative overflow-hidden">
              {preview && <img src={preview} alt="snip preview" style={{ maxHeight: 160, opacity: 0.35, borderRadius: 4 }} />}
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: T.amber, boxShadow: `0 0 12px ${T.amber}`, animation: "scan 1.6s linear infinite" }} />
              <style>{`@keyframes scan { 0% { transform: translateY(0); } 100% { transform: translateY(298px); } }`}</style>
              <div style={{ fontFamily: F.mono, fontSize: "13px", color: T.amber }}>ANALYZING SNIP…</div>
            </div>
          )}

          {status === "ERROR" && (
            <div style={{ border: `1px solid ${T.danger}`, background: T.panel, minHeight: "200px" }} className="rounded-lg flex flex-col items-center justify-center gap-3 px-6 text-center">
              <AlertTriangle size={28} color={T.danger} />
              <div style={{ fontFamily: F.mono, fontSize: "13px", color: T.text }}>{errorMsg}</div>
              <button onClick={reset} style={{ fontFamily: F.mono, color: T.amber, border: `1px solid ${T.amberDim}` }} className="px-3 py-1.5 rounded text-xs flex items-center gap-1.5 hover:bg-white/5">
                <RotateCcw size={13} /> RESET
              </button>
            </div>
          )}

          {current && status === "PAGE" && (
            <div style={{ border: `1px solid ${T.border}`, background: T.panel }} className="rounded-lg overflow-hidden max-w-3xl">
              <div style={{ borderBottom: `1px solid ${T.border}`, background: T.panelAlt }} className="px-5 py-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div style={{ fontFamily: F.mono, fontSize: "10px", color: T.amberDim, letterSpacing: "0.1em" }}>
                    PAGE · {new Date(current.createdAt).toLocaleDateString()}
                  </div>
                  <input
                    value={current.title}
                    onChange={(e) => setCurrent({ ...current, title: e.target.value })}
                    onBlur={commitCurrent}
                    style={{ ...inputBase, fontFamily: F.display, fontSize: "20px", color: T.text, marginTop: "4px" }}
                    placeholder="Page title"
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!rightPanelOpen && (
                    <button
                      onClick={() => setRightPanelOpen(true)}
                      style={{ fontFamily: F.mono, color: T.textMuted, border: `1px solid ${T.border}` }}
                      className="px-2.5 py-1.5 rounded text-xs hover:text-white hover:border-white/30"
                    >
                      SHOW INFO
                    </button>
                  )}
                  <button onClick={reset} style={{ fontFamily: F.mono, color: T.textMuted, border: `1px solid ${T.border}` }} className="px-2.5 py-1.5 rounded text-xs flex items-center gap-1.5 hover:text-white hover:border-white/30">
                    <Plus size={13} /> NEW SNIP
                  </button>
                </div>
              </div>

              <div className="px-5 py-4">
                <div style={monoLabel} className="mb-1.5">SUMMARY</div>
                <textarea
                  value={current.summary}
                  onChange={(e) => { setCurrent({ ...current, summary: e.target.value }); autoGrow(e.target); }}
                  onFocus={(e) => autoGrow(e.target)}
                  onBlur={commitCurrent}
                  placeholder="One or two lines on what this page is about…"
                  rows={1}
                  style={{ ...inputBase, fontSize: "14px", color: T.textMuted, lineHeight: 1.6, overflow: "hidden" }}
                  className="mb-4"
                />

                <div className="flex flex-wrap items-center gap-1.5 mb-5">
                  {current.tags?.map((tag, i) => (
                    <span key={i} style={{ fontFamily: F.mono, fontSize: "10px", color: T.amber, border: `1px solid ${T.amberDim}`, background: "rgba(236,237,239,0.06)" }} className="px-2 py-1 rounded flex items-center gap-1">
                      {tag}
                      <X size={10} className="cursor-pointer hover:text-white" onClick={() => removeTag(tag)} />
                    </span>
                  ))}
                  <input
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && tagDraft.trim()) { addTag(tagDraft); setTagDraft(""); } }}
                    placeholder="+ tag"
                    style={{ ...inputBase, width: "70px", fontFamily: F.mono, fontSize: "10px", color: T.textMuted }}
                  />
                </div>

                <div style={monoLabel} className="mb-2">STEPS</div>
                <div className="flex flex-col gap-1 mb-2">
                  {current.steps.map((step, i) => (
                    <div key={i} style={{ border: `1px solid ${T.border}`, background: step.done ? "rgba(95,207,138,0.06)" : T.panelAlt }} className="rounded px-3 py-2.5 flex items-start gap-3 group">
                      <div
                        onClick={() => toggleStep(i)}
                        style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${step.done ? T.green : T.border}`, background: step.done ? T.green : "transparent", flexShrink: 0, marginTop: 2, cursor: "pointer" }}
                        className="flex items-center justify-center"
                      >
                        {step.done && <Check size={12} color={T.bg} strokeWidth={3} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <input
                          value={step.title}
                          onChange={(e) => editStep(i, "title", e.target.value)}
                          onBlur={commitCurrent}
                          placeholder="Step title"
                          style={{ ...inputBase, fontSize: "13.5px", color: step.done ? T.textMuted : T.text, textDecoration: step.done ? "line-through" : "none" }}
                        />
                        <textarea
                          value={step.detail}
                          onChange={(e) => { editStep(i, "detail", e.target.value); autoGrow(e.target); }}
                          onFocus={(e) => autoGrow(e.target)}
                          onBlur={commitCurrent}
                          placeholder="Details (optional)"
                          rows={1}
                          style={{ ...inputBase, fontSize: "12px", color: T.textMuted, lineHeight: 1.5, marginTop: 2, overflow: "hidden" }}
                        />
                      </div>
                      <Trash2 size={13} onClick={() => removeStep(i)} style={{ color: T.textMuted, flexShrink: 0, marginTop: 3, cursor: "pointer" }} className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity" />
                    </div>
                  ))}
                  {current.steps.length === 0 && <div style={{ color: T.textMuted, fontSize: "12px", fontFamily: F.mono }}>no steps yet</div>}
                </div>
                <button onClick={addStep} style={{ fontFamily: F.mono, fontSize: "11px", color: T.textMuted, border: `1px dashed ${T.border}` }} className="w-full py-1.5 rounded flex items-center justify-center gap-1.5 hover:text-white hover:border-white/30 mb-5">
                  <Plus size={12} /> ADD STEP
                </button>

                <div style={monoLabel} className="mb-1.5">NOTES</div>
                <div style={{ position: "relative", border: `1px solid ${T.border}`, borderRadius: "6px", overflow: "hidden", background: T.panelAlt }}>
                  <div style={{ position: "absolute", left: 34, top: 0, bottom: 0, width: 1, background: "rgba(226,99,79,0.3)", pointerEvents: "none" }} />
                  <textarea
                    value={current.notes}
                    onChange={(e) => { setCurrent({ ...current, notes: e.target.value }); autoGrow(e.target); }}
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
                      backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent 25px, ${T.border} 25px, ${T.border} 26px)`,
                      backgroundAttachment: "local",
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL — page info + snips gallery */}
        {current && status === "PAGE" && rightPanelOpen && (
          <div style={{ width: 300, borderLeft: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }} className="flex flex-col overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <div style={monoLabel}>INFO</div>
              <button onClick={() => setRightPanelOpen(false)} style={{ fontFamily: F.mono, fontSize: "10px", color: T.textMuted, border: `1px solid ${T.border}` }} className="px-2 py-1 rounded hover:text-white hover:border-white/30">
                Hide
              </button>
            </div>

            <div style={monoLabel} className="mb-1.5">NOTEBOOK</div>
            <div className="flex items-center gap-1.5 mb-4">
              <Book size={12} color={T.textMuted} />
              <input
                list="notebook-options"
                value={current.notebook || DEFAULT_NOTEBOOK}
                onChange={(e) => setNotebook(e.target.value)}
                onBlur={commitCurrent}
                style={{ ...inputBase, fontFamily: F.mono, fontSize: "12px", color: T.text, border: `1px solid ${T.border}`, borderRadius: 4, padding: "6px 8px" }}
              />
              <datalist id="notebook-options">
                {notebooks.map((nb) => <option key={nb} value={nb} />)}
              </datalist>
            </div>

            <div style={monoLabel} className="mb-1.5">STATUS</div>
            <div style={{ fontFamily: F.mono, fontSize: "11.5px", color: T.textMuted }} className="mb-4">
              {current.steps.filter((s) => s.done).length}/{current.steps.length} steps done · {currentImages.length} snip{currentImages.length === 1 ? "" : "s"}
            </div>

            <div className="flex items-center justify-between mb-2">
              <div style={monoLabel}>SNIPS</div>
              <button onClick={() => addImageInputRef.current?.click()} style={{ color: T.textMuted }} className="hover:text-white" title="Add another snip">
                <Plus size={14} />
              </button>
              <input
                ref={addImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleImageFile(e.target.files[0]); e.target.value = ""; }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {currentImages.map((img) => (
                <div key={img.id} className="flex flex-col items-center gap-1 group">
                  <div style={{ position: "relative", width: "100%" }}>
                    {img.thumb ? (
                      <img
                        src={img.thumb}
                        alt={img.label}
                        onClick={() => openLightbox(img.id)}
                        style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 4, border: `1px solid ${T.border}`, cursor: "pointer" }}
                      />
                    ) : (
                      <div style={{ width: "100%", aspectRatio: "1", borderRadius: 4, border: `1px solid ${T.border}`, background: T.panelAlt }} />
                    )}
                    <button
                      onClick={(e) => removeImage(img.id, e)}
                      style={{ position: "absolute", top: -5, right: -5, width: 16, height: 16, borderRadius: "50%", background: T.panel, border: `1px solid ${T.border}`, color: T.textMuted }}
                      className="flex items-center justify-center opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                    >
                      <X size={9} />
                    </button>
                  </div>
                  <input
                    value={img.label}
                    onChange={(e) => editImageLabel(img.id, e.target.value)}
                    onBlur={commitCurrent}
                    style={{ ...inputBase, textAlign: "center", fontFamily: F.mono, fontSize: "9px", color: T.textMuted }}
                  />
                </div>
              ))}
              <button
                onClick={() => addImageInputRef.current?.click()}
                style={{ width: "100%", aspectRatio: "1", borderRadius: 4, border: `1px dashed ${T.border}`, color: T.textMuted }}
                className="flex items-center justify-center hover:text-white hover:border-white/30 transition-colors"
                title="Add another snip"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {lightboxOpen && (
        <div
          onClick={annotating ? undefined : closeLightbox}
          style={{ position: "fixed", inset: 0, background: "rgba(10,12,14,0.9)", zIndex: 50, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", cursor: annotating ? "default" : "zoom-out" }}
        >
          <button
            onClick={() => { if (annotating) { setAnnotating(false); setTextInputPos(null); } else closeLightbox(); }}
            style={{ position: "absolute", top: 20, right: 20, color: T.text, border: `1px solid ${T.border}`, background: T.panel }}
            className="p-2 rounded hover:border-white/40"
          >
            <X size={16} />
          </button>

          {!annotating && lightboxSrc && (
            <button
              onClick={(e) => { e.stopPropagation(); startAnnotating(); }}
              style={{ position: "absolute", top: 20, right: 68, fontFamily: F.mono, fontSize: "12px", color: T.amber, border: `1px solid ${T.amberDim}`, background: T.panel }}
              className="px-3 py-2 rounded flex items-center gap-1.5 hover:bg-white/5"
            >
              <Pencil size={13} /> ANNOTATE
            </button>
          )}

          {lightboxLoading && !lightboxSrc && (
            <div style={{ fontFamily: F.mono, fontSize: "12px", color: T.textMuted }}>loading full snip…</div>
          )}

          {lightboxSrc && !annotating && (
            <img
              src={lightboxSrc}
              alt="full snip"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 6, border: `1px solid ${T.border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", cursor: "default" }}
            />
          )}

          {annotating && (
            <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-3">
              <div ref={canvasWrapRef} style={{ position: "relative", maxWidth: "85vw", maxHeight: "68vh" }}>
                <canvas ref={baseCanvasRef} style={{ maxWidth: "85vw", maxHeight: "68vh", display: "block", borderRadius: 6, border: `1px solid ${T.border}` }} />
                <canvas
                  ref={overlayCanvasRef}
                  onPointerDown={handleAnnotatePointerDown}
                  onPointerMove={handleAnnotatePointerMove}
                  onPointerUp={handleAnnotatePointerUp}
                  onPointerLeave={handleAnnotatePointerUp}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: annotateTool === "text" ? "text" : "crosshair", touchAction: "none" }}
                />
                {textInputPos && (
                  <input
                    autoFocus
                    value={textInputValue}
                    onChange={(e) => setTextInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitTextAnnotation(); if (e.key === "Escape") { setTextInputPos(null); setTextInputValue(""); } }}
                    onBlur={commitTextAnnotation}
                    style={{
                      position: "absolute",
                      left: textInputPos.cssLeft,
                      top: textInputPos.cssTop,
                      background: "rgba(18,21,26,0.85)",
                      border: `1px solid ${annotateColor}`,
                      color: annotateColor,
                      fontFamily: F.mono,
                      fontWeight: 700,
                      fontSize: "16px",
                      padding: "2px 6px",
                      outline: "none",
                      minWidth: "80px",
                    }}
                  />
                )}
              </div>
              <div style={{ border: `1px solid ${T.border}`, background: T.panel }} className="rounded-lg flex items-center gap-1.5 px-2 py-2 flex-wrap justify-center">
                {[
                  { key: "pen", icon: Pencil, label: "Pen" },
                  { key: "rect", icon: Square, label: "Box" },
                  { key: "arrow", icon: ArrowUpRight, label: "Arrow" },
                  { key: "text", icon: Type, label: "Text" },
                ].map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    onClick={() => setAnnotateTool(key)}
                    title={label}
                    style={{ color: annotateTool === key ? T.bg : T.textMuted, background: annotateTool === key ? T.amber : "transparent", border: `1px solid ${annotateTool === key ? T.amber : T.border}` }}
                    className="p-2 rounded"
                  >
                    <Icon size={14} />
                  </button>
                ))}
                <div style={{ width: 1, alignSelf: "stretch", background: T.border }} className="mx-1" />
                {ANNOTATE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setAnnotateColor(c)}
                    title="Color"
                    style={{ width: 20, height: 20, borderRadius: "50%", background: c, border: annotateColor === c ? `2px solid ${T.text}` : `1px solid ${T.border}` }}
                  />
                ))}
                <div style={{ width: 1, alignSelf: "stretch", background: T.border }} className="mx-1" />
                <button onClick={clearAnnotations} title="Clear" style={{ color: T.textMuted, border: `1px solid ${T.border}` }} className="p-2 rounded hover:text-white hover:border-white/30">
                  <Eraser size={14} />
                </button>
                <button onClick={saveAnnotatedImage} style={{ fontFamily: F.mono, fontSize: "11px", color: T.bg, background: T.green }} className="px-3 py-2 rounded flex items-center gap-1.5 ml-1">
                  <Save size={13} /> SAVE AS NEW SNIP
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {settingsOpen && (
        <div
          onClick={() => setSettingsOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(10,12,14,0.75)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: T.panel, border: `1px solid ${T.border}`, width: 420, maxWidth: "90vw", maxHeight: "85vh" }}
            className="rounded-lg overflow-y-auto"
          >
            <div style={{ borderBottom: `1px solid ${T.border}` }} className="px-5 py-4 flex items-center justify-between">
              <div style={{ fontFamily: F.display, fontSize: "16px" }}>Settings</div>
              <button onClick={() => setSettingsOpen(false)} style={{ color: T.textMuted }} className="hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4">
              <div style={monoLabel} className="mb-2 flex items-center gap-1.5">
                <Palette size={11} /> THEME
              </div>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {Object.entries(THEMES).map(([key, theme]) => (
                  <button
                    key={key}
                    onClick={() => saveSettings({ themeKey: key })}
                    style={{
                      border: themeKey === key ? `2px solid ${T.amber}` : `1px solid ${T.border}`,
                      background: theme.bg,
                    }}
                    className="rounded-lg p-2.5 flex flex-col items-start gap-2"
                  >
                    <div className="flex gap-1">
                      <span style={{ width: 12, height: 12, borderRadius: "50%", background: theme.amber }} />
                      <span style={{ width: 12, height: 12, borderRadius: "50%", background: theme.green }} />
                      <span style={{ width: 12, height: 12, borderRadius: "50%", background: theme.danger }} />
                    </div>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: theme.text }}>{theme.label}</span>
                  </button>
                ))}
              </div>

              <div style={monoLabel} className="mb-2 flex items-center gap-1.5">
                <Type size={11} /> FONT STYLE
              </div>
              <div className="flex gap-2 mb-5">
                {Object.entries(FONT_STACKS).map(([key, stack]) => (
                  <button
                    key={key}
                    onClick={() => saveSettings({ fontKey: key })}
                    style={{
                      fontFamily: stack.sans,
                      fontSize: "12px",
                      color: fontKey === key ? T.bg : T.text,
                      background: fontKey === key ? T.amber : T.panelAlt,
                      border: `1px solid ${fontKey === key ? T.amber : T.border}`,
                      flex: 1,
                    }}
                    className="rounded px-3 py-2"
                  >
                    {stack.label}
                  </button>
                ))}
              </div>

              <div style={monoLabel} className="mb-2">FONT SIZE</div>
              <div className="flex gap-2 mb-5">
                {[{ key: "sm", label: "Small" }, { key: "md", label: "Medium" }, { key: "lg", label: "Large" }].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => saveSettings({ fontScale: key })}
                    style={{
                      fontFamily: F.mono,
                      fontSize: "12px",
                      color: fontScale === key ? T.bg : T.text,
                      background: fontScale === key ? T.amber : T.panelAlt,
                      border: `1px solid ${fontScale === key ? T.amber : T.border}`,
                      flex: 1,
                    }}
                    className="rounded px-3 py-2"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={monoLabel} className="mb-2 flex items-center gap-1.5">
                <Download size={11} /> EXPORT
              </div>
              <button
                onClick={exportAllData}
                disabled={exportStatus === "working"}
                style={{ fontFamily: F.mono, fontSize: "12px", color: T.bg, background: T.green }}
                className="w-full rounded px-3 py-2.5 flex items-center justify-center gap-2"
              >
                <Download size={13} />
                {exportStatus === "working" ? "EXPORTING…" : exportStatus === "done" ? "DOWNLOADED" : "EXPORT ALL DATA (.JSON)"}
              </button>
              <div style={{ fontFamily: F.mono, fontSize: "10px", color: T.textMuted }} className="mt-2">
                Downloads every page, note, and snip image as one JSON file — a full local backup.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
