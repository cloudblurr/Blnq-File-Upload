"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Check, ArrowUpRight, Loader2, Shield, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { PLAN_DEFINITIONS, TIER_FEATURES, TIER_LIMITS, PlanDefinition, TierName } from "@/lib/tiers";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://www.blnq.click";

const FEATURE_MATRIX: { id: keyof typeof TIER_FEATURES; label: string; helper?: string }[] = [
  { id: "bundles", label: "Bundles & collections", helper: "Spark: 3 bundles / 10 uploads each" },
  { id: "pinProtection", label: "PIN-protected drops" },
  { id: "customExpiry", label: "Custom expiry windows" },
  { id: "scheduledDeletion", label: "Scheduled deletion" },
  { id: "uploadPresets", label: "Upload presets" },
  { id: "apiAccess", label: "API & automation hooks" },
  { id: "vanityUrls", label: "Vanity URLs" },
  { id: "prioritySupport", label: "Priority support" },
];

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes)) return "Unlimited";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[index]}`;
};

const bundleLabel = (maxBundles: number) => {
  if (!Number.isFinite(maxBundles) || maxBundles >= Number.MAX_SAFE_INTEGER) return "Unlimited bundles";
  if (maxBundles === 0) return "No bundles";
  return `${maxBundles} bundles`;
};

const bundleFileLabel = (maxBundleFiles: number) => {
  if (maxBundleFiles <= 0) return "No bundle uploads";
  if (!Number.isFinite(maxBundleFiles) || maxBundleFiles >= Number.MAX_SAFE_INTEGER) return "Unlimited uploads per bundle";
  return `${maxBundleFiles} uploads per bundle`;
};

export default function PlansPage() {
  const { user, profile } = useAuth();
  const [checkoutPlan, setCheckoutPlan] = useState<PlanDefinition | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [providerStatus, setProviderStatus] = useState<{ active: number; total: number } | null>(null);

  const currentTier: TierName = useMemo(() => {
    if (profile?.tier === "pro" || profile?.tier === "ultimate" || profile?.tier === "free") {
      return profile.tier;
    }
    return user ? "free" : "guest";
  }, [profile?.tier, user]);

  const openCheckout = (plan: PlanDefinition) => {
    setCheckoutPlan(plan);
    setEmailInput(user?.email || "");
    setCheckoutError("");
  };

  const closeCheckout = () => {
    setCheckoutPlan(null);
    setCheckoutError("");
    setCheckoutLoading(false);
  };

  const handleCheckout = async () => {
    if (!checkoutPlan) return;
    const email = emailInput.trim();
    if (!email) {
      setCheckoutError("Enter the email that should receive the Rampex receipt.");
      return;
    }
    setCheckoutLoading(true);
    setCheckoutError("");
    try {
      const res = await fetch(`${API_URL}/api/rampex/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: checkoutPlan.id, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || "Unable to start checkout right now.");
      }
      const url = data.checkout?.checkout_url || data.checkout?.payment_url || data.checkout?.redirect_url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      closeCheckout();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start checkout";
      setCheckoutError(message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const pollProviders = async () => {
    try {
      const res = await fetch(`${API_URL}/api/rampex/providers`);
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        const list = Array.isArray(data.providers) ? data.providers : [];
        setProviderStatus({ active: Number(data.active || 0), total: list.length });
      } else {
        setProviderStatus(null);
      }
    } catch {
      setProviderStatus(null);
    }
  };

  useEffect(() => {
    void (async () => {
      await pollProviders();
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[#050205] text-[#f7f4ef] relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-15%] w-[720px] h-[720px] rounded-full bg-[#ff7a18]/15 blur-[140px]" />
      <div className="absolute bottom-[-25%] right-[-10%] w-[680px] h-[680px] rounded-full bg-[#ffb347]/15 blur-[150px]" />

      <header className="relative z-10 w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between border-b border-[#ff7a18]/25">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/brand-symbol.jpg" alt="Blnq symbol" width={46} height={46} className="rounded-2xl border border-[#ff7a18]/40" />
          <Image src="/brand-logo.jpg" alt="Blnq logo" width={130} height={46} className="h-10 w-auto object-contain" />
        </Link>
        <div className="flex items-center gap-3 text-sm text-[#ffb347]">
          <Shield className="w-4 h-4" />
          <span>Current tier: {currentTier === "free" ? "Blnq Spark" : currentTier === "pro" ? "Blnq Core" : currentTier === "ultimate" ? "Blnq Ultimate" : "Guest"}</span>
        </div>
      </header>

      <main className="relative z-10 w-full max-w-6xl mx-auto px-6 py-12 space-y-14">
        <section className="text-center space-y-4">
          <p className="text-xs uppercase tracking-[0.4em] text-[#ffb347]/70">Subscription Beam</p>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight bg-gradient-to-r from-[#ff7a18] via-[#ffb347] to-[#ffd65b] bg-clip-text text-transparent">
            Choose your Blnq signal strength
          </h1>
          <p className="text-base text-zinc-300 max-w-2xl mx-auto">
            Spark is always free. Core and Ultimate unlock Rampex-powered billing with full creator workflows, automation, and priority attention.
          </p>
          <p className="text-xs text-zinc-400">
            {providerStatus
              ? `${providerStatus.active}/${providerStatus.total} payment providers are currently active.`
              : "Live provider status is temporarily unavailable. Hosted checkout fallback stays enabled."}
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-4 md:grid-cols-2">
          {PLAN_DEFINITIONS.map((plan) => {
            const limits = TIER_LIMITS[plan.id];
            const isCurrent = currentTier === plan.id;
            const isBelowCurrent =
              (currentTier === "pro" && plan.id === "free") ||
              (currentTier === "ultimate" && (plan.id === "pro" || plan.id === "free")) ||
              (currentTier !== "guest" && plan.id === "guest");
            const requiresCheckout = plan.amountUsdCents > 0;

            return (
              <div key={plan.id} className={`rounded-3xl border border-[#ff7a18]/25 bg-[#090507]/80 backdrop-blur-xl p-6 flex flex-col gap-4 ${isCurrent ? "shadow-[0_0_35px_rgba(255,122,24,0.35)]" : "shadow-[0_15px_40px_rgba(0,0,0,0.35)]"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#ffb347]/70">{plan.cadence}</p>
                    <h3 className="text-2xl font-semibold text-white">{plan.label}</h3>
                  </div>
                  {isCurrent && <span className="text-xs text-[#050205] bg-[#ffb347] px-3 py-1 rounded-full font-semibold">Current</span>}
                </div>
                <p className="text-sm text-zinc-300">{plan.description}</p>
                <div className="text-3xl font-black text-white">{plan.price}</div>
                <ul className="text-sm text-zinc-200 space-y-2">
                  <li>• {formatBytes(limits.maxFileSize)} per upload</li>
                  <li>• {limits.uploadsPerHour >= 1000 ? "Unlimited uploads" : `${limits.uploadsPerHour} uploads/hour cap`}</li>
                  <li>• {bundleLabel(limits.maxBundles)}</li>
                  <li>• {bundleFileLabel(limits.maxBundleFiles)}</li>
                </ul>
                <div className="mt-auto pt-2">
                  {requiresCheckout ? (
                    <button
                      onClick={() => openCheckout(plan)}
                      disabled={isCurrent || checkoutLoading}
                      className={`w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition ${
                        isCurrent
                          ? "bg-zinc-700 text-zinc-300 cursor-not-allowed"
                          : "bg-gradient-to-r from-[#ff7a18] to-[#ffb347] text-[#1a120e] hover:from-[#ff8c2f] hover:to-[#ffd65b]"
                      }`}
                    >
                      {isCurrent ? "Active" : "Upgrade with Rampex"}
                      {!isCurrent && <ArrowUpRight className="w-4 h-4" />}
                    </button>
                  ) : plan.id === "free" ? (
                    <Link
                      href={user ? "/dashboard" : "/login"}
                      className="w-full inline-flex items-center justify-center rounded-2xl py-3 text-sm font-semibold border border-[#ff7a18]/40 text-[#ffb347] hover:text-white"
                    >
                      {user ? "Included with your account" : "Create a free account"}
                    </Link>
                  ) : (
                    <div className="text-center text-xs text-zinc-400">Enabled automatically</div>
                  )}
                  {isBelowCurrent && !isCurrent && (
                    <p className="text-center text-[11px] text-zinc-500 mt-2">Included in your current plan</p>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-3xl border border-[#ff7a18]/25 bg-[#0c050b]/70 p-6 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-[#ffb347] mb-4">
            <Sparkles className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Feature matrix</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-400">
                  <th className="py-3">Feature</th>
                  {PLAN_DEFINITIONS.map((plan) => (
                    <th key={`head-${plan.id}`} className="py-3 text-center">{plan.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_MATRIX.map((feature) => (
                  <tr key={feature.id} className="border-t border-white/5">
                    <td className="py-4">
                      <div className="text-white font-medium">{feature.label}</div>
                      {feature.helper && <p className="text-[11px] text-zinc-500">{feature.helper}</p>}
                    </td>
                    {PLAN_DEFINITIONS.map((plan) => (
                      <td key={`${feature.id}-${plan.id}`} className="text-center">
                        {TIER_FEATURES[feature.id]?.includes(plan.id as TierName) ? (
                          <Check className="w-4 h-4 text-[#ffb347] inline-block" />
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#ff7a18]/25 bg-[#0b0508]/70 p-5">
            <h3 className="text-lg font-semibold text-white mb-3">FAQ</h3>
            <div className="space-y-3 text-sm text-zinc-300">
              <p><span className="text-[#ffb347]">How fast do upgrades apply?</span> Usually within seconds after `payment.completed` webhook delivery.</p>
              <p><span className="text-[#ffb347]">Can I downgrade later?</span> Yes, from Billing. Downgrades apply at renewal to avoid feature disruption.</p>
              <p><span className="text-[#ffb347]">Is checkout in-app branded?</span> Yes. Rampex hosted flows support branded Blnq portal experiences.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-[#ff7a18]/25 bg-[#0b0508]/70 p-5">
            <h3 className="text-lg font-semibold text-white mb-3">Compliance</h3>
            <div className="space-y-3 text-sm text-zinc-300">
              <p>Payments are processed on Rampex-hosted infrastructure with provider-level KYC and card controls.</p>
              <p>Blnq stores plan metadata and payment link IDs for billing support, audit, and fraud tracing.</p>
              <p>Need help? Reach out to support with your payment email and link ID for priority review.</p>
            </div>
          </div>
        </section>
      </main>

      {checkoutPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#0c050b] border border-[#ff7a18]/40 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-white">Checkout • {checkoutPlan.label}</h3>
              <button
                onClick={closeCheckout}
                className="text-zinc-400 hover:text-white"
                aria-label="Close checkout dialog"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-zinc-300">
              We	use Rampex.io to process card payments and settle payouts in USDC. Enter the email for your receipt and instant upgrade instructions.
            </p>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-[0.3em] text-[#ffb347]/70">Email</label>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full rounded-2xl bg-[#050205] border border-[#ff7a18]/30 px-4 py-3 text-sm focus:outline-none focus:border-[#ffb347]"
                placeholder="you@example.com"
              />
            </div>
            {checkoutError && <p className="text-sm text-red-400">{checkoutError}</p>}
            <button
              onClick={handleCheckout}
              disabled={checkoutLoading}
              className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold bg-gradient-to-r from-[#ff7a18] to-[#ffb347] text-[#1a120e] hover:from-[#ff8c2f] hover:to-[#ffd65b] disabled:opacity-60"
            >
              {checkoutLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating checkout…
                </>
              ) : (
                "Continue to secure checkout"
              )}
            </button>
            <p className="text-[11px] text-zinc-500 text-center">
              You will be redirected to a Rampex-hosted page on checkout.rampex.io. Once the payment completes, your tier updates instantly.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
