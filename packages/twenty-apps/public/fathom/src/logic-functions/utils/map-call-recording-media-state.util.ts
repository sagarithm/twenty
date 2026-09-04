import { isNonEmptyString } from '@sniptt/guards';
import { type z } from 'zod';

import {
  type callRecordingMediaStateNodeSchema,
  fathomMediaUploadCheckpointSchema,
} from 'src/logic-functions/schemas/call-recording-media-state-query-result.schema';
import { type CallRecordingMediaState } from 'src/logic-functions/types/call-recording-media-state.type';

export const mapCallRecordingMediaState = (
  node: z.infer<typeof callRecordingMediaStateNodeSchema>,
): CallRecordingMediaState => {
  const uploadCheckpointResult = fathomMediaUploadCheckpointSchema.safeParse(
    node.fathomMediaUploadCheckpoint,
  );

  return {
    id: node.id,
    externalRecordingId: isNonEmptyString(node.externalRecordingId)
      ? node.externalRecordingId
      : undefined,
    hasVideo:
      node.video?.some((file) => isNonEmptyString(file.fileId)) ?? false,
    hasAudio:
      node.audio?.some((file) => isNonEmptyString(file.fileId)) ?? false,
    hasTranscript: Array.isArray(node.transcript) && node.transcript.length > 0,
    failureReason: isNonEmptyString(node.fathomMediaFailureReason)
      ? node.fathomMediaFailureReason
      : undefined,
    connectedAccountId: isNonEmptyString(node.fathomConnectedAccountId)
      ? node.fathomConnectedAccountId
      : undefined,
    downloadId: isNonEmptyString(node.fathomMediaDownloadId)
      ? node.fathomMediaDownloadId
      : undefined,
    uploadCheckpoint: uploadCheckpointResult.success
      ? uploadCheckpointResult.data
      : undefined,
  };
};
