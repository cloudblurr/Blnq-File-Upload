"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Lock,
  Download,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Music,
  FileText,
  FileArchive,
  File,
  Video,
  Image as ImageIcon,
  Copy,
  Check,
  ShieldAlert,
  Globe,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://www.blnq.click";

interface FileInfo {
  slug: string;
  file_type: string | null;
  file_size: number | null;
  has_pin: boolean;
  expires_at: string | null;
  created_at: string;
}

type FileKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "doc"
  | "text"
  | "zip"
  | "other"
  | "blocked";

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

const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/xml"];

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "Unknown size";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[idx]}`;
}

function getExtFromSlug(slug: string): string {
  const idx = slug.lastIndexOf(".");
  if (idx < 0) return "";
  return slug.slice(idx).toLowerCase();
}

function inferFileKind(fileInfo: FileInfo | null): FileKind {
  if (!fileInfo) return "other";
  const mime = (fileInfo.file_type || "").toLowerCase();
  const ext = getExtFromSlug(fileInfo.slug);

  if (BLOCKED_MIME_PREFIXES.some((blocked) => mime.startsWith(blocked)) || BLOCKED_EXTENSIONS.includes(ext)) {
    return "blocked";
  }
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (DOC_MIME_TYPES.includes(mime)) return "doc";
  if (mime === "application/zip" || mime === "application/x-zip-compressed" || ext === ".zip") return "zip";
  if (TEXT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) return "text";
  return "other";
}

function kindMeta(kind: FileKind) {
  switch (kind) {
    case "image":
      return { label: "Image", icon: ImageIcon };
    case "video":
      return { label: "Video", icon: Video };
    case "audio":
      return { label: "Audio", icon: Music };
    case "pdf":
      return { label: "PDF Document", icon: FileText };
    case "doc":
      return { label: "Office Document", icon: FileText };
    case "text":
      return { label: "Text File", icon: FileText };
    case "zip":
      return { label: "ZIP Archive", icon: FileArchive };
    case "blocked":
      return { label: "Blocked Type", icon: ShieldAlert };
    default:
      return { label: "File", icon: File };
  }
}

export default function FileViewPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [textPreview, setTextPreview] = useState<string>("");

  const fetchFileInfo = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/file-info/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        setError("File not found or has expired.");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as FileInfo;
      setFileInfo(data);
      if (!data.has_pin) setPinUnlocked(true);
    } catch {
      setError("Failed to load file info.");
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchFileInfo();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchFileInfo]);

  const fileUrl = `${API_URL}/api/file/${encodeURIComponent(slug)}${accessToken ? `?token=${encodeURIComponent(accessToken)}` : ""}`;
  const kind = useMemo(() => inferFileKind(fileInfo), [fileInfo]);
  const meta = useMemo(() => kindMeta(kind), [kind]);
  const MetaIcon = meta.icon;

  useEffect(() => {
    if (!pinUnlocked || kind !== "text") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) return;
        const text = await res.text();
        if (!cancelled) {
          setTextPreview(text.slice(0, 8000));
        }
      } catch {
        if (!cancelled) setTextPreview("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUrl, kind, pinUnlocked]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError("");
    setPinLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, pin: pinInput, type: "file" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPinUnlocked(true);
        setAccessToken(data.token);
      } else {
        setPinError(data.error || "Incorrect PIN");
      }
    } catch {
      setPinError("Network error. Try again.");
    }
    setPinLoading(false);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(fileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const officePreviewUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;

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

  if (fileInfo?.has_pin && !pinUnlocked) {
    return (
      <div className="flex flex-col min-h-screen bg-[#050205] text-[#f7f4ef] font-sans items-center justify-center px-6">
        <div className="w-full max-w-xs bg-[#0a0308]/80 border border-[#ff7a18]/25 rounded-2xl p-8 shadow-[0_25px_60px_rgba(0,0,0,0.55)] text-center">
          <div className="w-14 h-14 rounded-full bg-[#ff7a18]/10 border border-[#ffb347]/40 flex items-center justify-center text-[#ffb347] mx-auto mb-5">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-[#f7f4ef] mb-1">Protected File</h2>
          <p className="text-xs text-[#ffb347]/70 mb-5">Enter the PIN to access this file.</p>

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
    <div className="flex flex-col min-h-screen bg-[#040205] text-[#f7f4ef] font-sans overflow-hidden">
      <div className="absolute top-[-18%] left-[-15%] w-[620px] h-[620px] rounded-full bg-[#ff7a18]/15 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-18%] right-[-12%] w-[540px] h-[540px] rounded-full bg-[#ffb347]/12 blur-[130px] pointer-events-none" />

      <header className="w-full max-w-6xl mx-auto px-6 py-4 flex items-center justify-between border-b border-[#ff7a18]/25 z-10">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/brand-symbol.jpg" alt="Blnq" width={36} height={36} className="rounded-2xl border border-[#ff7a18]/35" />
          <Image src="/brand-logo.jpg" alt="Blnq" width={116} height={40} className="h-8 w-auto object-contain" />
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={copyLink}
            className="py-2 px-3 rounded-lg bg-[#1a120e] border border-[#ff7a18]/25 hover:border-[#ffb347]/50 text-[#ffb347] text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy URL"}
          </button>
          <a
            href={fileUrl}
            download
            className="py-2 px-4 rounded-lg bg-gradient-to-r from-[#ff7a18] to-[#ffb347] hover:from-[#ff8c2f] hover:to-[#ffd65b] text-[#1a120e] text-xs font-semibold transition-all flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Download
          </a>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-8 z-10 space-y-5">
        <section className="rounded-2xl border border-[#ff7a18]/25 bg-[#0a0308]/70 p-4 md:p-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl border border-[#ff7a18]/35 bg-[#1a120e] flex items-center justify-center text-[#ffb347]">
                <MetaIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#ffb347]/70">File Preview</p>
                <h1 className="text-sm sm:text-base font-semibold text-[#f7f4ef] break-all">{fileInfo?.slug}</h1>
              </div>
            </div>
            <div className="text-xs text-zinc-300 flex items-center gap-3">
              <span className="px-2 py-1 rounded-lg bg-[#1a120e] border border-[#ff7a18]/25 text-[#ffb347]">{meta.label}</span>
              <span>{formatBytes(fileInfo?.file_size || null)}</span>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-[#ff7a18]/25 bg-[#0b050b]/75 p-4 md:p-6 shadow-[0_22px_60px_rgba(0,0,0,0.45)]">
          {kind === "blocked" && (
            <div className="flex flex-col items-center text-center gap-4 py-14">
              <ShieldAlert className="w-11 h-11 text-red-400" />
              <h2 className="text-lg font-semibold text-[#f7f4ef]">Blocked File Type</h2>
              <p className="text-sm text-zinc-400 max-w-md">
                This extension is blocked for in-browser rendering due to security policy. Download only if you trust the source.
              </p>
            </div>
          )}

          {kind === "image" && (
            <div className="flex items-center justify-center min-h-[50vh]">
              <img src={fileUrl} alt={slug} className="max-w-full max-h-[78vh] rounded-2xl shadow-[0_25px_65px_rgba(0,0,0,0.55)] object-contain" />
            </div>
          )}

          {kind === "video" && (
            <video
              src={fileUrl}
              controls
              className="w-full max-h-[78vh] rounded-2xl border border-[#ff7a18]/20 bg-black shadow-[0_25px_65px_rgba(0,0,0,0.55)]"
            />
          )}

          {kind === "audio" && (
            <div className="min-h-[42vh] flex flex-col items-center justify-center gap-5">
              <div className="w-20 h-20 rounded-full bg-[#1a120e] border border-[#ff7a18]/30 flex items-center justify-center text-[#ffb347]">
                <Music className="w-10 h-10" />
              </div>
              <audio src={fileUrl} controls className="w-full max-w-2xl" />
            </div>
          )}

          {kind === "pdf" && (
            <iframe
              src={fileUrl}
              className="w-full h-[78vh] rounded-2xl border border-[#ff7a18]/25 bg-white"
              title="PDF preview"
            />
          )}

          {kind === "doc" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Globe className="w-3.5 h-3.5 text-[#ffb347]" />
                Office viewer embed for DOCX/PPTX/XLSX formats
              </div>
              <iframe
                src={officePreviewUrl}
                className="w-full h-[78vh] rounded-2xl border border-[#ff7a18]/25 bg-white"
                title="Office document preview"
              />
            </div>
          )}

          {kind === "text" && (
            <div className="space-y-3">
              <div className="text-xs text-zinc-400">Text preview (first 8,000 characters)</div>
              <pre className="w-full max-h-[72vh] overflow-auto rounded-2xl border border-[#ff7a18]/25 bg-[#050205] p-4 text-xs text-zinc-200 whitespace-pre-wrap break-words">
                {textPreview || "No readable text preview available."}
              </pre>
            </div>
          )}

          {kind === "zip" && (
            <div className="min-h-[42vh] flex flex-col items-center justify-center text-center gap-4">
              <FileArchive className="w-12 h-12 text-[#ffb347]" />
              <h2 className="text-lg font-semibold text-[#f7f4ef]">ZIP Archive</h2>
              <p className="text-sm text-zinc-400 max-w-md">
                Archive previews are limited in-browser. Download to inspect full directory structure and file contents.
              </p>
            </div>
          )}

          {kind === "other" && (
            <div className="min-h-[42vh] flex flex-col items-center justify-center text-center gap-4">
              <File className="w-11 h-11 text-[#ffb347]" />
              <h2 className="text-lg font-semibold text-[#f7f4ef]">Universal File Support</h2>
              <p className="text-sm text-zinc-400 max-w-md">
                This file type is not directly renderable in-browser, but download is enabled and metadata is fully preserved.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
