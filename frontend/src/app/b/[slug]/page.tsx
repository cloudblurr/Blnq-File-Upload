"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { Lock, ArrowLeft, Loader2, AlertTriangle, X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://blnq-api.blnq.workers.dev";

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

function MediaTile({
  file,
  index,
  onClick,
  eager,
}: {
  file: BundleFile;
  index: number;
  onClick: () => void;
  eager?: boolean;
}) {
  const [visible, setVisible] = useState(Boolean(eager));
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (visible || eager) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      });
    }, { rootMargin: "200px" });
    if (ref.current) {
      observer.observe(ref.current);
    }
    return () => observer.disconnect();
  }, [visible, eager]);

  const showImage = file.file_type?.startsWith("image/");
  const showVideo = file.file_type?.startsWith("video/");

  return (
    <div
      ref={ref}
      onClick={onClick}
      className="group relative aspect-square rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 cursor-pointer transition-all hover:scale-[1.02]"
    >
      {!visible && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900" />
      )}

      {visible && showImage && (
        <img
          src={file.url}
          alt={file.slug}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          loading={eager ? "eager" : "lazy"}
          onLoad={() => setLoaded(true)}
        />
      )}

      {visible && showVideo && (
        <video
          src={file.url}
          className="w-full h-full object-cover"
          muted
          preload="metadata"
          playsInline
        />
      )}

      {!showImage && !showVideo && (
        <div className="w-full h-full flex items-center justify-center text-zinc-600">
          <Download className="w-8 h-8" />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="absolute bottom-2 left-2 right-2">
          <p className="text-[9px] font-mono text-zinc-300 truncate">{file.slug}</p>
        </div>
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchBundleInfo();
  }, [slug]);

  const firstMedia = useMemo(() => {
    if (!bundleInfo) return null;
    return bundleInfo.files.find((file) => file.file_type?.startsWith("image/") || file.file_type?.startsWith("video/")) || null;
  }, [bundleInfo]);

  useEffect(() => {
    if (!firstMedia) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = firstMedia.file_type?.startsWith("video/") ? "video" : "image";
    link.href = firstMedia.url;
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, [firstMedia]);

  const fetchBundleInfo = async () => {
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
  };

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

  const isMedia = (type: string | null) => {
    if (!type) return false;
    return type.startsWith("image/") || type.startsWith("video/");
  };

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  const prevItem = () => {
    if (lightboxIndex === null || !bundleInfo) return;
    setLightboxIndex(lightboxIndex === 0 ? bundleInfo.files.length - 1 : lightboxIndex - 1);
  };
  const nextItem = () => {
    if (lightboxIndex === null || !bundleInfo) return;
    setLightboxIndex(lightboxIndex === bundleInfo.files.length - 1 ? 0 : lightboxIndex + 1);
  };

  // Keyboard navigation for lightbox
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") prevItem();
      if (e.key === "ArrowRight") nextItem();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxIndex, bundleInfo]);

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
  if (bundleInfo?.has_pin && !pinUnlocked) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-50 font-sans items-center justify-center px-6">
        <div className="w-full max-w-xs bg-zinc-900/60 border border-zinc-800 rounded-2xl p-8 shadow-2xl text-center">
          <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-5">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-zinc-100 mb-1">Protected Bundle</h2>
          <p className="text-xs text-zinc-400 mb-5">Enter the PIN to view this gallery.</p>

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

  // Gallery View
  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-50 font-sans">
      <header className="w-full max-w-6xl mx-auto px-6 py-4 flex items-center justify-between border-b border-zinc-900 z-10">
        <Link href="/" className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-bold text-white text-sm shadow-lg shadow-indigo-500/20">
            B
          </div>
          <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
            Blnq
          </span>
        </Link>
        <div className="text-right">
          <h2 className="text-sm font-semibold text-zinc-200">{bundleInfo?.title}</h2>
          <p className="text-[10px] text-zinc-500">{bundleInfo?.files.length} items</p>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-8 z-10">
        {/* CSS Grid Gallery */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {bundleInfo?.files.map((file, index) => (
            <MediaTile
              key={file.slug}
              file={file}
              index={index}
              eager={index === 0}
              onClick={() => isMedia(file.file_type) ? openLightbox(index) : window.open(file.url, "_blank")}
            />
          ))}
        </div>
      </main>

      {/* Fullscreen Lightbox */}
      {lightboxIndex !== null && bundleInfo && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center">
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 rounded-full bg-zinc-900/80 text-zinc-300 hover:text-white transition-colors z-50"
          >
            <X className="w-5 h-5" />
          </button>

          <button
            onClick={prevItem}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-zinc-900/80 text-zinc-300 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            onClick={nextItem}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-zinc-900/80 text-zinc-300 hover:text-white transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="max-w-[90vw] max-h-[90vh] flex items-center justify-center">
            {bundleInfo.files[lightboxIndex]?.file_type?.startsWith("image/") ? (
              <img
                src={bundleInfo.files[lightboxIndex].url}
                alt=""
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
              />
            ) : bundleInfo.files[lightboxIndex]?.file_type?.startsWith("video/") ? (
              <video
                src={bundleInfo.files[lightboxIndex].url}
                controls
                autoPlay
                className="max-w-full max-h-[90vh] rounded-lg"
              />
            ) : null}
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-zinc-500">
            {lightboxIndex + 1} / {bundleInfo.files.length}
          </div>
        </div>
      )}
    </div>
  );
}
