import type { PlayUpdateInfo, UpdateType } from '../../modules/play-app-update';

/**
 * Update policy, driven only by what Google Play reports (no backend, no version strings).
 *
 * Mandatory releases are marked by publishing them with an in-app update priority of at least
 * IMMEDIATE_PRIORITY (0-5, set per release through the Google Play Developer API
 * `inAppUpdatePriority`; the Play Console UI does not expose it). Everything else is offered
 * as a flexible, background download the user can postpone.
 */
export const IMMEDIATE_PRIORITY = 4;

/** Re-check on return to the foreground at most this often (launches always check). */
export const RESUME_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Delay after launch so the check never competes with the first screen render. */
export const LAUNCH_CHECK_DELAY_MS = 2500;

/** Google Play normally answers in well under a second; never wait on it indefinitely. */
export const CHECK_TIMEOUT_MS = 15_000;

export function decideUpdateType(info: PlayUpdateInfo): UpdateType | null {
  if (info.availability !== 'AVAILABLE') return null;
  if (info.priority >= IMMEDIATE_PRIORITY && info.immediateAllowed) return 'IMMEDIATE';
  if (info.flexibleAllowed) return 'FLEXIBLE';
  // Only an immediate flow is allowed but the release is not mandatory: don't force it.
  return null;
}

/** An immediate update was started earlier and interrupted (e.g. the app was closed). */
export function isInterruptedImmediateUpdate(info: PlayUpdateInfo): boolean {
  return (
    info.availability === 'IN_PROGRESS' &&
    info.installStatus !== 'PENDING' &&
    info.installStatus !== 'DOWNLOADING' &&
    info.installStatus !== 'DOWNLOADED' &&
    info.installStatus !== 'INSTALLING'
  );
}

/** Whole-percent progress, or null while Google Play has not reported a size yet. */
export function progressPercent(bytesDownloaded: number, totalBytes: number): number | null {
  if (!(totalBytes > 0)) return null;
  return Math.max(0, Math.min(100, Math.floor((bytesDownloaded / totalBytes) * 100)));
}
