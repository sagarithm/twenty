import { type RecordingDownload } from 'fathom-typescript/sdk/models/shared';
import { type CoreApiClient } from 'twenty-client-sdk/core';
import { isDefined } from 'src/utils/is-defined';

import { FATHOM_MEDIA_FAILURE_REASON } from 'src/constants/fathom-media-failure-reason.constant';
import {
  importFathomMediaFile,
  type FathomMediaKind,
  type ImportFathomMediaFileResult,
} from 'src/logic-functions/utils/import-fathom-media-file.util';
import { recordFathomMediaFailure } from 'src/logic-functions/utils/record-fathom-media-failure.util';
import { settleCallRecordingMedia } from 'src/logic-functions/utils/settle-call-recording-media.util';
import { type FathomMediaUploadCheckpoint } from 'src/logic-functions/types/fathom-media-upload-checkpoint.type';

export type ApplyFathomMediaDownloadResult =
  | { outcome: 'imported'; kind: FathomMediaKind }
  | { outcome: 'pending' }
  | { outcome: 'expired' }
  | { outcome: 'unavailable'; reason: string };

export const applyFathomMediaDownload = async ({
  coreApiClient,
  callRecordingId,
  downloadId,
  uploadCheckpoint,
  download,
}: {
  coreApiClient: Pick<CoreApiClient, 'query' | 'mutation'>;
  callRecordingId: string;
  downloadId: string;
  uploadCheckpoint: FathomMediaUploadCheckpoint | undefined;
  download: Pick<
    RecordingDownload,
    'status' | 'failureReason' | 'video' | 'audio'
  >;
}): Promise<ApplyFathomMediaDownloadResult> => {
  if (download.status === 'processing') {
    return { outcome: 'pending' };
  }

  if (download.status === 'failed') {
    return settleUnavailable({
      coreApiClient,
      callRecordingId,
      reason: download.failureReason ?? 'generation_failed',
    });
  }

  if (download.status === 'expired') {
    return { outcome: 'expired' };
  }

  const kind: FathomMediaKind = isDefined(download.video) ? 'video' : 'audio';
  const downloadFile = download.video ?? download.audio;

  if (!isDefined(downloadFile)) {
    return settleUnavailable({
      coreApiClient,
      callRecordingId,
      reason: FATHOM_MEDIA_FAILURE_REASON.COMPLETED_WITHOUT_FILE,
    });
  }

  const importResult =
    uploadCheckpoint?.downloadId === downloadId &&
    uploadCheckpoint.kind === kind
      ? ({
          outcome: 'imported',
          files: [
            {
              fileId: uploadCheckpoint.fileId,
              label: kind === 'video' ? 'video.mp4' : 'audio.mp3',
            },
          ],
        } satisfies ImportFathomMediaFileResult)
      : await importFathomMediaFile({
          coreApiClient,
          callRecordingId,
          downloadId,
          kind,
          downloadFile,
        });

  if (importResult.outcome === 'too-large') {
    return settleUnavailable({
      coreApiClient,
      callRecordingId,
      reason: FATHOM_MEDIA_FAILURE_REASON.FILE_TOO_LARGE,
    });
  }

  if (importResult.outcome === 'empty') {
    return settleUnavailable({
      coreApiClient,
      callRecordingId,
      reason: FATHOM_MEDIA_FAILURE_REASON.COMPLETED_WITHOUT_FILE,
    });
  }

  await settleCallRecordingMedia({
    coreApiClient,
    callRecordingId,
    fields: { [kind]: importResult.files, fathomMediaFailureReason: null },
  });

  return { outcome: 'imported', kind };
};

const settleUnavailable = async ({
  coreApiClient,
  callRecordingId,
  reason,
}: {
  coreApiClient: Pick<CoreApiClient, 'query' | 'mutation'>;
  callRecordingId: string;
  reason: string;
}): Promise<ApplyFathomMediaDownloadResult> => {
  await recordFathomMediaFailure({ coreApiClient, callRecordingId, reason });

  return { outcome: 'unavailable', reason };
};
