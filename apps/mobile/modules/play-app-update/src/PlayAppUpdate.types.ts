/** Mirrors Google Play's UpdateAvailability. */
export type UpdateAvailability = 'UNKNOWN' | 'NOT_AVAILABLE' | 'AVAILABLE' | 'IN_PROGRESS';

/** Mirrors Google Play's InstallStatus. */
export type InstallStatus = 'UNKNOWN' | 'PENDING' | 'DOWNLOADING' | 'DOWNLOADED' | 'INSTALLING' | 'INSTALLED' | 'FAILED' | 'CANCELED';

export type UpdateType = 'FLEXIBLE' | 'IMMEDIATE';

/** Result of Google Play's update dialog. */
export type StartUpdateResult = 'ACCEPTED' | 'CANCELED' | 'FAILED' | 'NOT_ALLOWED';

export interface PlayUpdateInfo {
  availability: UpdateAvailability;
  installStatus: InstallStatus;
  /** versionCode of the release available on Google Play. */
  availableVersionCode: number;
  /** In-app update priority 0-5, set per release through the Play Developer API. */
  priority: number;
  /** Days since Google Play on this device learned about the update (null when unknown). */
  stalenessDays: number | null;
  flexibleAllowed: boolean;
  immediateAllowed: boolean;
  bytesDownloaded: number;
  totalBytesToDownload: number;
}

export interface InstallStateEvent {
  status: InstallStatus;
  bytesDownloaded: number;
  totalBytesToDownload: number;
  errorCode: number;
}

export type PlayAppUpdateEvents = {
  onInstallStateChange: (event: InstallStateEvent) => void;
};
