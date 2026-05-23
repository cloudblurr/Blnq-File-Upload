export type TierName = "guest" | "free" | "pro" | "ultimate";

export interface TierLimits {
  maxFileSize: number;
  maxStorage: number;
  uploadsPerHour: number;
}

export const TIER_LIMITS: Record<TierName, TierLimits> = {
  guest: { maxFileSize: 400 * 1024 * 1024, maxStorage: 0, uploadsPerHour: 3 },
  free: { maxFileSize: 400 * 1024 * 1024, maxStorage: 5 * 1024 * 1024 * 1024, uploadsPerHour: 20 },
  pro: { maxFileSize: 2 * 1024 * 1024 * 1024, maxStorage: Infinity, uploadsPerHour: 100 },
  ultimate: { maxFileSize: 5 * 1024 * 1024 * 1024, maxStorage: Infinity, uploadsPerHour: 500 },
};

export const TIER_FEATURES: Record<string, TierName[]> = {
  bundles: ["pro", "ultimate"],
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

export const PLAN_DEFINITIONS = [
  { id: "pro", label: "Pro", price: "$5", cadence: "Monthly" },
  { id: "ultimate", label: "Ultimate", price: "$9.99", cadence: "Monthly" },
  { id: "pro_yearly", label: "Pro", price: "$40", cadence: "Yearly" },
  { id: "ultimate_yearly", label: "Ultimate", price: "$84", cadence: "Yearly" },
  { id: "pro_lifetime", label: "Pro Lifetime", price: "$49", cadence: "One-time" },
  { id: "ultimate_lifetime", label: "Ultimate Lifetime", price: "$99", cadence: "One-time" },
];

export function tierHasFeature(tier: TierName, feature: keyof typeof TIER_FEATURES): boolean {
  return TIER_FEATURES[feature]?.includes(tier) ?? false;
}
