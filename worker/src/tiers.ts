export type TierName = "guest" | "free" | "pro" | "ultimate";

export interface TierLimits {
  maxFileSize: number;
  maxStorage: number;
  uploadsPerHour: number;
}

export interface TierFeatureMatrix {
  [feature: string]: TierName[];
}

export interface PlanDefinition {
  id: TierName | "pro_lifetime" | "ultimate_lifetime";
  label: string;
  price: string;
  billingCycle: "monthly" | "yearly" | "lifetime";
  description: string;
}

export const TIER_LIMITS: Record<TierName, TierLimits> = {
  guest: { maxFileSize: 400 * 1024 * 1024, maxStorage: 0, uploadsPerHour: 3 },
  free: { maxFileSize: 400 * 1024 * 1024, maxStorage: 5 * 1024 * 1024 * 1024, uploadsPerHour: 20 },
  pro: { maxFileSize: 2 * 1024 * 1024 * 1024, maxStorage: Infinity, uploadsPerHour: 100 },
  ultimate: { maxFileSize: 5 * 1024 * 1024 * 1024, maxStorage: Infinity, uploadsPerHour: 500 },
};

export const TIER_FEATURES: TierFeatureMatrix = {
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

export const PLAN_DEFINITIONS: PlanDefinition[] = [
  { id: "pro", label: "Pro", price: "$5/mo", billingCycle: "monthly", description: "2TB max file size, unlimited storage, 100 uploads/hour" },
  { id: "ultimate", label: "Ultimate", price: "$9.99/mo", billingCycle: "monthly", description: "5TB max file size, unlimited storage, 500 uploads/hour" },
  { id: "pro", label: "Pro Annual", price: "$40/yr", billingCycle: "yearly", description: "Save 33% when billed annually" },
  { id: "ultimate", label: "Ultimate Annual", price: "$84/yr", billingCycle: "yearly", description: "Save 30% when billed annually" },
  { id: "pro_lifetime", label: "Pro Lifetime", price: "$49 one-time", billingCycle: "lifetime", description: "Limited to 200 seats" },
  { id: "ultimate_lifetime", label: "Ultimate Lifetime", price: "$99 one-time", billingCycle: "lifetime", description: "Limited to 200 seats" },
];

export function tierIncludesFeature(tier: TierName, feature: keyof typeof TIER_FEATURES): boolean {
  return TIER_FEATURES[feature]?.includes(tier) ?? false;
}
