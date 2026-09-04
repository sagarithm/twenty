import { isDefined } from 'src/utils/is-defined';

import { type CallRecordingSyncFields } from 'src/logic-functions/types/call-recording-sync-fields.type';
import { type CallRecordingMediaState } from 'src/logic-functions/types/call-recording-media-state.type';

export const buildFathomCallRecordingUpsertFields = ({
  sharedFields,
  existingCallRecording,
  connectedAccountId,
  retryMedia,
}: {
  sharedFields: CallRecordingSyncFields;
  existingCallRecording:
    | Pick<
        CallRecordingMediaState,
        | 'hasVideo'
        | 'hasAudio'
        | 'failureReason'
        | 'downloadId'
        | 'connectedAccountId'
      >
    | undefined;
  connectedAccountId: string;
  retryMedia: boolean;
}): {
  createFields: CallRecordingSyncFields;
  updateFields: CallRecordingSyncFields;
  isMediaDownloadRequestNeeded: boolean;
} => {
  const isRetryingSettledMedia =
    retryMedia &&
    isDefined(existingCallRecording?.failureReason) &&
    !existingCallRecording.hasVideo &&
    !existingCallRecording.hasAudio;
  const hasActiveDownloadForCurrentConnection =
    !isRetryingSettledMedia &&
    isDefined(existingCallRecording?.downloadId) &&
    existingCallRecording.connectedAccountId === connectedAccountId;
  const isReplacingActiveDownload =
    isDefined(existingCallRecording?.downloadId) &&
    !hasActiveDownloadForCurrentConnection;
  const ownershipFields = hasActiveDownloadForCurrentConnection
    ? {}
    : { fathomConnectedAccountId: connectedAccountId };

  return {
    createFields: {
      ...sharedFields,
      ...ownershipFields,
      status: 'PROCESSING',
    },
    updateFields: {
      ...sharedFields,
      ...ownershipFields,
      ...(isReplacingActiveDownload
        ? {
            fathomMediaDownloadId: null,
            fathomMediaUploadCheckpoint: null,
          }
        : {}),
      ...(isRetryingSettledMedia
        ? {
            status: 'PROCESSING',
            fathomConnectedAccountId: connectedAccountId,
            fathomMediaDownloadId: null,
            fathomMediaUploadCheckpoint: null,
            fathomMediaFailureReason: null,
          }
        : {}),
    },
    isMediaDownloadRequestNeeded:
      isRetryingSettledMedia || isReplacingActiveDownload,
  };
};
