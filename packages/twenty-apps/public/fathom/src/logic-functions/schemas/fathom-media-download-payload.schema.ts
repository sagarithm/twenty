import { z } from 'zod';

export const fathomRequestMediaDownloadPayloadSchema = z.object({
  callRecordingId: z.string().trim().min(1),
});

export const fathomImportMediaDownloadPayloadSchema =
  fathomRequestMediaDownloadPayloadSchema.extend({
    downloadId: z.string().trim().min(1),
    attempt: z.number().int().nonnegative(),
  });

export type FathomRequestMediaDownloadPayload = z.infer<
  typeof fathomRequestMediaDownloadPayloadSchema
>;

export type FathomImportMediaDownloadPayload = z.infer<
  typeof fathomImportMediaDownloadPayloadSchema
>;
