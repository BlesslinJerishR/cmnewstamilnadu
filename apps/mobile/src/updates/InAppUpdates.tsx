import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import PlayAppUpdate, { type InstallStateEvent, type PlayUpdateInfo } from '../../modules/play-app-update';
import {
  CHECK_TIMEOUT_MS,
  decideUpdateType,
  isInterruptedImmediateUpdate,
  LAUNCH_CHECK_DELAY_MS,
  progressPercent,
  RESUME_CHECK_INTERVAL_MS,
} from './updatePolicy';
import { UpdateBanner, UpdatePrompt } from './UpdateUI';

/** Short pause before Google Play's mandatory-update screen is shown again after a cancel. */
const MANDATORY_REOPEN_DELAY_MS = 1000;

type Phase = 'idle' | 'available' | 'downloading' | 'downloaded' | 'installing';

interface State {
  phase: Phase;
  percent: number | null;
  /** The user closed the prompt/banner: stay quiet for the rest of this app session. */
  promptDismissed: boolean;
  bannerHidden: boolean;
}

type Action =
  | { type: 'offer' }
  | { type: 'progress'; percent: number | null }
  | { type: 'downloaded' }
  | { type: 'installing' }
  | { type: 'reset' }
  | { type: 'dismissPrompt' }
  | { type: 'hideBanner' };

const initial: State = { phase: 'idle', percent: null, promptDismissed: false, bannerHidden: false };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'offer':
      return state.promptDismissed || state.phase !== 'idle' ? state : { ...state, phase: 'available' };
    case 'progress':
      // Skip no-op updates: Play reports progress very frequently.
      return state.phase === 'downloading' && state.percent === action.percent ? state : { ...state, phase: 'downloading', percent: action.percent };
    case 'downloaded':
      // Hiding the progress card must not hide "Restart now" once the download completes.
      return state.phase === 'downloaded' ? state : { ...state, phase: 'downloaded', percent: 100, bannerHidden: false };
    case 'installing':
      return { ...state, phase: 'installing' };
    case 'reset':
      return { ...state, phase: 'idle', percent: null };
    case 'dismissPrompt':
      return { ...state, phase: 'idle', promptDismissed: true };
    case 'hideBanner':
      return { ...state, bannerHidden: true };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Google Play in-app updates (Android release builds only). Mounted once at the app root; it
 * renders nothing unless an update is being offered, downloaded or installed.
 *
 * Never blocks startup: the first check runs a few seconds after launch, in the background.
 * Any failure (no Play Store, sideloaded APK, offline, timeout) is ignored: the app works as usual.
 */
export function InAppUpdates({ promptsEnabled }: { promptsEnabled: boolean }) {
  // Debug builds, iOS, web and Expo Go never run update logic.
  if (Platform.OS !== 'android' || __DEV__ || !PlayAppUpdate) return null;
  return <AndroidInAppUpdates promptsEnabled={promptsEnabled} />;
}

