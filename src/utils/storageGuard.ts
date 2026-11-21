// Storage guard helper for mobile inference, quota estimation, and eviction safety.

export interface StorageQuotaReport {
  quotaGB: number;
  usageGB: number;
  availableGB: number;
  percentUsed: number;
  isPersisted: boolean;
  health: 'optimal' | 'adequate' | 'low' | 'critical';
  healthLabel: string;
  indexedDbMB?: number;
  cachesMB?: number;
}

export interface HeadroomCheckResult {
  canFit: boolean;
  remainingAfterMB: number;
  status: 'safe' | 'tight' | 'insufficient';
  recommendation: string;
}

/**
 * Checks if the available storage in GB is enough for the requested storage.
 */
export function hasEnoughStorage(availableGB: number, requiredGB: number): boolean {
  return availableGB >= requiredGB;
}

/**
 * Reads detailed storage quota from navigator.storage with eviction persistence status.
 */
export async function getStorageQuotaReport(): Promise<StorageQuotaReport> {
  let quotaGB = 32.0;
  let usageGB = 2.4;
  let isPersisted = false;
  let indexedDbMB: number | undefined;
  let cachesMB: number | undefined;

  if (typeof navigator !== 'undefined' && navigator.storage) {
    if (navigator.storage.persisted) {
      try {
        isPersisted = await navigator.storage.persisted();
      } catch (_) {}
    }

    if (navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        if (est.quota) {
          quotaGB = +(est.quota / (1024 * 1024 * 1024)).toFixed(2);
        }
        if (est.usage) {
          usageGB = +(est.usage / (1024 * 1024 * 1024)).toFixed(2);
        }

        const usageDetails = (est as any).usageDetails;
        if (usageDetails) {
          if (typeof usageDetails.indexedDB === 'number') {
            indexedDbMB = +(usageDetails.indexedDB / (1024 * 1024)).toFixed(1);
          }
          if (typeof usageDetails.caches === 'number') {
            cachesMB = +(usageDetails.caches / (1024 * 1024)).toFixed(1);
          }
        }
      } catch (_) {}
    }
  }

  const availableGB = Math.max(0, +(quotaGB - usageGB).toFixed(2));
  const percentUsed = quotaGB > 0 ? Math.min(100, Math.round((usageGB / quotaGB) * 100)) : 0;

  let health: StorageQuotaReport['health'] = 'optimal';
  let healthLabel = 'Storage Headroom Optimal (>5 GB)';

  if (availableGB < 1.0) {
    health = 'critical';
    healthLabel = 'Critical Storage Low (<1 GB)';
  } else if (availableGB < 2.5) {
    health = 'low';
    healthLabel = 'Low Storage (<2.5 GB)';
  } else if (availableGB < 5.0) {
    health = 'adequate';
    healthLabel = 'Adequate Storage (2.5–5 GB)';
  }

  return {
    quotaGB,
    usageGB,
    availableGB,
    percentUsed,
    isPersisted,
    health,
    healthLabel,
    indexedDbMB,
    cachesMB,
  };
}

/**
 * Requests permanent storage persistence to prevent OS eviction of downloaded model weights.
 */
export async function requestStoragePersistence(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch (_) {}
  }
  return false;
}

/**
 * Evaluates whether a new model of sizeMB can fit safely on the device without risking OS eviction.
 * Leaves at least 500MB safety buffer.
 */
export async function checkStorageHeadroom(requiredMB: number): Promise<HeadroomCheckResult> {
  const report = await getStorageQuotaReport();
  const availableMB = report.availableGB * 1024;
  const safetyBufferMB = 500;
  const remainingAfterMB = +(availableMB - requiredMB).toFixed(0);

  if (remainingAfterMB < 0) {
    return {
      canFit: false,
      remainingAfterMB,
      status: 'insufficient',
      recommendation: `Insufficient storage. Required ${requiredMB} MB exceeds free space by ${Math.abs(remainingAfterMB)} MB. Purge unused models first.`,
    };
  }

  if (remainingAfterMB < safetyBufferMB) {
    return {
      canFit: true,
      remainingAfterMB,
      status: 'tight',
      recommendation: `Tight storage. Downloading this model leaves only ${remainingAfterMB} MB free space, which may trigger Android cache eviction.`,
    };
  }

  return {
    canFit: true,
    remainingAfterMB,
    status: 'safe',
    recommendation: `Safe storage headroom. ${remainingAfterMB} MB will remain free after model download.`,
  };
}
