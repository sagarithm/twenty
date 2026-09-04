import { type CoreApiClient } from 'twenty-client-sdk/core';

import { type CallRecordingSyncFields } from 'src/logic-functions/types/call-recording-sync-fields.type';

export const updateCallRecordingMedia = async ({
  coreApiClient,
  callRecordingId,
  fields,
}: {
  coreApiClient: Pick<CoreApiClient, 'mutation'>;
  callRecordingId: string;
  fields: Pick<
    CallRecordingSyncFields,
    | 'video'
    | 'audio'
    | 'fathomMediaFailureReason'
    | 'fathomMediaDownloadId'
    | 'fathomMediaUploadCheckpoint'
  >;
}): Promise<void> => {
  await coreApiClient.mutation({
    updateCallRecording: {
      __args: {
        id: callRecordingId,
        data: fields,
      },
      id: true,
    },
  });
};
