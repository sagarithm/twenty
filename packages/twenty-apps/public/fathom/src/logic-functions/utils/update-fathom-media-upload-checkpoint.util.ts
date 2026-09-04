import { type CoreApiClient } from 'twenty-client-sdk/core';

import { type FathomMediaUploadCheckpoint } from 'src/logic-functions/types/fathom-media-upload-checkpoint.type';

export const updateFathomMediaUploadCheckpoint = async ({
  coreApiClient,
  callRecordingId,
  uploadCheckpoint,
}: {
  coreApiClient: Pick<CoreApiClient, 'mutation'>;
  callRecordingId: string;
  uploadCheckpoint: FathomMediaUploadCheckpoint | null;
}): Promise<void> => {
  await coreApiClient.mutation({
    updateCallRecording: {
      __args: {
        id: callRecordingId,
        data: { fathomMediaUploadCheckpoint: uploadCheckpoint },
      },
      id: true,
    },
  });
};
