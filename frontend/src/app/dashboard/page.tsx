"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Trash2, Lock, Unlock, Clock, Copy, Check, ExternalLink,
  ArrowLeft, LogOut, File, Image, Video, Music, FileText, Loader2
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://blnq-api.blnq.workers.dev";

interface Upload {
  id: string;
  slug: string;
  file_type: string | null;
  file_size: number | null;
  password_hash: string | null;
  expires_at: string | null;
  created_at: string;
  bundle_id: string | null;
}

export default function DashboardPage() {
  const { user, session, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pinModal, setPinModal] = useState<{ slug: string; action: "set" | "change" } | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [expiryModal, setExpiryModal] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) fetchUploads();
  }, [user]);

  const fetchUploads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("uploads")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });
    if (!error && data) setUploads(data);
    setLoading(false);
  };

  const handleDelete = async (slug: string) => {
    if (!confirm("Delete this file permanently?")) return;
    setActionLoading(slug);
    try {
      const res = await fetch(`${API_URL}/api/files/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.ok) {
        setUploads((prev) => prev.filter((u) => u.slug !== slug));
      }
    } catch (e) { /* ignore */ }
    setActionLoading(null);
  };

  const handleSetPin = async () => {
    if (!pinModal || !pinValue || pinValue.length < 4 || pinValue.length > 8) return;
    setActionLoading(pinModal.slug);
    try {
      await fetch(`${API_URL}/api/files/${encodeURIComponent(pinModal.slug)}/pin`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinValue }),
      });
      await fetchUploads();
    } catch (e) { /* ignore */ }
    setPinModal(null);
    setPinValue("");
    setActionLoading(null);
  };

  const handleRemovePin = async (slug: string) => {
    setActionLoading(slug);
    try {
      await fetch(`${API_URL}/api/files/${encodeURIComponent(slug)}/pin`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      await fetchUploads();
    } catch (e) { /* ignore */ }
    setActionLoading(null);
  };

  const handleSetExpiry = async (slug: string, expiresIn: string) => {
    setActionLoading(slug);
    try {
      await fetch(`${API_URL}/api/files/${encodeURIComponent(slug)}/expiry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expires_in: expiresIn }),
      });
      await fetchUploads();
    } catch (e) { /* ignore */ }
    setExpiryModal(null);
    setActionLoading(null);
  };

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${API_URL}/${slug}`);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  };

  const getFileIcon = (type: string | null) => {
    if (!type) return <File className="w-4 h-4" />;
    if (type.startsWith("image/")) return <Image className="w-4 h-4" />;
    if (type.startsWith("video/")) return <Video className="w-4 h-4" />;
    if (type.startsWith("audio/")) return <Music className="w-4 h-4" />;
    if (type.includes("text") || type.includes("pdf")) return <FileText className="w-4 h-4" />;
    return <File className="w-4 h-4" />;
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return "—";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-50 font-sans">
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-purple-900/10 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between border-b border-zinc-900 z-10">
        <Link href="/" className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-bold tracking-tighter text-white text-lg shadow-lg shadow-indigo-500/20">
            B
          </div>
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
            Blnq
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 hidden sm:block">{user.email}</span>
          <button
            onClick={() => { signOut(); router.push("/"); }}
            className="p-2 rounded-lg bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-100 transition-all cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-8 z-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-zinc-100">My Uploads</h1>
          <Link
            href="/"
            className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> Upload New
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : uploads.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-500 text-sm">No uploads yet.</p>
            <Link href="/" className="text-indigo-400 text-xs mt-2 inline-block hover:text-indigo-300">Upload your first file</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {uploads.map((upload) => (
              <div
                key={upload.id}
                className="bg-zinc-900/40 border border-zinc-900 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                {/* File info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-400">
                    {getFileIcon(upload.file_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-mono text-zinc-200 truncate">{upload.slug}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-zinc-500">
                      <span>{formatBytes(upload.file_size)}</span>
                      <span>{upload.file_type?.split("/")[1] || "file"}</span>
                      <span>{formatDate(upload.created_at)}</span>
                      {upload.password_hash && <span className="text-amber-400 flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" /> PIN</span>}
                      {upload.expires_at && (
                        <span className="text-blue-400 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" /> {formatDate(upload.expires_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => copyLink(upload.slug)}
                    className={`p-2 rounded-lg border text-xs transition-all cursor-pointer ${
                      copied === upload.slug
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : "bg-zinc-950 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200"
                    }`}
                    title="Copy Link"
                  >
                    {copied === upload.slug ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <a
                    href={`${API_URL}/${upload.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-all"
                    title="Open File"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => upload.password_hash ? handleRemovePin(upload.slug) : setPinModal({ slug: upload.slug, action: "set" })}
                    disabled={actionLoading === upload.slug}
                    className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-amber-400 transition-all cursor-pointer disabled:opacity-50"
                    title={upload.password_hash ? "Remove PIN" : "Set PIN"}
                  >
                    {upload.password_hash ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => setExpiryModal(upload.slug)}
                    disabled={actionLoading === upload.slug}
                    className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-blue-400 transition-all cursor-pointer disabled:opacity-50"
                    title="Set Expiry"
                  >
                    <Clock className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(upload.slug)}
                    disabled={actionLoading === upload.slug}
                    className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-red-800 text-zinc-400 hover:text-red-400 transition-all cursor-pointer disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* PIN Modal */}
      {pinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPinModal(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-zinc-200 mb-4">Set PIN Protection</h3>
            <p className="text-xs text-zinc-400 mb-3">Enter a 4-8 digit PIN to protect this file.</p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              minLength={4}
              maxLength={8}
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 8))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-zinc-700 outline-none text-sm text-zinc-100 font-mono text-center tracking-widest"
              placeholder="••••"
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSetPin}
                disabled={pinValue.length < 4}
                className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Set PIN
              </button>
              <button
                onClick={() => { setPinModal(null); setPinValue(""); }}
                className="py-2 px-4 rounded-xl bg-zinc-800 text-zinc-300 text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expiry Modal */}
      {expiryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setExpiryModal(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-zinc-200 mb-4">Set Expiry</h3>
            <div className="space-y-2">
              {[
                { label: "1 Hour", value: "1h" },
                { label: "24 Hours", value: "24h" },
                { label: "7 Days", value: "7d" },
                { label: "Never", value: "never" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSetExpiry(expiryModal, opt.value)}
                  className="w-full py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white text-xs font-medium transition-all cursor-pointer"
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setExpiryModal(null)}
              className="w-full mt-3 py-2 rounded-xl bg-zinc-800 text-zinc-400 text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
