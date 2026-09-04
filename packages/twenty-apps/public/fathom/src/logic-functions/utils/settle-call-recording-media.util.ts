import { type CoreApiClient } from 'twenty-client-sdk/core';
import { type CallRecordingSyncFields } from 'src/logic-functions/types/call-recording-sync-fields.type';
import { completeFathomCallRecordingImport } from 'src/logic-functions/utils/complete-fathom-call-recording-import.util';
import { updateCallRecordingMedia } from 'src/logic-functions/utils/update-call-recording-media.util';

export const settleCallRecordingMedia = async ({
  coreApiClient,
  callRecordingId,
  fields,
}: {
  coreApiClient: Pick<CoreApiClient, 'query' | 'mutation'>;
  callRecordingId: string;
  fields: Pick<
    CallRecordingSyncFields,
    'video' | 'audio' | 'fathomMediaFailureReason'
  >;
}): Promise<void> => {
  await updateCallRecordingMedia({
    coreApiClient,
    callRecordingId,
    fields: {
      ...fields,
      fathomMediaDownloadId: null,
      fathomMediaUploadCheckpoint: null,
    },
  });

  await completeFathomCallRecordingImport({
    coreApiClient,
    callRecordingId,
  });
};
