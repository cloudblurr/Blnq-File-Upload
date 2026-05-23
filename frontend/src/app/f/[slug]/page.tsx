"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Lock, Eye, Download, ArrowLeft, Loader2, AlertTriangle, Music } from "lucide-react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://blnq-api.blnq.workers.dev";

interface FileInfo {
  slug: string;
  file_type: string | null;
  file_size: number | null;
  has_pin: boolean;
  expires_at: string | null;
  created_at: string;
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

  useEffect(() => {
    fetchFileInfo();
  }, [slug]);

  const fetchFileInfo = async () => {
    try {
      const res = await fetch(`${API_URL}/api/file-info/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        setError("File not found or has expired.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setFileInfo(data);
      if (!data.has_pin) setPinUnlocked(true);
    } catch {
      setError("Failed to load file info.");
    }
    setLoading(false);
  };

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

  const fileUrl = `${API_URL}/${slug}`;
  const isImage = fileInfo?.file_type?.startsWith("image/");
  const isVideo = fileInfo?.file_type?.startsWith("video/");
  const isAudio = fileInfo?.file_type?.startsWith("audio/");
  const isPdf = fileInfo?.file_type === "application/pdf";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-50 px-6">
        <AlertTriangle className="w-10 h-10 text-red-400 mb-4" />
        <p className="text-sm text-zinc-400">{error}</p>
        <Link href="/" className="mt-4 text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to Blnq
        </Link>
      </div>
    );
  }

  // PIN Gate
  if (fileInfo?.has_pin && !pinUnlocked) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-50 font-sans items-center justify-center px-6">
        <div className="w-full max-w-xs bg-zinc-900/60 border border-zinc-800 rounded-2xl p-8 shadow-2xl text-center">
          <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-5">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-zinc-100 mb-1">Protected File</h2>
          <p className="text-xs text-zinc-400 mb-5">Enter the PIN to access this file.</p>

          <form onSubmit={handlePinSubmit} className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              minLength={4}
              maxLength={8}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
              className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-zinc-700 outline-none text-lg text-zinc-100 font-mono text-center tracking-[0.3em]"
              placeholder="••••"
              autoFocus
            />
            {pinError && <p className="text-xs text-red-400">{pinError}</p>}
            <button
              type="submit"
              disabled={pinInput.length < 4 || pinLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {pinLoading ? "Verifying..." : "Unlock"}
            </button>
          </form>
        </div>
        <Link href="/" className="mt-6 text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to Blnq
        </Link>
      </div>
    );
  }

  // File Viewer
  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-50 font-sans">
      <header className="w-full max-w-5xl mx-auto px-6 py-4 flex items-center justify-between border-b border-zinc-900 z-10">
        <Link href="/" className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-bold text-white text-sm shadow-lg shadow-indigo-500/20">
            B
          </div>
          <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
            Blnq
          </span>
        </Link>
        <a
          href={fileUrl}
          download
          className="py-2 px-4 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-medium transition-all flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" /> Download
        </a>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl">
          {isImage && (
            <div className="flex items-center justify-center">
              <img src={fileUrl} alt={slug} className="max-w-full max-h-[80vh] rounded-xl shadow-2xl object-contain" />
            </div>
          )}
          {isVideo && (
            <video src={fileUrl} controls className="max-w-full max-h-[80vh] rounded-xl shadow-2xl mx-auto" />
          )}
          {isAudio && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Music className="w-16 h-16 text-zinc-600" />
              <audio src={fileUrl} controls className="w-full max-w-md" />
            </div>
          )}
          {isPdf && (
            <iframe src={fileUrl} className="w-full h-[80vh] rounded-xl border border-zinc-800" />
          )}
          {!isImage && !isVideo && !isAudio && !isPdf && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <Eye className="w-12 h-12 text-zinc-600" />
              <p className="text-sm text-zinc-400">This file type cannot be previewed.</p>
              <a
                href={fileUrl}
                download
                className="py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
              >
                Download File
              </a>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-xs font-mono text-zinc-500">{slug}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
