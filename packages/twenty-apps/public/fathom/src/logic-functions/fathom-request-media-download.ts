import { type RecordingDownload } from 'fathom-typescript/sdk/models/shared';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction } from 'twenty-sdk/define';
import {
  getConnection,
  RetryableLogicFunctionError,
} from 'twenty-sdk/logic-function';
import { isDefined } from 'src/utils/is-defined';

import { FATHOM_REQUEST_MEDIA_DOWNLOAD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { FATHOM_MEDIA_IMPORT_CLAIM_DURATION_MILLISECONDS } from 'src/constants/fathom.constant';
import { fathomRequestMediaDownloadPayloadSchema } from 'src/logic-functions/schemas/fathom-media-download-payload.schema';
import { applyFathomMediaDownload } from 'src/logic-functions/utils/apply-fathom-media-download.util';
import { buildRetryableFathomError } from 'src/logic-functions/utils/build-retryable-fathom-error.util';
import { claimFathomMediaImport } from 'src/logic-functions/utils/claim-fathom-media-import.util';
import { createFathomClient } from 'src/logic-functions/utils/create-fathom-client.util';
import { enqueueFathomMediaDownloadPoll } from 'src/logic-functions/utils/enqueue-fathom-media-download-poll.util';
import { enqueueFathomMediaDownloadRequest } from 'src/logic-functions/utils/enqueue-fathom-media-download-request.util';
import { getFathomMediaFailureReasonForError } from 'src/logic-functions/utils/get-fathom-media-failure-reason-for-error.util';
import { recordFathomMediaFailure } from 'src/logic-functions/utils/record-fathom-media-failure.util';
import { releaseFathomMediaImportClaim } from 'src/logic-functions/utils/release-fathom-media-import-claim.util';
import { resolveFathomMediaImportTarget } from 'src/logic-functions/utils/resolve-fathom-media-import-target.util';
import { updateFathomMediaDownloadId } from 'src/logic-functions/utils/update-fathom-media-download-id.util';

export const fathomRequestMediaDownloadHandler = async (payload: unknown) => {
  const payloadParseResult =
    fathomRequestMediaDownloadPayloadSchema.safeParse(payload);

  if (!payloadParseResult.success) {
    throw new Error('Fathom media download request requires a valid payload');
  }

  try {
    return await requestFathomMediaDownload({
      coreApiClient: new CoreApiClient({ runAs: 'application' }),
      callRecordingId: payloadParseResult.data.callRecordingId,
    });
  } catch (error) {
    if (error instanceof RetryableLogicFunctionError) {
      throw error;
    }

    throw buildRetryableFathomError({
      operation: `media download request callRecordingId=${payloadParseResult.data.callRecordingId}`,
      error,
    });
  }
};

const requestFathomMediaDownload = async ({
  coreApiClient,
  callRecordingId,
}: {
  coreApiClient: Pick<CoreApiClient, 'query' | 'mutation'>;
  callRecordingId: string;
}) => {
  const claim = await claimFathomMediaImport({
    coreApiClient,
    callRecordingId,
    now: new Date(),
  });

  if (!isDefined(claim)) {
    const target = await resolveFathomMediaImportTarget({
      coreApiClient,
      callRecordingId,
    });

    if (target.status !== 'skipped') {
      await enqueueFathomMediaDownloadRequest({
        callRecordingId,
        connectedAccountId: target.connectedAccountId,
        notBeforeDelayMilliseconds:
          FATHOM_MEDIA_IMPORT_CLAIM_DURATION_MILLISECONDS,
      });
    }

    return {
      success: true,
      skipped: true,
      reason: 'media import already in progress',
    };
  }

  try {
    const target = await resolveFathomMediaImportTarget({
      coreApiClient,
      callRecordingId,
    });

    if (target.status === 'skipped') {
      return { success: true, skipped: true, reason: target.reason };
    }

    if (isDefined(target.downloadId)) {
      await enqueueFathomMediaDownloadPoll({
        callRecordingId,
        connectedAccountId: target.connectedAccountId,
        downloadId: target.downloadId,
        attempt: 0,
      });

      return {
        success: true,
        downloadId: target.downloadId,
        resumed: true,
      };
    }

    const connection = await getConnection(target.connectedAccountId);
    const fathomClient = createFathomClient(connection.accessToken);
    let download: RecordingDownload;

    try {
      download = await fathomClient.createRecordingDownload({
        recordingId: target.recordingId,
      });
    } catch (error) {
      const failureReason = getFathomMediaFailureReasonForError(error);

      if (!isDefined(failureReason)) {
        throw error;
      }

      await recordFathomMediaFailure({
        coreApiClient,
        callRecordingId,
        reason: failureReason,
      });

      return { success: true, skipped: true, reason: failureReason };
    }

    await updateFathomMediaDownloadId({
      coreApiClient,
      callRecordingId,
      downloadId: download.downloadId,
    });

    const applyResult = await applyFathomMediaDownload({
      coreApiClient,
      callRecordingId,
      downloadId: download.downloadId,
      uploadCheckpoint: target.uploadCheckpoint,
      download,
    });

    if (applyResult.outcome === 'expired') {
      await updateFathomMediaDownloadId({
        coreApiClient,
        callRecordingId,
        downloadId: null,
      });

      return { success: true, outcome: 'expired' };
    }

    if (applyResult.outcome === 'pending') {
      await enqueueFathomMediaDownloadPoll({
        callRecordingId,
        connectedAccountId: target.connectedAccountId,
        downloadId: download.downloadId,
        attempt: 0,
      });

      return {
        success: true,
        downloadId: download.downloadId,
        pending: true,
      };
    }

    return {
      success: true,
      downloadId: download.downloadId,
      outcome: applyResult.outcome,
    };
  } finally {
    await releaseFathomMediaImportClaim({
      coreApiClient,
      callRecordingId,
      claim,
    });
  }
};

export default defineLogicFunction({
  universalIdentifier: FATHOM_REQUEST_MEDIA_DOWNLOAD_UNIVERSAL_IDENTIFIER,
  name: 'fathom-request-media-download',
  description:
    "Asks Fathom to generate the downloadable media for one recording, imports it when the download is ready immediately, and otherwise schedules a poll for Fathom's background generation.",
  timeoutSeconds: 900,
  handler: fathomRequestMediaDownloadHandler,
});
