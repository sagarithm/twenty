import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction } from 'twenty-sdk/define';
import { kv } from 'twenty-sdk/logic-function';
import { isDefined } from 'src/utils/is-defined';

import { FATHOM_DISCONNECT_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { FATHOM_MEDIA_FAILURE_REASON } from 'src/constants/fathom-media-failure-reason.constant';
import { type FathomConnectionHookPayload } from 'src/logic-functions/types/fathom-connection-hook-payload.type';
import { type FathomWebhookRegistration } from 'src/logic-functions/types/fathom-webhook-registration.type';
import { getFathomWebhookRegistrationKey } from 'src/logic-functions/utils/get-fathom-webhook-registration-key.util';

export const fathomDisconnectHandler = async (
  payload: FathomConnectionHookPayload,
): Promise<{ success: true }> => {
  const registrationKey = getFathomWebhookRegistrationKey(
    payload.connectedAccountId,
  );
  const registration = await kv.get<FathomWebhookRegistration>(registrationKey);

  if (isDefined(registration)) {
    // Twenty runs onDisconnect after deleting the token, so the secret is kept only
    // to acknowledge Fathom deliveries still in flight.
    // TODO: delete the webhook, this registration and the server-scoped connection
    // claim here, and drop isActive, once the engine carries #25215.
    await kv.set(registrationKey, { ...registration, isActive: false });
  }

  const coreApiClient = new CoreApiClient({ runAs: 'application' });

  await coreApiClient.mutation({
    updateCallRecordings: {
      __args: {
        filter: {
          fathomConnectedAccountId: { eq: payload.connectedAccountId },
          fathomMediaFailureReason: { is: 'NULL' },
          video: { is: 'NULL' },
          audio: { is: 'NULL' },
        },
        data: {
          fathomMediaFailureReason:
            FATHOM_MEDIA_FAILURE_REASON.CONNECTED_ACCOUNT_UNAVAILABLE,
          fathomMediaDownloadId: null,
          fathomMediaImportClaimedAt: null,
          fathomMediaUploadCheckpoint: null,
        },
      },
      id: true,
    },
  });

  await coreApiClient.mutation({
    updateCallRecordings: {
      __args: {
        filter: {
          fathomConnectedAccountId: { eq: payload.connectedAccountId },
          status: { eq: 'PROCESSING' },
          transcript: { is: 'NOT_NULL' },
          or: [
            { video: { is: 'NOT_NULL' } },
            { audio: { is: 'NOT_NULL' } },
            { fathomMediaFailureReason: { is: 'NOT_NULL' } },
          ],
        },
        data: { status: 'COMPLETED' },
      },
      id: true,
    },
  });

  return { success: true };
};

export default defineLogicFunction({
  universalIdentifier: FATHOM_DISCONNECT_UNIVERSAL_IDENTIFIER,
  name: 'fathom-disconnect',
  description:
    'Disables webhook ingestion after a user removes their Fathom connection.',
  timeoutSeconds: 30,
  handler: fathomDisconnectHandler,
});
