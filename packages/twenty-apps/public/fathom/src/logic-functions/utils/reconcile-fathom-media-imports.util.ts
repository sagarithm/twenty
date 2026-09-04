import { isNonEmptyArray } from '@sniptt/guards';
import { type CoreApiClient } from 'twenty-client-sdk/core';

import { FATHOM_HEALING_WINDOW_DAYS } from 'src/constants/fathom.constant';
import {
  FATHOM_BACKFILL_WORKER_UNIVERSAL_IDENTIFIER,
  FATHOM_IMPORT_MEDIA_DOWNLOAD_UNIVERSAL_IDENTIFIER,
  FATHOM_REQUEST_MEDIA_DOWNLOAD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import { buildFathomMediaReconciliationPlan } from 'src/logic-functions/utils/build-fathom-media-reconciliation-plan.util';
import { completeFathomCallRecordingImports } from 'src/logic-functions/utils/complete-fathom-call-recording-imports.util';
import { enqueueFathomJobsOrThrow } from 'src/logic-functions/utils/enqueue-fathom-jobs-or-throw.util';
import { findStaleFathomMediaImports } from 'src/logic-functions/utils/find-stale-fathom-media-imports.util';
import { listFathomConnections } from 'src/logic-functions/utils/list-fathom-connections.util';
import { reserveFathomImportSlots } from 'src/logic-functions/utils/reserve-fathom-import-slots.util';
import { chunkIntoBatches } from 'src/utils/chunk-into-batches.util';

const FATHOM_MEDIA_RECONCILIATION_BATCH_SIZE = 5;

export const reconcileFathomMediaImports = async ({
  coreApiClient,
  now,
}: {
  coreApiClient: Pick<CoreApiClient, 'query' | 'mutation'>;
  now: Date;
}) => {
  const connections = await listFathomConnections();
  const activeConnectedAccountIds = connections.map(({ id }) => id);

  const staleCallRecordings = await findStaleFathomMediaImports({
    coreApiClient,
    now,
    activeConnectedAccountIds,
  });
  const reconciliationPlan =
    buildFathomMediaReconciliationPlan(staleCallRecordings);
  const completedCallRecordingCount = await completeFathomCallRecordingImports({
    coreApiClient,
    callRecordings: reconciliationPlan.callRecordingsToComplete,
  });
  let enqueuedCallRecordingCount = 0;

  for (const importGroup of reconciliationPlan.importGroups) {
    const requestBatches = chunkIntoBatches(
      importGroup.callRecordingIdsToRequest,
      FATHOM_MEDIA_RECONCILIATION_BATCH_SIZE,
    );
    const pollBatches = chunkIntoBatches(
      importGroup.downloadsToPoll,
      FATHOM_MEDIA_RECONCILIATION_BATCH_SIZE,
    );
    const { slotDelays } = await reserveFathomImportSlots({
      connectedAccountId: importGroup.connectedAccountId,
      slotCount: requestBatches.length + pollBatches.length,
    });
    let slotIndex = 0;

    for (const callRecordingIds of requestBatches) {
      await enqueueFathomJobsOrThrow({
        logicFunctionUniversalIdentifier:
          FATHOM_REQUEST_MEDIA_DOWNLOAD_UNIVERSAL_IDENTIFIER,
        payloads: callRecordingIds.map((callRecordingId) => ({
          callRecordingId,
        })),
        delayMs: slotDelays[slotIndex],
      });
      enqueuedCallRecordingCount += callRecordingIds.length;
      slotIndex += 1;
    }

    for (const downloads of pollBatches) {
      await enqueueFathomJobsOrThrow({
        logicFunctionUniversalIdentifier:
          FATHOM_IMPORT_MEDIA_DOWNLOAD_UNIVERSAL_IDENTIFIER,
        payloads: downloads.map(({ callRecordingId, downloadId }) => ({
          callRecordingId,
          downloadId,
          attempt: 0,
        })),
        delayMs: slotDelays[slotIndex],
      });
      enqueuedCallRecordingCount += downloads.length;
      slotIndex += 1;
    }
  }

  if (isNonEmptyArray(connections)) {
    await enqueueFathomJobsOrThrow({
      logicFunctionUniversalIdentifier:
        FATHOM_BACKFILL_WORKER_UNIVERSAL_IDENTIFIER,
      payloads: connections.map(({ id: connectedAccountId }) => ({
        connectedAccountId,
        days: FATHOM_HEALING_WINDOW_DAYS,
      })),
    });
  }

  return {
    enqueuedBackfillCount: connections.length,
    candidateCount: staleCallRecordings.length,
    completedCallRecordingCount,
    enqueuedCallRecordingCount,
  };
};
