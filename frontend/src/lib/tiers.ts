export type TierName = "guest" | "free" | "pro" | "ultimate";

export interface TierLimits {
  maxFileSize: number;
  maxStorage: number;
  uploadsPerHour: number;
  maxBundles: number;
  maxBundleFiles: number;
}

export const TIER_LIMITS: Record<TierName, TierLimits> = {
  guest: { maxFileSize: 400 * 1024 * 1024, maxStorage: 0, uploadsPerHour: 3, maxBundles: 0, maxBundleFiles: 0 },
  free: { maxFileSize: 400 * 1024 * 1024, maxStorage: 5 * 1024 * 1024 * 1024, uploadsPerHour: 50, maxBundles: 3, maxBundleFiles: 10 },
  pro: { maxFileSize: 2 * 1024 * 1024 * 1024, maxStorage: Infinity, uploadsPerHour: 1000, maxBundles: Number.MAX_SAFE_INTEGER, maxBundleFiles: 30 },
  ultimate: { maxFileSize: 5 * 1024 * 1024 * 1024, maxStorage: Infinity, uploadsPerHour: 2000, maxBundles: Number.MAX_SAFE_INTEGER, maxBundleFiles: 100 },
};

export const TIER_FEATURES: Record<string, TierName[]> = {
  bundles: ["free", "pro", "ultimate"],
  pinProtection: ["pro", "ultimate"],
  customExpiry: ["pro", "ultimate"],
  scheduledDeletion: ["pro", "ultimate"],
  dashboard: ["pro", "ultimate"],
  viewCounts: ["pro", "ultimate"],
  uploadPresets: ["pro", "ultimate"],
  bulkActions: ["pro", "ultimate"],
  folderOrganization: ["pro", "ultimate"],
  duplicateDetection: ["pro", "ultimate"],
  tagsAndSearch: ["pro", "ultimate"],
  emailNotifications: ["pro", "ultimate"],
  fileVersioning: ["ultimate"],
  recycleBin: ["ultimate"],
  vanityUrls: ["ultimate"],
  apiAccess: ["ultimate"],
  webhooks: ["ultimate"],
  publicProfile: ["ultimate"],
  shareableUploadPage: ["ultimate"],
  prioritySupport: ["ultimate"],
};

export interface PlanDefinition {
  id: TierName;
  label: string;
  price: string;
  cadence: string;
  description: string;
  amountUsdCents: number;
}

export const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    id: "guest",
    label: "Free Guest",
    price: "$0",
    cadence: "Always",
    description: "No account required. 400MB uploads, 3 drops per day, no bundles.",
    amountUsdCents: 0,
  },
  {
    id: "free",
    label: "Blnq Spark",
    price: "$0",
    cadence: "Monthly",
    description: "Sign in for 400MB uploads, 50+ drops/day, up to 3 bundles, and 10 files each.",
    amountUsdCents: 0,
  },
  {
    id: "pro",
    label: "Blnq Core",
    price: "$5",
    cadence: "Monthly",
    description: "2GB uploads, unlimited bundles, 30 files per bundle, and creator-grade controls.",
    amountUsdCents: 500,
  },
  {
    id: "ultimate",
    label: "Blnq Ultimate",
    price: "$9.99",
    cadence: "Monthly",
    description: "5GB uploads, unlimited bundles, 100 files per bundle, APIs, vanity links, and support.",
    amountUsdCents: 999,
  },
];

export function tierHasFeature(tier: TierName, feature: keyof typeof TIER_FEATURES): boolean {
  return TIER_FEATURES[feature]?.includes(tier) ?? false;
}