function AndroidInAppUpdates({ promptsEnabled }: { promptsEnabled: boolean }) {
  const module = PlayAppUpdate!;
  const [state, dispatch] = useReducer(reducer, initial);
  const checking = useRef(false);
  const lastCheckAt = useRef(0);
  /** A mandatory (immediate) update is outstanding: re-check on every return to the app. */
  const mandatoryPending = useRef(false);
  /** A flexible download is active or waiting to install: keep its state fresh on resume. */
  const flexibleActive = useRef(false);
  /**
   * The user backed out of a mandatory update. Google Play returns control while the check that
   * opened it is still running, so the foreground re-check would be skipped as a duplicate;
   * this schedules it explicitly once that check has finished.
   */
  const reopenMandatory = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startImmediate = useCallback(async () => {
    mandatoryPending.current = true;
    try {
      const result = await module.startUpdate('IMMEDIATE');
      // ACCEPTED: Google Play installs and restarts the app.
      // CANCELED: the update is mandatory, so Google Play's own flow is shown again.
      // FAILED / NOT_ALLOWED: give up for this session; the app must keep working.
      if (result === 'CANCELED') reopenMandatory.current = true;
      if (result === 'FAILED' || result === 'NOT_ALLOWED') mandatoryPending.current = false;
    } catch {
      mandatoryPending.current = false;
    }
  }, [module]);

  const applyInfo = useCallback(
    async (info: PlayUpdateInfo) => {
      // A flexible download already started (possibly in an earlier app session).
      if (info.installStatus === 'DOWNLOADED') {
        flexibleActive.current = true;
        dispatch({ type: 'downloaded' });
        return;
      }
      if (info.installStatus === 'DOWNLOADING' || info.installStatus === 'PENDING') {
        flexibleActive.current = true;
        dispatch({ type: 'progress', percent: progressPercent(info.bytesDownloaded, info.totalBytesToDownload) });
        return;
      }
      if (isInterruptedImmediateUpdate(info)) {
        await startImmediate();
        return;
      }
      const type = decideUpdateType(info);
      if (type === 'IMMEDIATE') await startImmediate();
      else if (type === 'FLEXIBLE') dispatch({ type: 'offer' });
    },
    [startImmediate],
  );

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    lastCheckAt.current = Date.now();
    try {
      await applyInfo(await withTimeout(module.getUpdateInfo(), CHECK_TIMEOUT_MS));
    } catch {
      // Google Play unavailable, app not installed from Play, offline or timed out: carry on.
    } finally {
      checking.current = false;
      if (reopenMandatory.current) {
        reopenMandatory.current = false;
        retryTimer.current = setTimeout(() => void check(), MANDATORY_REOPEN_DELAY_MS);
      }
    }
  }, [module, applyInfo]);

  // Download/install progress from Google Play: one subscription for the component's lifetime.
  useEffect(() => {
    const subscription = module.addListener('onInstallStateChange', (event: InstallStateEvent) => {
      switch (event.status) {
        case 'PENDING':
        case 'DOWNLOADING':
          flexibleActive.current = true;
          dispatch({ type: 'progress', percent: progressPercent(event.bytesDownloaded, event.totalBytesToDownload) });
          break;
        case 'DOWNLOADED':
          dispatch({ type: 'downloaded' });
          break;
        case 'INSTALLING':
          dispatch({ type: 'installing' });
          break;
        case 'INSTALLED':
        case 'FAILED':
        case 'CANCELED':
          // A failed or cancelled background download is silent; a later launch offers it again.
          flexibleActive.current = false;
          dispatch({ type: 'reset' });
          break;
        default:
          break;
      }
    });
    return () => subscription.remove();
  }, [module]);

  // Launch check (deferred) and foreground checks (throttled, except while an update is active).
  useEffect(() => {
    const launchTimer = setTimeout(() => void check(), LAUNCH_CHECK_DELAY_MS);
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const due = Date.now() - lastCheckAt.current >= RESUME_CHECK_INTERVAL_MS;
      if (mandatoryPending.current || flexibleActive.current || due) void check();
    });
    return () => {
      clearTimeout(launchTimer);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      appStateSub.remove();
    };
  }, [check]);

  const acceptFlexible = useCallback(async () => {
    dispatch({ type: 'dismissPrompt' });
    try {
      const result = await module.startUpdate('FLEXIBLE');
      if (result === 'ACCEPTED') {
        flexibleActive.current = true;
        dispatch({ type: 'progress', percent: null });
      }
    } catch {
      // Google Play could not start the flow; the app continues normally.
    }
  }, [module]);

  const restart = useCallback(async () => {
    dispatch({ type: 'installing' });
    try {
      await module.completeUpdate();
    } catch {
      dispatch({ type: 'downloaded' });
    }
  }, [module]);

  const showBanner = !state.bannerHidden && (state.phase === 'downloading' || state.phase === 'downloaded' || state.phase === 'installing');

  return (
    <>
      <UpdatePrompt visible={promptsEnabled && state.phase === 'available'} onUpdate={() => void acceptFlexible()} onLater={() => dispatch({ type: 'dismissPrompt' })} />
      {promptsEnabled && showBanner ? (
        <UpdateBanner
          phase={state.phase as 'downloading' | 'downloaded' | 'installing'}
          percent={state.percent}
          onRestart={() => void restart()}
          onDismiss={() => dispatch({ type: 'hideBanner' })}
        />
      ) : null}
    </>
  );
}
