import { type CoreApiClient } from 'twenty-client-sdk/core';
import { isDefined } from 'src/utils/is-defined';

import { type CallRecordingSyncFields } from 'src/logic-functions/types/call-recording-sync-fields.type';

const doesCallRecordingExist = async ({
  coreApiClient,
  callRecordingId,
}: {
  coreApiClient: Pick<CoreApiClient, 'query'>;
  callRecordingId: string;
}): Promise<boolean> => {
  const queryResult = await coreApiClient.query({
    callRecordings: {
      __args: {
        filter: { id: { eq: callRecordingId } },
        first: 1,
      },
      edges: { node: { id: true } },
    },
  });

  return isDefined(queryResult.callRecordings?.edges?.[0]?.node);
};

const updateCallRecording = async ({
  coreApiClient,
  callRecordingId,
  updateFields,
}: {
  coreApiClient: Pick<CoreApiClient, 'mutation'>;
  callRecordingId: string;
  updateFields: CallRecordingSyncFields;
}): Promise<void> => {
  await coreApiClient.mutation({
    updateCallRecording: {
      __args: {
        id: callRecordingId,
        data: updateFields,
      },
      id: true,
    },
  });
};

export const upsertCallRecording = async ({
  coreApiClient,
  callRecordingId,
  createFields,
  updateFields,
}: {
  coreApiClient: Pick<CoreApiClient, 'query' | 'mutation'>;
  callRecordingId: string;
  createFields: CallRecordingSyncFields;
  updateFields: CallRecordingSyncFields;
}): Promise<{ callRecordingId: string; created: boolean }> => {
  if (await doesCallRecordingExist({ coreApiClient, callRecordingId })) {
    await updateCallRecording({
      coreApiClient,
      callRecordingId,
      updateFields,
    });

    return { callRecordingId, created: false };
  }

  try {
    await coreApiClient.mutation({
      createCallRecording: {
        __args: {
          data: { id: callRecordingId, ...createFields },
        },
        id: true,
      },
    });

    return { callRecordingId, created: true };
  } catch (error) {
    if (!(await doesCallRecordingExist({ coreApiClient, callRecordingId }))) {
      throw error;
    }

    await updateCallRecording({
      coreApiClient,
      callRecordingId,
      updateFields,
    });

    return { callRecordingId, created: false };
  }
};
