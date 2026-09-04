import { isNonEmptyString } from '@sniptt/guards';

import { type FathomMediaReconciliationPlan } from 'src/logic-functions/types/fathom-media-reconciliation-plan.type';
import { type FathomMediaReconciliationCandidate } from 'src/logic-functions/types/fathom-media-reconciliation-plan.type';
import { isFathomCallRecordingImportComplete } from 'src/logic-functions/utils/is-fathom-call-recording-import-complete.util';
import { isFathomMediaSettled } from 'src/logic-functions/utils/is-fathom-media-settled.util';

export const buildFathomMediaReconciliationPlan = (
  callRecordings: FathomMediaReconciliationCandidate[],
): FathomMediaReconciliationPlan => {
  const callRecordingsToComplete: Array<{ id: string; updatedAt: string }> = [];
  const importGroupsByConnectedAccountId = new Map<
    string,
    Omit<
      FathomMediaReconciliationPlan['importGroups'][number],
      'connectedAccountId'
    >
  >();

  for (const callRecording of callRecordings) {
    if (
      callRecording.status === 'PROCESSING' &&
      isFathomCallRecordingImportComplete(callRecording)
    ) {
      callRecordingsToComplete.push({
        id: callRecording.id,
        updatedAt: callRecording.updatedAt,
      });
      continue;
    }

    if (
      isFathomMediaSettled(callRecording) ||
      !isNonEmptyString(callRecording.connectedAccountId)
    ) {
      continue;
    }

    const existingImportGroup = importGroupsByConnectedAccountId.get(
      callRecording.connectedAccountId,
    ) ?? { callRecordingIdsToRequest: [], downloadsToPoll: [] };

    if (isNonEmptyString(callRecording.downloadId)) {
      existingImportGroup.downloadsToPoll.push({
        callRecordingId: callRecording.id,
        downloadId: callRecording.downloadId,
      });
    } else {
      existingImportGroup.callRecordingIdsToRequest.push(callRecording.id);
    }

    importGroupsByConnectedAccountId.set(
      callRecording.connectedAccountId,
      existingImportGroup,
    );
  }

  return {
    callRecordingsToComplete,
    importGroups: [...importGroupsByConnectedAccountId].map(
      ([connectedAccountId, importGroup]) => ({
        connectedAccountId,
        ...importGroup,
      }),
    ),
  };
};
