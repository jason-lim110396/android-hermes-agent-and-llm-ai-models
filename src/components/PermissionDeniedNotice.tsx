'use client';

import React, { useEffect, useState } from 'react';
import { canOpenNativeAppSettings, openNativeAppSettings } from '@/utils/nativeAppSettings';

/**
 * Honest in-app fallback after a permission stays denied: names the missing
 * permission, states that Android no longer shows the dialog for it, and
 * (inside the packaged APK) offers the app's system settings page. This is
 * the state a permanently-denied permission lands in - silently failing or
 * faking success is exactly what PR #127's honesty pattern forbids.
 */
export default function PermissionDeniedNotice({
  permissionName,
  onRetry,
  onDismiss,
}: {
  permissionName: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  // Decided after mount so prerendered markup matches the first client
  // render; only the packaged APK gets the settings button.
  const [canOpenSettings, setCanOpenSettings] = useState(false);
  useEffect(() => {
    // One-shot capability probe after mount so prerendered markup matches
    // the first client render; the repo's modals use the same mount-time
    // init pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanOpenSettings(canOpenNativeAppSettings());
  }, []);

  return (
    <div className="p-3 rounded-2xl border border-rose-500/40 bg-rose-950/30 space-y-2.5">
      <p className="text-[11px] text-rose-300 font-semibold leading-snug">
        {permissionName} permission is denied. Android will not show the permission dialog
        again until you re-enable it in this app&apos;s system settings.
      </p>
      <div className="flex items-center gap-2">
        {canOpenSettings && (
          <button
            onClick={() => openNativeAppSettings()}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer transition-colors"
          >
            Open App Settings
          </button>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-bold cursor-pointer transition-colors"
          >
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="px-2 py-1.5 rounded-xl text-zinc-400 hover:text-zinc-200 text-[11px] font-bold cursor-pointer transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
