"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Lock,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Copy,
  Check,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  FileArchive,
  File,
  Sparkles,
  Calendar,
  Globe,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://www.blnq.click";

interface BundleFile {
  slug: string;
  url: string;
  file_type: string | null;
  file_size: number | null;
}

interface BundleInfo {
  slug: string;
  title: string;
  has_pin: boolean;
  created_at: string;
  files: BundleFile[];
}

type FileKind = "image" | "video" | "audio" | "pdf" | "doc" | "text" | "zip" | "other" | "blocked";

const BLOCKED_MIME_PREFIXES = [
  "application/x-msdownload",
  "application/x-sh",
  "application/x-bat",
  "application/x-executable",
  "application/x-dosexec",
  "application/x-powershell",
  "application/java-archive",
];

const BLOCKED_EXTENSIONS = [
  ".exe",
  ".msi",
  ".bat",
  ".cmd",
  ".com",
  ".dll",
  ".scr",
  ".ps1",
  ".sh",
  ".jar",
  ".vb",
  ".vbs",
];

const DOC_MIME_TYPES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[idx]}`;
}

function extFromSlug(slug: string): string {
  const i = slug.lastIndexOf(".");
  return i < 0 ? "" : slug.slice(i).toLowerCase();
}

function kindFromFile(file: BundleFile): FileKind {
  const mime = (file.file_type || "").toLowerCase();
  const ext = extFromSlug(file.slug);
  if (BLOCKED_MIME_PREFIXES.some((blocked) => mime.startsWith(blocked)) || BLOCKED_EXTENSIONS.includes(ext)) return "blocked";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (DOC_MIME_TYPES.includes(mime)) return "doc";
  if (mime === "application/zip" || mime === "application/x-zip-compressed" || ext === ".zip") return "zip";
  if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") return "text";
  return "other";
}

function kindMeta(kind: FileKind) {
  switch (kind) {
    case "image":
      return { icon: ImageIcon, label: "Image", tone: "text-emerald-300 border-emerald-400/30 bg-emerald-500/10" };
    case "video":
      return { icon: Video, label: "Video", tone: "text-blue-300 border-blue-400/30 bg-blue-500/10" };
    case "audio":
      return { icon: Music, label: "Audio", tone: "text-fuchsia-300 border-fuchsia-400/30 bg-fuchsia-500/10" };
    case "pdf":
      return { icon: FileText, label: "PDF", tone: "text-rose-300 border-rose-400/30 bg-rose-500/10" };
    case "doc":
      return { icon: FileText, label: "Document", tone: "text-sky-300 border-sky-400/30 bg-sky-500/10" };
    case "text":
      return { icon: FileText, label: "Text", tone: "text-zinc-300 border-zinc-400/30 bg-zinc-500/10" };
    case "zip":
      return { icon: FileArchive, label: "Archive", tone: "text-amber-300 border-amber-400/30 bg-amber-500/10" };
    case "blocked":
      return { icon: AlertTriangle, label: "Blocked", tone: "text-red-300 border-red-400/30 bg-red-500/10" };
    default:
      return { icon: File, label: "File", tone: "text-[#ffb347] border-[#ff7a18]/40 bg-[#ff7a18]/10" };
  }
}

function BundleTile({
  file,
  kind,
  copied,
  onCopy,
  onOpen,
  eager,
}: {
  file: BundleFile;
  kind: FileKind;
  copied: boolean;
  onCopy: () => void;
  onOpen: () => void;
  eager?: boolean;
}) {
  const [visible, setVisible] = useState(Boolean(eager) || (typeof window !== "undefined" && !("IntersectionObserver" in window)));
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const meta = kindMeta(kind);
  const MetaIcon = meta.icon;

  useEffect(() => {
    if (visible || eager) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      });
    }, { rootMargin: "200px" });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible, eager]);

  return (
    <div
      ref={ref}
      onClick={onOpen}
      className="group relative rounded-2xl overflow-hidden border border-[#ff7a18]/20 bg-[#090509]/75 hover:border-[#ffb347]/45 cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-[0_22px_40px_rgba(0,0,0,0.45)]"
    >
      <div className="aspect-[4/3] bg-[#050205]">
        {visible && kind === "image" && (
          <img
            src={file.url}
            alt={file.slug}
            className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
            loading={eager ? "eager" : "lazy"}
            onLoad={() => setLoaded(true)}
          />
        )}
        {visible && kind === "video" && (
          <video src={file.url} className="w-full h-full object-cover" muted preload="metadata" playsInline />
        )}
        {(kind === "audio" || kind === "pdf" || kind === "doc" || kind === "text" || kind === "zip" || kind === "other" || kind === "blocked") && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-zinc-300 bg-gradient-to-br from-[#120a12] to-[#090509]">
            <MetaIcon className="w-8 h-8" />
            <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">{meta.label}</span>
          </div>
        )}
      </div>

      <div className="absolute top-2 left-2">
        <span className={`px-2 py-1 rounded-md text-[10px] border ${meta.tone}`}>{meta.label}</span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCopy();
        }}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-black/55 border border-white/20 text-zinc-200 hover:text-white hover:border-white/40 transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
      </button>

      <div className="p-3">
        <p className="text-xs font-semibold text-zinc-100 truncate">{file.slug}</p>
        <p className="text-[11px] text-zinc-400">{formatBytes(file.file_size)}</p>
      </div>
    </div>
  );
}

export default function BundleViewPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [bundleInfo, setBundleInfo] = useState<BundleInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const fetchBundleInfo = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/bundle-info/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        setError("Bundle not found.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setBundleInfo(data);
      if (!data.has_pin) setPinUnlocked(true);
    } catch {
      setError("Failed to load bundle info.");
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchBundleInfo();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchBundleInfo]);

  const kinds = useMemo(() => (bundleInfo?.files || []).map((f) => kindFromFile(f)), [bundleInfo]);
  const totalSize = useMemo(() => (bundleInfo?.files || []).reduce((acc, f) => acc + (f.file_size || 0), 0), [bundleInfo]);

  const selectedFile = activeIndex !== null && bundleInfo ? bundleInfo.files[activeIndex] : null;
  const selectedKind = activeIndex !== null && kinds[activeIndex] ? kinds[activeIndex] : null;

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError("");
    setPinLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, pin: pinInput, type: "bundle" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPinUnlocked(true);
      } else {
        setPinError(data.error || "Incorrect PIN");
      }
    } catch {
      setPinError("Network error. Try again.");
    }
    setPinLoading(false);
  };

  const copyItemUrl = async (url: string, itemSlug: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(itemSlug);
      setTimeout(() => setCopiedSlug((current) => (current === itemSlug ? null : current)), 1500);
    } catch {
      setCopiedSlug(null);
    }
  };

  const closePreview = () => setActiveIndex(null);
  const prevItem = useCallback(() => {
    if (activeIndex === null || !bundleInfo) return;
    setActiveIndex(activeIndex === 0 ? bundleInfo.files.length - 1 : activeIndex - 1);
  }, [activeIndex, bundleInfo]);
  const nextItem = useCallback(() => {
    if (activeIndex === null || !bundleInfo) return;
    setActiveIndex(activeIndex === bundleInfo.files.length - 1 ? 0 : activeIndex + 1);
  }, [activeIndex, bundleInfo]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (activeIndex === null) return;
      if (e.key === "Escape") closePreview();
      if (e.key === "ArrowLeft") prevItem();
      if (e.key === "ArrowRight") nextItem();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeIndex, prevItem, nextItem]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#050205] text-[#ffb347]">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#050205] text-[#f7f4ef] px-6">
        <AlertTriangle className="w-10 h-10 text-red-400 mb-4" />
        <p className="text-sm text-[#ffb347]/80">{error}</p>
        <Link href="/" className="mt-4 text-xs text-[#ff7a18] hover:text-[#ffd65b] flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to Blnq
        </Link>
      </div>
    );
  }

  if (bundleInfo?.has_pin && !pinUnlocked) {
    return (
      <div className="flex flex-col min-h-screen bg-[#050205] text-[#f7f4ef] font-sans items-center justify-center px-6">
        <div className="w-full max-w-xs bg-[#0a0308]/80 border border-[#ff7a18]/25 rounded-2xl p-8 shadow-[0_25px_60px_rgba(0,0,0,0.55)] text-center">
          <div className="w-14 h-14 rounded-full bg-[#ff7a18]/10 border border-[#ffb347]/40 flex items-center justify-center text-[#ffb347] mx-auto mb-5">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-[#f7f4ef] mb-1">Protected Bundle</h2>
          <p className="text-xs text-[#ffb347]/70 mb-5">Enter the PIN to view this gallery.</p>

          <form onSubmit={handlePinSubmit} className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              minLength={4}
              maxLength={8}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
              className="w-full px-4 py-3 rounded-xl bg-[#050205] border border-[#ff7a18]/25 focus:border-[#ffd65b]/50 outline-none text-lg text-[#f7f4ef] font-mono text-center tracking-[0.3em]"
              placeholder="••••"
              autoFocus
            />
            {pinError && <p className="text-xs text-red-400">{pinError}</p>}
            <button
              type="submit"
              disabled={pinInput.length < 4 || pinLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#ff7a18] to-[#ffb347] hover:from-[#ff8c2f] hover:to-[#ffd65b] text-[#1a120e] font-semibold text-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {pinLoading ? "Verifying..." : "Unlock"}
            </button>
          </form>
        </div>
        <Link href="/" className="mt-6 text-xs text-[#ffb347]/70 hover:text-[#ffd65b] flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to Blnq
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#040205] text-[#f7f4ef] font-sans relative overflow-hidden">
      <div className="absolute top-[-16%] left-[-11%] w-[620px] h-[620px] rounded-full bg-[#ff7a18]/15 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-15%] w-[560px] h-[560px] rounded-full bg-[#ffb347]/12 blur-[140px] pointer-events-none" />

      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between border-b border-[#ff7a18]/25 z-10">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/brand-symbol.jpg" alt="Blnq symbol" width={38} height={38} className="rounded-2xl border border-[#ff7a18]/35" />
          <Image src="/brand-logo.jpg" alt="Blnq logo" width={120} height={40} className="h-8 w-auto object-contain" />
        </Link>
        <div className="text-right">
          <h2 className="text-sm sm:text-base font-semibold text-[#f7f4ef] flex items-center justify-end gap-1.5">
            <Sparkles className="w-4 h-4 text-[#ffb347]" />
            {bundleInfo?.title || "Untitled Bundle"}
          </h2>
          <p className="text-[11px] text-[#ffb347]/70 font-mono">{bundleInfo?.slug}</p>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-8 z-10 space-y-6">
        <section className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-[#ff7a18]/20 bg-[#0a0308]/70 p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#ffb347]/70">Total Items</p>
            <p className="text-2xl font-bold text-[#f7f4ef] mt-1">{bundleInfo?.files.length || 0}</p>
          </div>
          <div className="rounded-2xl border border-[#ff7a18]/20 bg-[#0a0308]/70 p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#ffb347]/70">Total Size</p>
            <p className="text-2xl font-bold text-[#f7f4ef] mt-1">{formatBytes(totalSize)}</p>
          </div>
          <div className="rounded-2xl border border-[#ff7a18]/20 bg-[#0a0308]/70 p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#ffb347]/70 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Created
            </p>
            <p className="text-sm font-semibold text-[#f7f4ef] mt-1">
              {bundleInfo?.created_at ? new Date(bundleInfo.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown"}
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-[#ff7a18]/20 bg-[#0b050b]/72 p-4 md:p-5 backdrop-blur-xl shadow-[0_22px_65px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm uppercase tracking-[0.24em] text-[#ffb347]/80">Bundle Grid</h3>
            <p className="text-xs text-zinc-400">Click any tile to preview • copy icon for direct URL</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bundleInfo?.files.map((file, index) => (
              <BundleTile
                key={file.slug}
                file={file}
                kind={kinds[index]}
                copied={copiedSlug === file.slug}
                onCopy={() => copyItemUrl(file.url, file.slug)}
                onOpen={() => setActiveIndex(index)}
                eager={index === 0}
              />
            ))}
          </div>
        </section>
      </main>

      {activeIndex !== null && selectedFile && selectedKind && (
        <div className="fixed inset-0 z-50 bg-black/93 backdrop-blur-sm flex items-center justify-center p-4">
          <button
            onClick={closePreview}
            className="absolute top-4 right-4 p-2 rounded-full bg-[#1a120e]/85 text-[#f7f4ef] hover:text-white transition-colors z-50"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            onClick={prevItem}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-[#1a120e]/85 text-[#f7f4ef] hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={nextItem}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-[#1a120e]/85 text-[#f7f4ef] hover:text-white transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="w-full max-w-5xl max-h-[88vh] rounded-3xl border border-[#ff7a18]/25 bg-[#090409]/88 p-4 md:p-5 overflow-auto">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-sm font-semibold text-[#f7f4ef] break-all">{selectedFile.slug}</p>
                <p className="text-xs text-zinc-400">{formatBytes(selectedFile.file_size)} • {kindMeta(selectedKind).label}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyItemUrl(selectedFile.url, selectedFile.slug)}
                  className="py-2 px-3 rounded-lg bg-[#1a120e] border border-[#ff7a18]/25 hover:border-[#ffb347]/50 text-[#ffb347] text-xs font-medium transition-all flex items-center gap-1.5"
                >
                  {copiedSlug === selectedFile.slug ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy URL
                </button>
                <a
                  href={selectedFile.url}
                  download
                  className="py-2 px-3 rounded-lg bg-gradient-to-r from-[#ff7a18] to-[#ffb347] hover:from-[#ff8c2f] hover:to-[#ffd65b] text-[#1a120e] text-xs font-semibold transition-all flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </a>
              </div>
            </div>

            <div className="rounded-2xl border border-[#ff7a18]/20 bg-black/35 p-2 min-h-[60vh] flex items-center justify-center">
              {selectedKind === "image" && (
                <img src={selectedFile.url} alt="" className="max-w-full max-h-[78vh] object-contain rounded-lg" />
              )}
              {selectedKind === "video" && (
                <video src={selectedFile.url} controls autoPlay className="w-full max-h-[78vh] rounded-lg" />
              )}
              {selectedKind === "audio" && (
                <div className="w-full max-w-xl text-center space-y-3">
                  <Music className="w-12 h-12 text-[#ffb347] mx-auto" />
                  <audio src={selectedFile.url} controls className="w-full" />
                </div>
              )}
              {selectedKind === "pdf" && (
                <iframe src={selectedFile.url} className="w-full h-[74vh] rounded-lg bg-white" title="PDF preview" />
              )}
              {selectedKind === "doc" && (
                <iframe
                  src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(selectedFile.url)}`}
                  className="w-full h-[74vh] rounded-lg bg-white"
                  title="Office preview"
                />
              )}
              {(selectedKind === "zip" || selectedKind === "text" || selectedKind === "other" || selectedKind === "blocked") && (
                <div className="text-center space-y-3 px-4">
                  {selectedKind === "zip" && <FileArchive className="w-11 h-11 text-[#ffb347] mx-auto" />}
                  {selectedKind === "text" && <FileText className="w-11 h-11 text-[#ffb347] mx-auto" />}
                  {selectedKind === "other" && <File className="w-11 h-11 text-[#ffb347] mx-auto" />}
                  {selectedKind === "blocked" && <AlertTriangle className="w-11 h-11 text-red-400 mx-auto" />}
                  <p className="text-sm text-zinc-300">
                    {selectedKind === "blocked"
                      ? "This file type is blocked from in-browser rendering for safety."
                      : "Preview is limited for this file type. Use download for full access."}
                  </p>
                  <p className="text-xs text-zinc-500 flex items-center justify-center gap-1">
                    <Globe className="w-3.5 h-3.5" />
                    Direct URL access stays available
                  </p>
                </div>
              )}
            </div>

            <p className="text-[11px] text-zinc-500 mt-3 text-center">
              {activeIndex + 1} / {bundleInfo?.files.length || 0}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
