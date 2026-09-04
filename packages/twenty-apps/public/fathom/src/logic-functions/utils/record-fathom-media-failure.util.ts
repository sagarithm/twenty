import { type CoreApiClient } from 'twenty-client-sdk/core';

import { settleCallRecordingMedia } from 'src/logic-functions/utils/settle-call-recording-media.util';

export const recordFathomMediaFailure = async ({
  coreApiClient,
  callRecordingId,
  reason,
}: {
  coreApiClient: Pick<CoreApiClient, 'query' | 'mutation'>;
  callRecordingId: string;
  reason: string;
}): Promise<void> => {
  await settleCallRecordingMedia({
    coreApiClient,
    callRecordingId,
    fields: { fathomMediaFailureReason: reason },
  });
};
