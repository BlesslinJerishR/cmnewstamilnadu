import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { PlayAppUpdateEvents, PlayUpdateInfo, StartUpdateResult, UpdateType } from './PlayAppUpdate.types';

declare class PlayAppUpdateModule extends NativeModule<PlayAppUpdateEvents> {
  getUpdateInfo(): Promise<PlayUpdateInfo>;
  startUpdate(type: UpdateType): Promise<StartUpdateResult>;
  completeUpdate(): Promise<void>;
}

/** Null on iOS, web and any build without the native module (e.g. Expo Go). */
export default requireOptionalNativeModule<PlayAppUpdateModule>('PlayAppUpdate');
