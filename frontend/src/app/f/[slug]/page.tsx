"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Lock, Eye, Download, ArrowLeft, Loader2, AlertTriangle, Music } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://blnq.click";

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

  // PIN Gate
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

  // File Viewer
  return (
    <div className="flex flex-col min-h-screen bg-[#050205] text-[#f7f4ef] font-sans">
      <header className="w-full max-w-5xl mx-auto px-6 py-4 flex items-center justify-between border-b border-[#ff7a18]/25 z-10">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/blnq0.jpg" alt="Blnq" width={36} height={36} className="rounded-2xl border border-[#ff7a18]/35" />
          <Image src="/logofull.png" alt="Blnq" width={110} height={40} className="h-8 w-auto object-contain" />
        </Link>
        <a
          href={fileUrl}
          download
          className="py-2 px-4 rounded-lg bg-[#1a120e] border border-[#ff7a18]/25 hover:border-[#ffb347]/50 text-[#ffb347] text-xs font-medium transition-all flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" /> Download
        </a>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl">
          {isImage && (
            <div className="flex items-center justify-center">
              <img src={fileUrl} alt={slug} className="max-w-full max-h-[80vh] rounded-xl shadow-[0_25px_60px_rgba(0,0,0,0.5)] object-contain" />
            </div>
          )}
          {isVideo && (
            <video src={fileUrl} controls className="max-w-full max-h-[80vh] rounded-xl shadow-[0_25px_60px_rgba(0,0,0,0.5)] mx-auto" />
          )}
          {isAudio && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Music className="w-16 h-16 text-zinc-600" />
              <audio src={fileUrl} controls className="w-full max-w-md" />
            </div>
          )}
          {isPdf && (
            <iframe src={fileUrl} className="w-full h-[80vh] rounded-xl border border-[#ff7a18]/25" />
          )}
          {!isImage && !isVideo && !isAudio && !isPdf && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <Eye className="w-12 h-12 text-zinc-600" />
              <p className="text-sm text-zinc-400">This file type cannot be previewed.</p>
              <a
                href={fileUrl}
                download
                className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-[#ff7a18] to-[#ffb347] hover:from-[#ff8c2f] hover:to-[#ffd65b] text-[#1a120e] text-sm font-semibold transition-colors"
              >
                Download File
              </a>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-xs font-mono text-[#ffb347]/70">{slug}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
