export type FathomMediaReconciliationPlan = {
  callRecordingsToComplete: Array<{
    id: string;
    updatedAt: string;
  }>;
  importGroups: Array<{
    connectedAccountId: string;
    callRecordingIdsToRequest: string[];
    downloadsToPoll: Array<{
      callRecordingId: string;
      downloadId: string;
    }>;
  }>;
};

export type FathomMediaReconciliationCandidate = CallRecordingMediaState & {
  status: string;
  updatedAt: string;
};
import { type CallRecordingMediaState } from 'src/logic-functions/types/call-recording-media-state.type';
