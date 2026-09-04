import { type RecordingDownload } from 'fathom-typescript/sdk/models/shared';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction } from 'twenty-sdk/define';
import {
  getConnection,
  RetryableLogicFunctionError,
} from 'twenty-sdk/logic-function';
import { isDefined } from 'src/utils/is-defined';

import {
  FATHOM_MEDIA_DOWNLOAD_MAX_POLL_ATTEMPTS,
  FATHOM_MEDIA_IMPORT_CLAIM_DURATION_MILLISECONDS,
} from 'src/constants/fathom.constant';
import { FATHOM_IMPORT_MEDIA_DOWNLOAD_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { fathomImportMediaDownloadPayloadSchema } from 'src/logic-functions/schemas/fathom-media-download-payload.schema';
import { applyFathomMediaDownload } from 'src/logic-functions/utils/apply-fathom-media-download.util';
import { buildRetryableFathomError } from 'src/logic-functions/utils/build-retryable-fathom-error.util';
import { claimFathomMediaImport } from 'src/logic-functions/utils/claim-fathom-media-import.util';
import { createFathomClient } from 'src/logic-functions/utils/create-fathom-client.util';
import { enqueueFathomMediaDownloadPoll } from 'src/logic-functions/utils/enqueue-fathom-media-download-poll.util';
import { getFathomMediaFailureReasonForError } from 'src/logic-functions/utils/get-fathom-media-failure-reason-for-error.util';
import { recordFathomMediaFailure } from 'src/logic-functions/utils/record-fathom-media-failure.util';
import { releaseFathomMediaImportClaim } from 'src/logic-functions/utils/release-fathom-media-import-claim.util';
import { resolveFathomMediaImportTarget } from 'src/logic-functions/utils/resolve-fathom-media-import-target.util';
import { updateFathomMediaDownloadId } from 'src/logic-functions/utils/update-fathom-media-download-id.util';

export const fathomImportMediaDownloadHandler = async (payload: unknown) => {
  const payloadParseResult =
    fathomImportMediaDownloadPayloadSchema.safeParse(payload);

  if (!payloadParseResult.success) {
    throw new Error('Fathom media download import requires a valid payload');
  }

  try {
    return await importFathomMediaDownload({
      coreApiClient: new CoreApiClient({ runAs: 'application' }),
      callRecordingId: payloadParseResult.data.callRecordingId,
      expectedDownloadId: payloadParseResult.data.downloadId,
      attempt: payloadParseResult.data.attempt,
    });
  } catch (error) {
    if (error instanceof RetryableLogicFunctionError) {
      throw error;
    }

    throw buildRetryableFathomError({
      operation: `media download import callRecordingId=${payloadParseResult.data.callRecordingId} downloadId=${payloadParseResult.data.downloadId} attempt=${payloadParseResult.data.attempt}`,
      error,
    });
  }
};

const importFathomMediaDownload = async ({
  coreApiClient,
  callRecordingId,
  expectedDownloadId,
  attempt,
}: {
  coreApiClient: Pick<CoreApiClient, 'query' | 'mutation'>;
  callRecordingId: string;
  expectedDownloadId: string;
  attempt: number;
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
      await enqueueFathomMediaDownloadPoll({
        callRecordingId,
        connectedAccountId: target.connectedAccountId,
        downloadId: expectedDownloadId,
        attempt,
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

    if (!isDefined(target.downloadId)) {
      return {
        success: true,
        skipped: true,
        reason: 'call recording has no active Fathom download',
      };
    }

    if (target.downloadId !== expectedDownloadId) {
      return {
        success: true,
        skipped: true,
        reason: 'media download was replaced',
      };
    }

    const connection = await getConnection(target.connectedAccountId);
    const fathomClient = createFathomClient(connection.accessToken);
    let download: RecordingDownload;

    try {
      download = await fathomClient.getRecordingDownload({
        recordingId: target.recordingId,
        downloadId: target.downloadId,
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

    const applyResult = await applyFathomMediaDownload({
      coreApiClient,
      callRecordingId,
      downloadId: target.downloadId,
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

    if (applyResult.outcome !== 'pending') {
      return { success: true, outcome: applyResult.outcome };
    }

    const nextAttempt = attempt + 1;

    if (nextAttempt < FATHOM_MEDIA_DOWNLOAD_MAX_POLL_ATTEMPTS) {
      await enqueueFathomMediaDownloadPoll({
        callRecordingId,
        connectedAccountId: target.connectedAccountId,
        downloadId: target.downloadId,
        attempt: nextAttempt,
      });

      return { success: true, pending: true, attempt: nextAttempt };
    }

    console.warn(
      `[fathom] media-import phase=poll-budget-exhausted callRecordingId=${callRecordingId} recordingId=${target.recordingId} downloadId=${target.downloadId} attempts=${nextAttempt}`,
    );

    await updateFathomMediaDownloadId({
      coreApiClient,
      callRecordingId,
      downloadId: null,
    });

    return { success: true, unavailable: true, exhausted: true };
  } finally {
    await releaseFathomMediaImportClaim({
      coreApiClient,
      callRecordingId,
      claim,
    });
  }
};

export default defineLogicFunction({
  universalIdentifier: FATHOM_IMPORT_MEDIA_DOWNLOAD_UNIVERSAL_IDENTIFIER,
  name: 'fathom-import-media-download',
  description:
    "Polls one Fathom recording download and streams the generated video or audio into the CallRecording's media fields once Fathom finishes generating it.",
  timeoutSeconds: 900,
  handler: fathomImportMediaDownloadHandler,
});
