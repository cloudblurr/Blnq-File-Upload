"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  UploadCloud, 
  Copy, 
  Check, 
  File, 
  Settings, 
  AlertTriangle, 
  RefreshCw, 
  Link as LinkIcon, 
  ExternalLink,
  ChevronRight,
  Lock,
  Layers,
  User,
  LogIn
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";

const DEFAULT_API_URL = "https://blnq.click";

export default function Home() {
  const { user } = useAuth();
  const [dragActive, setDragActive] = useState(false);
  const [uploadMode, setUploadMode] = useState<"local" | "remote">("local");
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [resultUrl, setResultUrl] = useState<string>("");
  const [resultFilename, setResultFilename] = useState<string>("");
  const [resultSize, setResultSize] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [resultType, setResultType] = useState<"file" | "bundle">("file");
  
  // Bundle mode
  const [bundleMode, setBundleMode] = useState(false);
  const [bundleTitle, setBundleTitle] = useState("");
  
  // PIN protection
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinValue, setPinValue] = useState("");
  
  // Expiry
  const [expiresIn, setExpiresIn] = useState<string>("");
  
  // Custom API endpoint settings
  const [apiUrl, setApiUrl] = useState<string>(DEFAULT_API_URL);
  const [showSettings, setShowSettings] = useState(false);
  const [tempApiUrl, setTempApiUrl] = useState<string>("");

  // Remote upload mode
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteFilename, setRemoteFilename] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const remoteAbortRef = useRef<AbortController | null>(null);

  // Load customized API endpoint from localStorage if exists
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedApi = localStorage.getItem("blnq_api_url");
      if (savedApi) {
        setApiUrl(savedApi);
        setTempApiUrl(savedApi);
      } else {
        // Find if environment variable is configured
        const envApi = process.env.NEXT_PUBLIC_API_URL;
        if (envApi) {
          setApiUrl(envApi);
          setTempApiUrl(envApi);
        } else {
          setTempApiUrl(DEFAULT_API_URL);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (uploadMode === "remote") {
      setBundleMode(false);
      setFile(null);
      setFiles([]);
    }
  }, [uploadMode]);

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    let formattedUrl = tempApiUrl.trim();
    if (formattedUrl.endsWith("/")) {
      formattedUrl = formattedUrl.slice(0, -1);
    }
    setApiUrl(formattedUrl);
    localStorage.setItem("blnq_api_url", formattedUrl);
    setShowSettings(false);
  };

  const uploadRemoteUrl = async () => {
    if (!remoteUrl.trim()) return;

    setUploadStatus("uploading");
    setUploadProgress(15);
    setErrorMessage("");
    setResultUrl("");
    setResultFilename("");
    setResultSize(null);
    setResultType("file");

    const controller = new AbortController();
    remoteAbortRef.current = controller;

    try {
      const res = await fetch(`${apiUrl}/api/remote-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: remoteUrl.trim(),
          filename: remoteFilename.trim() || undefined,
          user_id: user?.id,
          pin: pinEnabled ? pinValue : undefined,
          expires_in: expiresIn || undefined,
        }),
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Remote upload failed");
      }

      setResultUrl(data.url);
      setResultFilename(data.filename || data.key);
      setResultSize(typeof data.file_size === "number" ? data.file_size : null);
      setUploadProgress(100);
      setUploadStatus("success");
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setErrorMessage("Remote upload cancelled");
      } else {
        setErrorMessage(err?.message || "Remote upload failed");
      }
      setUploadStatus("error");
    } finally {
      remoteAbortRef.current = null;
    }
  };

  const resetSettings = () => {
    setApiUrl(DEFAULT_API_URL);
    setTempApiUrl(DEFAULT_API_URL);
    localStorage.removeItem("blnq_api_url");
    setShowSettings(false);
  };

  const handleDrag = (e: React.DragEvent) => {
    if (uploadMode !== "local") return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (uploadMode !== "local") return;
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (bundleMode) {
        const droppedFiles = Array.from(e.dataTransfer.files).slice(0, 20);
        handleFilesSelected(droppedFiles);
      } else {
        handleFileSelected(e.dataTransfer.files[0]);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (uploadMode !== "local") return;
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      if (bundleMode) {
        const selectedFiles = Array.from(e.target.files).slice(0, 20);
        handleFilesSelected(selectedFiles);
      } else {
        handleFileSelected(e.target.files[0]);
      }
    }
  };

  const handleFileSelected = (selectedFile: File) => {
    if (selectedFile.size === 0) {
      setErrorMessage("Cannot upload an empty file.");
      setUploadStatus("error");
      return;
    }
    setFile(selectedFile);
    setFiles([]);
    setUploadProgress(0);
    setUploadStatus("idle");
    setResultUrl("");
    setErrorMessage("");
  };

  const handleFilesSelected = (selectedFiles: File[]) => {
    const validFiles = selectedFiles.filter(f => f.size > 0);
    if (validFiles.length === 0) {
      setErrorMessage("No valid files selected.");
      setUploadStatus("error");
      return;
    }
    setFiles(validFiles);
    setFile(null);
    setUploadProgress(0);
    setUploadStatus("idle");
    setResultUrl("");
    setErrorMessage("");
  };

  const uploadFile = async () => {
    const fileBatch = bundleMode ? files : file ? [file] : [];
    if (!fileBatch.length) return;

    setUploadStatus("uploading");
    setUploadProgress(0);
    setErrorMessage("");
    setResultUrl("");
    setResultFilename("");
    setResultType(bundleMode ? "bundle" : "file");
    setResultSize(null);

    try {
      const signPayload = {
        mode: bundleMode ? "bundle" : "single",
        files: fileBatch.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      };

      const signRes = await fetch(`${apiUrl}/api/sign-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signPayload),
      });

      if (!signRes.ok) {
        const err = await signRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to request upload slots");
      }

      const signData = await signRes.json();
      const uploads: { slug: string; uploadUrl: string }[] = signData.uploads;
      const bundleSlug: string | null = signData.bundle_slug;

      if (bundleMode && !bundleSlug) {
        throw new Error("Bundle slug missing from sign-upload response");
      }

      await uploadToPresignedUrls(fileBatch, uploads);

      const completePayload = bundleMode
        ? {
            mode: "bundle",
            bundle: {
              slug: bundleSlug,
              title: bundleTitle || "Untitled Bundle",
              user_id: user?.id,
              pin: pinEnabled ? pinValue : undefined,
            },
            files: uploads.map((upload, index) => ({
              slug: upload.slug,
              file_type: fileBatch[index].type,
              file_size: fileBatch[index].size,
            })),
          }
        : {
            mode: "single",
            upload: {
              slug: uploads[0].slug,
              file_type: fileBatch[0].type,
              file_size: fileBatch[0].size,
              user_id: user?.id,
              pin: pinEnabled ? pinValue : undefined,
              expires_in: expiresIn || undefined,
            },
          };

      const completeRes = await fetch(`${apiUrl}/api/complete-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completePayload),
      });

      const completeData = await completeRes.json().catch(() => ({}));
      if (!completeRes.ok || !completeData.success) {
        throw new Error(completeData.error || "Failed to finalize upload");
      }

      if (bundleMode) {
        const slug = completeData.bundle_slug;
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const shareUrl = slug ? `${base}/b/${slug}` : "";
        setResultUrl(shareUrl);
        setResultFilename(slug);
        setResultType("bundle");
      } else {
        setResultUrl(completeData.url);
        setResultFilename(completeData.filename || completeData.key);
        setResultType("file");
        setResultSize(fileBatch[0]?.size ?? null);
      }

      setUploadStatus("success");
    } catch (err: any) {
      cancelUpload();
      setErrorMessage(err?.message || "Upload failed");
      setUploadStatus("error");
    }
  };

  const uploadToPresignedUrls = async (fileBatch: File[], uploads: { slug: string; uploadUrl: string }[]) => {
    const totalBytes = fileBatch.reduce((sum, f) => sum + f.size, 0);
    let uploadedBytes = 0;

    for (let i = 0; i < uploads.length; i++) {
      const file = fileBatch[i];
      const { uploadUrl } = uploads[i];

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const percent = Math.round(((uploadedBytes + event.loaded) / totalBytes) * 100);
            setUploadProgress(percent);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            uploadedBytes += file.size;
            resolve();
          } else {
            reject(new Error(`Failed to upload chunk (${xhr.status})`));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Network error while uploading")));
        xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
        xhr.send(file);
      });
    }
  };

  const cancelUpload = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
    }
    if (remoteAbortRef.current) {
      remoteAbortRef.current.abort();
    }
  };

  const copyToClipboard = () => {
    if (!resultUrl) return;
    navigator.clipboard.writeText(resultUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const resetUploader = () => {
    setFile(null);
    setFiles([]);
    setUploadProgress(0);
    setUploadStatus("idle");
    setResultUrl("");
    setResultFilename("");
    setResultType("file");
    setResultSize(null);
    setErrorMessage("");
    setPinEnabled(false);
    setPinValue("");
    setExpiresIn("");
    setBundleTitle("");
    setRemoteUrl("");
    setRemoteFilename("");
  };

  const pinExpiryControls = (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setPinEnabled(!pinEnabled)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
            pinEnabled
              ? "bg-[#ff7a18]/15 border-[#ffd65b]/40 text-[#ffd65b]"
              : "bg-[#050205] border-[#ff7a18]/25 text-[#ffb347]/70 hover:text-[#f7f4ef] hover:border-[#ffb347]/50"
          }`}
        >
          <Lock className="w-3 h-3" />
          {pinEnabled ? "PIN On" : "Add PIN"}
        </button>
        {!bundleMode && (
          <select
            value={expiresIn}
            onChange={(e) => setExpiresIn(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[#050205] border border-[#ff7a18]/25 text-[#ffb347]/70 outline-none cursor-pointer hover:border-[#ffb347]/50 transition-all"
          >
            <option value="">No Expiry</option>
            <option value="1h">1 Hour</option>
            <option value="24h">24 Hours</option>
            <option value="7d">7 Days</option>
          </select>
        )}
      </div>

      {pinEnabled && (
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          minLength={4}
          maxLength={8}
          value={pinValue}
          onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="Enter 4-8 digit PIN"
          className="w-full px-3 py-2 rounded-lg bg-[#050205] border border-[#ff7a18]/25 focus:border-[#ffd65b]/60 outline-none text-xs text-[#f7f4ef] font-mono text-center tracking-widest transition-all"
        />
      )}
    </>
  );

  const successSize = resultSize ?? (file && !bundleMode ? file.size : null);
  const uploadingLabel = uploadMode === "remote"
    ? "Fetching remote file..."
    : bundleMode
      ? "Uploading bundle"
      : "Uploading file";
  const uploadingName = uploadMode === "remote"
    ? remoteFilename || remoteUrl
    : bundleMode && files.length
      ? `${files.length} file${files.length > 1 ? "s" : ""}`
      : file?.name;

  return (
    <div className="flex flex-col min-h-screen text-[#f7f4ef] font-sans selection:bg-[#ff7a18]/40 selection:text-white overflow-hidden relative">
      {/* Background gradients for design depth */}
      <div className="absolute top-[-20%] left-[-10%] w-[620px] h-[620px] rounded-full bg-[#ff7a18]/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-8%] w-[540px] h-[540px] rounded-full bg-[#ffb347]/15 blur-[130px] pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between border-b border-[#ff7a18]/25 z-10">
        <div className="flex items-center gap-3">
          <Image
            src="/blnq0.jpg"
            alt="Blnq Sigil"
            width={48}
            height={48}
            className="rounded-2xl border border-[#ff7a18]/40 shadow-[0_0_25px_rgba(255,122,24,0.35)]"
            priority
          />
          <Image
            src="/logofull.png"
            alt="Blnq wordmark"
            width={140}
            height={48}
            className="h-10 w-auto object-contain drop-shadow-[0_12px_30px_rgba(0,0,0,0.45)]"
            priority
          />
          <span className="hidden sm:block text-[11px] uppercase tracking-[0.32em] text-[#ffb347]">
            blnq.click
          </span>
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <Link
              href="/dashboard"
              className="p-2 rounded-lg bg-[#1a120e]/80 hover:bg-[#1a120e] border border-[#ff7a18]/30 hover:border-[#ffb347]/60 text-[#ffb347] hover:text-white transition-all"
              title="Dashboard"
            >
              <User className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              href="/login"
              className="p-2 rounded-lg bg-[#1a120e]/80 hover:bg-[#1a120e] border border-[#ff7a18]/30 hover:border-[#ffb347]/60 text-[#ffb347] hover:text-white transition-all"
              title="Sign In"
            >
              <LogIn className="w-4 h-4" />
            </Link>
          )}
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg bg-[#1a120e]/80 hover:bg-[#1a120e] border border-[#ff7a18]/30 hover:border-[#ffb347]/60 text-[#ffb347] hover:text-white transition-all cursor-pointer"
            title="API Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-2xl mx-auto w-full z-10">
        
        {/* Title & Slogan */}
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-[0.4em] text-[#ffb347]/70 mb-3">Live at blnq.click</p>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-3 bg-gradient-to-r from-[#ff7a18] via-[#ffb347] to-[#ffd65b] bg-clip-text text-transparent">
            Beam gorgeous, private drops in seconds.
          </h1>
        </div>

        {/* Settings panel override overlay */}
        {showSettings && (
          <div className="w-full bg-[#12060b]/90 border border-[#ff7a18]/30 rounded-2xl p-5 mb-6 shadow-[0_25px_60px_rgba(0,0,0,0.55)] animate-in fade-in duration-200">
            <h3 className="text-sm font-semibold mb-3 flex items-center text-[#f7f4ef]">
              <Settings className="w-4 h-4 mr-1.5 text-[#ffb347]" />
              API Settings
            </h3>
            <form onSubmit={saveSettings} className="space-y-3.5">
              <div>
                <label className="block text-xs text-[#ffb347]/80 mb-1.5 font-medium">
                  Cloudflare Worker Endpoint URL:
                </label>
                <input 
                  type="url"
                  required
                  placeholder="https://blnq.click"
                  value={tempApiUrl}
                  onChange={(e) => setTempApiUrl(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-[#050205] border border-[#ff7a18]/25 focus:border-[#ffb347]/60 focus:ring-1 focus:ring-[#ffb347]/40 outline-none text-sm text-[#f7f4ef] transition-all font-mono"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-1.5 px-3 rounded-lg bg-gradient-to-r from-[#ff7a18] to-[#ffb347] hover:from-[#ff8c2f] hover:to-[#ffd65b] text-[#1a120e] font-semibold text-xs transition-colors cursor-pointer shadow-[0_10px_25px_rgba(255,122,24,0.35)]"
                >
                  Save Endpoint
                </button>
                <button
                  type="button"
                  onClick={resetSettings}
                  className="py-1.5 px-3 rounded-lg bg-[#1a120e] border border-[#ff7a18]/20 hover:border-[#ffb347]/40 text-[#ffb347] text-xs transition-colors cursor-pointer"
                >
                  Reset Default
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTempApiUrl(apiUrl);
                    setShowSettings(false);
                  }}
                  className="py-1.5 px-3 rounded-lg bg-transparent border border-[#ff7a18]/20 hover:border-[#ffb347]/40 text-[#ffb347] text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              </form>
            <div className="mt-3 pt-3 border-t border-zinc-800/60 text-[10px] text-zinc-500 flex justify-between">
              <span>Active Endpoint:</span>
              <span className="font-mono text-[9px] text-zinc-400 break-all max-w-[200px] text-right">
                {apiUrl}
              </span>
            </div>
          </div>
        )}

        {/* Uploader Card */}
        <div className="w-full bg-[#0a0308]/80 border border-[#ff7a18]/25 rounded-3xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl relative">
          
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleChange}
            className="hidden"
            multiple={bundleMode}
          />

          {/* Upload Mode Toggle */}
          {uploadStatus === "idle" && (
            <div className="mb-4 grid grid-cols-2 gap-2 text-xs font-semibold">
              <button
                onClick={() => setUploadMode("local")}
                className={`py-2 rounded-xl border transition-all cursor-pointer ${
                  uploadMode === "local"
                    ? "bg-[#ff7a18]/15 border-[#ffb347]/50 text-[#ffb347]"
                    : "bg-[#050205] border-[#ff7a18]/20 text-[#ffb347]/60 hover:text-[#f7f4ef]"
                }`}
              >
                Device Files
              </button>
              <button
                onClick={() => setUploadMode("remote")}
                className={`py-2 rounded-xl border transition-all cursor-pointer ${
                  uploadMode === "remote"
                    ? "bg-[#ff7a18]/15 border-[#ffb347]/50 text-[#ffb347]"
                    : "bg-[#050205] border-[#ff7a18]/20 text-[#ffb347]/60 hover:text-[#f7f4ef]"
                }`}
              >
                Remote URL
              </button>
            </div>
          )}

          {/* Bundle Toggle */}
          {uploadStatus === "idle" && uploadMode === "local" && !file && files.length === 0 && (
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={() => setBundleMode(!bundleMode)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                  bundleMode
                    ? "bg-[#ff7a18]/15 border-[#ffb347]/40 text-[#ffb347]"
                    : "bg-[#050205] border-[#ff7a18]/20 text-[#ffb347]/60 hover:text-[#f7f4ef] hover:border-[#ffb347]/40"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                {bundleMode ? "Bundle Mode (up to 20)" : "Create Bundle"}
              </button>
            </div>
          )}

          {/* IDLE STATE: No file chosen */}
          {uploadStatus === "idle" && uploadMode === "local" && !file && files.length === 0 && (
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={triggerFileInput}
              className={`w-full py-12 px-4 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
                dragActive
                  ? "border-[#ffb347] bg-[#ff7a18]/5 scale-[0.99]"
                  : "border-[#ff7a18]/30 hover:border-[#ffb347]/50 bg-[#050205]/40 hover:bg-[#0a0308]/60"
              }`}
            >
              <div className="p-4 rounded-full bg-[#050205] border border-[#ff7a18]/30 text-[#ffb347] mb-4 shadow-inner">
                <UploadCloud className="w-7 h-7" />
              </div>
              <p className="text-sm font-semibold mb-1 text-[#f7f4ef]">
                {bundleMode ? "Drop up to 20 files" : "Drag and drop your file here"}
              </p>
              <p className="text-xs text-[#ffb347]/70 mb-4">
                or click to browse from device
              </p>
              <span className="text-[10px] text-[#ffb347]/80 bg-[#1a120e]/70 py-1 px-2.5 rounded-full border border-[#ff7a18]/30">
                {bundleMode ? "Images & videos for gallery" : "Any file type supported"}
              </span>
            </div>
          )}

          {/* FILE CHOSEN: Ready to upload (single or bundle) */}
          {uploadStatus === "idle" && uploadMode === "local" && (file || files.length > 0) && (
            <div className="space-y-4">
              {file && !bundleMode && (
                <div className="p-4 bg-[#050205]/70 rounded-2xl border border-[#ff7a18]/25 flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-[#1a120e] border border-[#ff7a18]/40 text-[#ffb347]">
                    <File className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#f7f4ef] truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-xs text-[#ffb347]/70">{formatBytes(file.size)}</p>
                  </div>
                </div>
              )}

              {files.length > 0 && bundleMode && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#f7f4ef]">{files.length} file{files.length > 1 ? "s" : ""} selected</span>
                    <span className="text-[10px] text-[#ffb347]/70">{formatBytes(files.reduce((a, f) => a + f.size, 0))} total</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                    {files.map((f, i) => (
                      <div key={i} className="p-2 bg-[#050205]/60 rounded-lg border border-[#ff7a18]/20 flex items-center gap-2 text-xs">
                        <File className="w-3 h-3 text-[#ffb347] shrink-0" />
                        <span className="text-[#f7f4ef] truncate flex-1">{f.name}</span>
                        <span className="text-[#ffb347]/70 shrink-0">{formatBytes(f.size)}</span>
                      </div>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Bundle title (optional)"
                    value={bundleTitle}
                    onChange={(e) => setBundleTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#050205] border border-[#ff7a18]/25 focus:border-[#ffb347]/50 outline-none text-xs text-[#f7f4ef] transition-all"
                  />
                </div>
              )}

              {pinExpiryControls}

              <div className="flex gap-3">
                <button
                  onClick={uploadFile}
                  disabled={pinEnabled && pinValue.length < 4}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {bundleMode ? "Upload Bundle" : "Upload to Blnq"}
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={resetUploader}
                  className="py-3 px-4 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm font-medium transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              {!user && (
                <p className="text-[10px] text-zinc-600 text-center">
                  <Link href="/login" className="text-indigo-400 hover:text-indigo-300">Sign in</Link> to manage uploads from your dashboard.
                </p>
              )}
            </div>
          )}

          {/* REMOTE MODE FORM */}
          {uploadStatus === "idle" && uploadMode === "remote" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Remote File URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/file.png"
                  value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 focus:border-zinc-700 outline-none text-sm text-zinc-100"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Rename on Save (optional)</label>
                <input
                  type="text"
                  placeholder="my-file.png"
                  value={remoteFilename}
                  onChange={(e) => setRemoteFilename(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 focus:border-zinc-700 outline-none text-sm text-zinc-100"
                />
              </div>
              <p className="text-[10px] text-zinc-500">
                HTTPS only, public URLs. Private-network addresses are blocked. Files are fetched through the Worker and scanned just like direct uploads.
              </p>

              {pinExpiryControls}

              <div className="flex gap-3">
                <button
                  onClick={uploadRemoteUrl}
                  disabled={!remoteUrl.trim() || (pinEnabled && pinValue.length < 4)}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  Fetch & Upload
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={resetUploader}
                  className="py-3 px-4 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm font-medium transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* UPLOADING STATE */}
          {uploadStatus === "uploading" && (
            <div className="space-y-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
                  <span className="text-sm font-medium text-zinc-300">{uploadingLabel}</span>
                </div>
                <span className="text-sm font-mono font-bold text-zinc-100">{uploadProgress}%</span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-900">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-150 ease-out rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span className="truncate max-w-[200px]">{uploadingName || "Preparing..."}</span>
                <button 
                  onClick={cancelUpload}
                  className="text-red-400 hover:text-red-300 transition-colors font-semibold"
                >
                  Cancel upload
                </button>
              </div>
            </div>
          )}

          {/* SUCCESS STATE */}
          {uploadStatus === "success" && (
            <div className="space-y-5">
              <div className="flex flex-col items-center text-center py-2">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 shadow-lg shadow-emerald-500/5">
                  <Check className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-zinc-200">Upload Complete</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Your file has been saved securely with an obfuscated slug.
                </p>
              </div>

              {/* File details card */}
              <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/40 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 truncate pr-2">
                  <File className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span className="font-mono text-zinc-400 truncate" title={resultFilename}>
                    {resultFilename}
                  </span>
                </div>
                {file && <span className="text-zinc-500 shrink-0">{formatBytes(file.size)}</span>}
              </div>

              {/* Shareable Link Box */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-zinc-400">Share Link</label>
                <div className="flex gap-2">
                  <div className="flex-1 bg-zinc-950 border border-zinc-800/80 rounded-xl px-3.5 py-3 flex items-center justify-between overflow-hidden">
                    <span className="text-sm font-mono text-indigo-300 truncate pr-3 select-all">
                      {resultUrl}
                    </span>
                    <LinkIcon className="w-4 h-4 text-zinc-600 shrink-0" />
                  </div>
                  <button
                    onClick={copyToClipboard}
                    className={`p-3.5 rounded-xl flex items-center justify-center shrink-0 transition-all cursor-pointer border ${
                      copied 
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                        : "bg-indigo-600 hover:bg-indigo-500 border-indigo-600 hover:border-indigo-500 text-white shadow-md shadow-indigo-500/10"
                    }`}
                    title="Copy Link"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <a
                  href={resultUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 px-4 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                >
                  View File
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={resetUploader}
                  className="flex-1 py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800/80 text-zinc-300 hover:text-zinc-100 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Upload New
                </button>
              </div>
            </div>
          )}

          {/* ERROR STATE */}
          {uploadStatus === "error" && (
            <div className="space-y-4">
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-red-400">Upload Failed</h4>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    {errorMessage || "An unknown network error occurred. Please check details or settings."}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={file ? uploadFile : resetUploader}
                  className="flex-1 py-3 px-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Try Again
                </button>
                <button
                  onClick={resetUploader}
                  className="py-3 px-4 bg-zinc-950 border border-zinc-900 text-zinc-400 hover:text-zinc-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Security & privacy footer note */}
        <p className="text-[10px] text-zinc-600 text-center mt-6">
          Files are processed privately. Original names are never preserved or shared.
        </p>

      </main>

      {/* Footer */}
      <footer className="w-full text-center py-6 text-[11px] text-zinc-500 border-t border-zinc-900 z-10">
        &copy; {new Date().getFullYear()} Blnq. All signals reserved.
      </footer>
    </div>
  );
}
