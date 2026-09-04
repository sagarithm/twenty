import { type CoreApiClient } from 'twenty-client-sdk/core';

export const updateFathomMediaDownloadId = async ({
  coreApiClient,
  callRecordingId,
  downloadId,
}: {
  coreApiClient: Pick<CoreApiClient, 'mutation'>;
  callRecordingId: string;
  downloadId: string | null;
}): Promise<void> => {
  await coreApiClient.mutation({
    updateCallRecording: {
      __args: {
        id: callRecordingId,
        data: {
          fathomMediaDownloadId: downloadId,
          ...(downloadId === null ? { fathomMediaUploadCheckpoint: null } : {}),
        },
      },
      id: true,
    },
  });
};
