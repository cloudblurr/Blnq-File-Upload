"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NextImage from "next/image";
import { PLAN_DEFINITIONS, TierName, TIER_LIMITS } from "@/lib/tiers";
import {
  Trash2, Lock, Unlock, Clock, Copy, Check, ExternalLink,
  ArrowLeft, LogOut, File, Image as ImageIcon, Video, Music, FileText, Loader2, MoveVertical, Plus, QrCode
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://www.blnq.click";

interface Upload {
  id: string;
  slug: string;
  file_type: string | null;
  file_size: number | null;
  password_hash: string | null;
  expires_at: string | null;
  created_at: string;
  bundle_id: string | null;
  qr_r2_key?: string | null;
}

interface BundleCardProps {
  bundle: Bundle;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (bundleSlug: string, event: DragEndEvent) => void;
  onAppend: (bundle: Bundle, files: File[]) => void;
  onRename: (bundleSlug: string, title: string) => Promise<void>;
  appendLoading: boolean;
  renameLoading: boolean;
  remainingSlots: number;
}

function BundleCard({ bundle, sensors, onDragEnd, onAppend, onRename, appendLoading, renameLoading, remainingSlots }: BundleCardProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleValue, setTitleValue] = React.useState(bundle.title || "Untitled Bundle");

  React.useEffect(() => {
    setTitleValue(bundle.title || "Untitled Bundle");
  }, [bundle.title]);

  const handleChooseFiles = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    if (!selected.length) return;
    onAppend(bundle, selected);
    event.currentTarget.value = "";
  };

  const handleSaveTitle = async () => {
    const next = titleValue.trim();
    if (!next || next === (bundle.title || "Untitled Bundle")) {
      setEditingTitle(false);
      return;
    }
    await onRename(bundle.slug, next);
    setEditingTitle(false);
  };

  return (
    <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                className="px-2 py-1 rounded-md bg-zinc-950 border border-zinc-700 text-xs text-zinc-100"
                maxLength={120}
              />
              <button
                onClick={handleSaveTitle}
                disabled={renameLoading}
                className="text-[11px] text-emerald-300 hover:text-emerald-200 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => { setEditingTitle(false); setTitleValue(bundle.title || "Untitled Bundle"); }}
                className="text-[11px] text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-zinc-100">{bundle.title || "Untitled Bundle"}</p>
              <button
                onClick={() => setEditingTitle(true)}
                className="text-[11px] text-zinc-400 hover:text-zinc-200"
              >
                Edit
              </button>
            </div>
          )}
          <p className="text-[11px] text-zinc-500 font-mono">{bundle.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleChooseFiles}
            disabled={appendLoading || remainingSlots <= 0}
            className="px-2.5 py-1.5 rounded-lg border border-[#ff7a18]/30 text-[#ffb347] text-[11px] hover:text-white hover:border-[#ffb347]/60 disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            {appendLoading ? "Adding..." : "Add Files"}
          </button>
          <Link href={`/b/${bundle.slug}`} className="text-xs text-indigo-400 hover:text-indigo-300">
            View Bundle
          </Link>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple={remainingSlots > 1}
        onChange={handleFilesSelected}
      />
      <p className="text-[11px] text-zinc-500 mb-3">
        {remainingSlots > 0 ? `${remainingSlots} slot${remainingSlots > 1 ? "s" : ""} remaining` : "Bundle is at plan limit"}
      </p>

      {bundle.files.length === 0 ? (
        <p className="text-xs text-zinc-500">This bundle is empty.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event: DragEndEvent) => onDragEnd(bundle.slug, event)}
        >
          <SortableContext
            items={bundle.files.map((f) => f.slug)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {bundle.files.map((file) => (
                <BundleFileRow key={file.id} file={file} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

interface BundleFileRowProps {
  file: BundleFile;
}

function BundleFileRow({ file }: BundleFileRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: file.slug });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return "—";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between bg-zinc-950/60 border border-zinc-900 rounded-xl px-3 py-2 text-xs text-zinc-300"
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center gap-2">
        <MoveVertical className="w-3.5 h-3.5 text-zinc-500" />
        <span className="font-mono truncate max-w-[180px]">{file.slug}</span>
      </div>
      <span className="text-[11px] text-zinc-500">{formatBytes(file.file_size)}</span>
    </div>
  );
}

interface BundleFile {
  id: string;
  slug: string;
  file_type: string | null;
  file_size: number | null;
  position: number | null;
}

interface Bundle {
  id: string;
  slug: string;
  title: string | null;
  created_at: string;
  files: BundleFile[];
}

interface BillingSummary {
  profile: {
    tier: TierName;
    subscription_status: string;
    plan_expires_at: string | null;
  };
  links: Array<{
    link_id: string;
    plan: TierName;
    status: string;
    amount: number;
    currency: string;
    created_at: string;
    short_url?: string | null;
    checkout_url?: string | null;
  }>;
}

interface BundleQueryResult {
  id: string;
  slug: string;
  title: string | null;
  created_at: string;
  uploads: BundleFile[] | null;
}

export default function DashboardPage() {
  const { user, session, profile, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pinModal, setPinModal] = useState<{ slug: string; action: "set" | "change" } | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [expiryModal, setExpiryModal] = useState<string | null>(null);
  const [bundleSaving, setBundleSaving] = useState<string | null>(null);
  const [bundleAppending, setBundleAppending] = useState<string | null>(null);
  const [bundleRenaming, setBundleRenaming] = useState<string | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const currentTier: TierName =
    profile?.tier === "free" || profile?.tier === "pro" || profile?.tier === "ultimate" ? profile.tier : "free";
  const bundleFileLimit = TIER_LIMITS[currentTier].maxBundleFiles;
  const freeStorageCap = TIER_LIMITS.free.maxStorage;
  const usedStorage = Math.max(0, profile?.storage_used || 0);
  const usagePercent = Math.min(100, freeStorageCap > 0 ? (usedStorage / freeStorageCap) * 100 : 0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  useEffect(() => {
    if (session?.access_token) {
      fetchBilling();
    }
  }, [session?.access_token]);

  async function fetchData() {
    setLoading(true);
    const [uploadsResp, bundlesResp] = await Promise.all([
      supabase
        .from("uploads")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("bundles")
        .select("id, slug, title, created_at, uploads(id, slug, file_type, file_size, position)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .order("position", { foreignTable: "uploads", ascending: true }),
    ]);

    if (!uploadsResp.error && uploadsResp.data) {
      setUploads(uploadsResp.data);
    }

    if (!bundlesResp.error && bundlesResp.data) {
      const normalized = (bundlesResp.data as BundleQueryResult[]).map((bundle) => ({
        id: bundle.id,
        slug: bundle.slug,
        title: bundle.title,
        created_at: bundle.created_at,
        files: (bundle.uploads || [])
          .sort((a: BundleFile, b: BundleFile) => (a.position ?? 0) - (b.position ?? 0)),
      }));
      setBundles(normalized);
    }

    setLoading(false);
  }

  async function fetchBilling() {
    if (!session?.access_token) return;
    try {
      const res = await fetch(`${API_URL}/api/billing/summary`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setBilling(data);
      }
    } catch {
      // no-op
    }
  }

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
      await fetchData();
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
      await fetchData();
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
      await fetchData();
    } catch (e) { /* ignore */ }
    setExpiryModal(null);
    setActionLoading(null);
  };

  const persistBundleOrder = async (bundleSlug: string, order: string[]) => {
    if (!session?.access_token) return;
    setBundleSaving(bundleSlug);
    setBundleError(null);
    try {
      const res = await fetch(`${API_URL}/api/bundles/${encodeURIComponent(bundleSlug)}/reorder`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ order }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save order");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save bundle order";
      setBundleError(message);
      await fetchData();
    } finally {
      setBundleSaving(null);
    }
  };

  const handleBundleDragEnd = (bundleSlug: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setBundles((prev) => prev.map((bundle) => {
      if (bundle.slug !== bundleSlug) return bundle;
      const oldIndex = bundle.files.findIndex((f) => f.slug === active.id);
      const newIndex = bundle.files.findIndex((f) => f.slug === over.id);
      if (oldIndex === -1 || newIndex === -1) return bundle;
      const reordered = arrayMove(bundle.files, oldIndex, newIndex).map((file: BundleFile, idx: number) => ({
        ...file,
        position: idx,
      }));
      persistBundleOrder(bundle.slug, reordered.map((file: BundleFile) => file.slug));
      return { ...bundle, files: reordered };
    }));
  };

  const uploadFilesToPresignedUrls = async (
    fileBatch: File[],
    uploadsSigned: { slug: string; uploadUrl: string }[],
  ) => {
    for (let i = 0; i < uploadsSigned.length; i++) {
      const file = fileBatch[i];
      const uploadUrl = uploadsSigned[i].uploadUrl;
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Failed to upload ${file.name}`);
      }
    }
  };

  const handleAppendToBundle = async (bundle: Bundle, selectedFiles: File[]) => {
    if (!user || !session?.access_token) return;
    const validFiles = selectedFiles.filter((f) => f.size > 0);
    if (!validFiles.length) {
      setBundleError("No valid files selected.");
      return;
    }

    const remainingSlots = Math.max(bundleFileLimit - bundle.files.length, 0);
    if (remainingSlots <= 0) {
      setBundleError(`This bundle reached your ${bundleFileLimit}-file plan limit.`);
      return;
    }

    const filesToUpload = validFiles.slice(0, remainingSlots);
    setBundleAppending(bundle.slug);
    setBundleError(null);
    try {
      const signRes = await fetch(`${API_URL}/api/sign-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "bundle",
          user_id: user.id,
          bundle_slug: bundle.slug,
          files: filesToUpload.map((f) => ({ name: f.name, type: f.type, size: f.size })),
        }),
      });
      const signData = await signRes.json().catch(() => null);
      if (!signRes.ok || !signData?.uploads) {
        throw new Error(signData?.error || "Failed to prepare bundle upload");
      }
      const uploadsSigned = signData.uploads as { slug: string; uploadUrl: string }[];
      await uploadFilesToPresignedUrls(filesToUpload, uploadsSigned);

      const completeRes = await fetch(`${API_URL}/api/complete-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "bundle",
          bundle: {
            slug: bundle.slug,
            user_id: user.id,
            title: bundle.title || undefined,
          },
          files: uploadsSigned.map((u, index) => ({
            slug: u.slug,
            file_type: filesToUpload[index].type,
            file_size: filesToUpload[index].size,
          })),
        }),
      });
      const completeData = await completeRes.json().catch(() => null);
      if (!completeRes.ok || !completeData?.success) {
        throw new Error(completeData?.error || "Failed to finalize bundle updates");
      }
      await fetchData();
    } catch (err: unknown) {
      setBundleError(err instanceof Error ? err.message : "Failed to append files");
    } finally {
      setBundleAppending(null);
    }
  };

  const handleRenameBundle = async (bundleSlug: string, title: string) => {
    if (!session?.access_token) return;
    setBundleRenaming(bundleSlug);
    setBundleError(null);
    try {
      const res = await fetch(`${API_URL}/api/bundles/${encodeURIComponent(bundleSlug)}/title`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to rename bundle");
      }
      await fetchData();
    } catch (err: unknown) {
      setBundleError(err instanceof Error ? err.message : "Failed to rename bundle");
    } finally {
      setBundleRenaming(null);
    }
  };

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${API_URL}/${slug}`);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  };

  const getFileIcon = (type: string | null) => {
    if (!type) return <File className="w-4 h-4" />;
    if (type.startsWith("image/")) return <ImageIcon className="w-4 h-4" />;
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
  const qrUrlForSlug = (slug: string) => `${API_URL}/api/qr/${encodeURIComponent(slug)}`;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex flex-col min-h-screen bg-[#050205] text-[#f7f4ef] font-sans">
      <div className="absolute top-[-20%] left-[-10%] w-[640px] h-[640px] rounded-full bg-[#ff7a18]/10 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between border-b border-[#ff7a18]/25 z-10">
        <Link href="/" className="flex items-center gap-3">
          <NextImage
            src="/brand-symbol.jpg"
            alt="Blnq symbol"
            width={42}
            height={42}
            className="rounded-2xl border border-[#ff7a18]/40 shadow-[0_0_25px_rgba(255,122,24,0.35)]"
          />
          <NextImage
            src="/brand-logo.jpg"
            alt="Blnq logo"
            width={120}
            height={46}
            className="h-9 w-auto object-contain"
          />
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#ffb347]/90 hidden sm:block font-mono">{user.email}</span>
          <button
            onClick={() => { signOut(); router.push("/"); }}
            className="p-2 rounded-lg bg-[#1a120e]/70 hover:bg-[#1a120e] border border-[#ff7a18]/25 hover:border-[#ffb347]/50 text-[#ffb347] hover:text-white transition-all cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-8 z-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#ffb347]/70">Dashboard</p>
            <h1 className="text-2xl font-bold text-[#f7f4ef]">My Uploads</h1>
          </div>
          <Link
            href="/"
            className="text-xs text-[#ffb347] hover:text-[#ffd65b] flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> Upload New
          </Link>
        </div>

        <section className="mb-6 rounded-2xl border border-[#ff7a18]/25 bg-[#0a0308]/65 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[#ffb347]/70">Storage</p>
              <p className="text-sm text-zinc-300">
                {formatBytes(usedStorage)} / {currentTier === "free" ? formatBytes(freeStorageCap) : "Unlimited"}
              </p>
            </div>
            {currentTier === "free" && (
              <Link href="/plans" className="text-xs px-3 py-2 rounded-lg border border-[#ff7a18]/35 text-[#ffb347] hover:text-[#ffd65b]">
                Upgrade
              </Link>
            )}
          </div>
          <div className="mt-3 h-2 rounded-full bg-black/35 border border-[#ff7a18]/20 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#ff7a18] to-[#ffb347]" style={{ width: `${usagePercent}%` }} />
          </div>
          {currentTier === "free" && usagePercent >= 80 && (
            <p className="text-[11px] text-[#ffd65b] mt-2">You are above 80% of free storage capacity.</p>
          )}
        </section>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-[#ffb347]" />
          </div>
        ) : uploads.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[#ffb347]/70 text-sm">No uploads yet.</p>
            <Link href="/" className="text-[#ff7a18] text-xs mt-2 inline-block hover:text-[#ffd65b]">Upload your first file</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {uploads.map((upload) => (
              <div
                key={upload.id}
                className="bg-[#0a0308]/70 border border-[#ff7a18]/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 shadow-[0_15px_40px_rgba(0,0,0,0.35)]"
              >
                {/* File info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-lg bg-[#1a120e] border border-[#ff7a18]/25 text-[#ffb347]">
                    {getFileIcon(upload.file_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-mono text-[#f7f4ef] truncate">{upload.slug}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-[#ffb347]/60">
                      <span>{formatBytes(upload.file_size)}</span>
                      <span>{upload.file_type?.split("/")[1] || "file"}</span>
                      <span>{formatDate(upload.created_at)}</span>
                      {upload.password_hash && <span className="text-[#ffd65b] flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" /> PIN</span>}
                      {upload.expires_at && (
                        <span className="text-[#7dd3fc] flex items-center gap-0.5">
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
                        : "bg-[#1a120e] border-[#ff7a18]/20 hover:border-[#ffb347]/40 text-[#ffb347] hover:text-white"
                    }`}
                    title="Copy Link"
                  >
                    {copied === upload.slug ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <a
                    href={qrUrlForSlug(upload.slug)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-[#1a120e] border border-[#ff7a18]/20 hover:border-[#ffb347]/40 text-[#ffb347] hover:text-white transition-all"
                    title="Open QR"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={`${API_URL}/${upload.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-[#1a120e] border border-[#ff7a18]/20 hover:border-[#ffb347]/40 text-[#ffb347] hover:text-white transition-all"
                    title="Open File"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => upload.password_hash ? handleRemovePin(upload.slug) : setPinModal({ slug: upload.slug, action: "set" })}
                    disabled={actionLoading === upload.slug}
                    className="p-2 rounded-lg bg-[#1a120e] border border-[#ff7a18]/20 hover:border-[#ffd65b]/40 text-[#ffb347] hover:text-[#ffd65b] transition-all cursor-pointer disabled:opacity-50"
                    title={upload.password_hash ? "Remove PIN" : "Set PIN"}
                  >
                    {upload.password_hash ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => setExpiryModal(upload.slug)}
                    disabled={actionLoading === upload.slug}
                    className="p-2 rounded-lg bg-[#1a120e] border border-[#ff7a18]/20 hover:border-[#7dd3fc]/50 text-[#ffb347] hover:text-[#7dd3fc] transition-all cursor-pointer disabled:opacity-50"
                    title="Set Expiry"
                  >
                    <Clock className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(upload.slug)}
                    disabled={actionLoading === upload.slug}
                    className="p-2 rounded-lg bg-[#1a120e] border border-[#ff7a18]/20 hover:border-red-500/60 text-[#ffb347] hover:text-red-300 transition-all cursor-pointer disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bundles Section */}
        <section className="mt-10 rounded-2xl border border-[#ff7a18]/25 bg-[#0a0308]/65 p-5">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <h2 className="text-xl font-semibold text-[#f7f4ef]">Billing</h2>
              <p className="text-xs text-[#ffb347]/70">Rampex-powered subscription status and payment history.</p>
            </div>
            <Link href="/plans" className="text-xs px-3 py-2 rounded-xl border border-[#ff7a18]/30 text-[#ffb347] hover:text-[#ffd65b]">
              Manage Plan
            </Link>
          </div>
          <p className="text-sm text-zinc-300">
            Current:{" "}
            <span className="text-[#ffd65b] font-semibold">
              {PLAN_DEFINITIONS.find((p) => p.id === billing?.profile?.tier)?.label || "Blnq Spark"}
            </span>
            {" • "}
            <span className="uppercase text-[11px] tracking-[0.2em] text-zinc-400">{billing?.profile?.subscription_status || "inactive"}</span>
          </p>
          {billing?.profile?.plan_expires_at && (
            <p className="text-xs text-zinc-400 mt-1">
              Renews {new Date(billing.profile.plan_expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          )}
          <div className="mt-4 space-y-2">
            {(billing?.links || []).slice(0, 3).map((link) => (
              <div key={link.link_id} className="flex items-center justify-between rounded-xl bg-black/20 border border-white/10 px-3 py-2">
                <div>
                  <p className="text-xs text-zinc-200">{link.plan.toUpperCase()} • ${Number(link.amount || 0).toFixed(2)} {link.currency || "USD"}</p>
                  <p className="text-[11px] text-zinc-500">{new Date(link.created_at).toLocaleString("en-US")}</p>
                </div>
                <span className="text-[11px] uppercase tracking-[0.2em] text-[#ffb347]">{link.status || "pending"}</span>
              </div>
            ))}
            {!billing?.links?.length && (
              <p className="text-xs text-zinc-500">No recent payment links yet.</p>
            )}
          </div>
        </section>

        {/* Bundles Section */}
        <section className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-[#f7f4ef]">Bundles</h2>
              <p className="text-xs text-[#ffb347]/70">Drag files to reorder gallery presentation.</p>
              <p className="text-[11px] text-zinc-500 mt-1">Plan limit: {bundleFileLimit} files per bundle.</p>
            </div>
            {bundleSaving && (
              <span className="text-[11px] text-[#ffd65b] flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Saving…
              </span>
            )}
          </div>

          {bundleError && (
            <p className="text-xs text-red-400 mb-3">{bundleError}</p>
          )}

          {bundles.length === 0 ? (
            <p className="text-sm text-zinc-500">No bundles yet. Create one from the uploader when selecting multiple files.</p>
          ) : (
            <div className="space-y-3">
              {bundles.map((bundle) => (
                <BundleCard
                  key={bundle.id}
                  bundle={bundle}
                  sensors={sensors}
                  onDragEnd={handleBundleDragEnd}
                  onAppend={handleAppendToBundle}
                  onRename={handleRenameBundle}
                  appendLoading={bundleAppending === bundle.slug}
                  renameLoading={bundleRenaming === bundle.slug}
                  remainingSlots={Math.max(bundleFileLimit - bundle.files.length, 0)}
                />
              ))}
            </div>
          )}
        </section>
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
