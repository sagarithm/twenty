import { z } from 'zod';

const fileSchema = z.object({
  fileId: z.string().nullable().optional(),
});

export const fathomMediaUploadCheckpointSchema = z.object({
  downloadId: z.string().trim().min(1),
  fileId: z.string().trim().min(1),
  kind: z.enum(['video', 'audio']),
});

export const callRecordingMediaStateNodeSchema = z.object({
  id: z.string(),
  externalRecordingId: z.string().nullable().optional(),
  video: z.array(fileSchema).nullable().optional(),
  audio: z.array(fileSchema).nullable().optional(),
  fathomMediaFailureReason: z.string().nullable().optional(),
  fathomConnectedAccountId: z.string().nullable().optional(),
  fathomMediaDownloadId: z.string().nullable().optional(),
  fathomMediaUploadCheckpoint: z.unknown().nullable().optional(),
  transcript: z.unknown().nullable().optional(),
});

export const callRecordingMediaStateQueryResultSchema = z.object({
  callRecordings: z
    .object({
      edges: z.array(
        z
          .object({
            node: callRecordingMediaStateNodeSchema.nullable().optional(),
          })
          .nullable(),
      ),
    })
    .nullable()
    .optional(),
});
