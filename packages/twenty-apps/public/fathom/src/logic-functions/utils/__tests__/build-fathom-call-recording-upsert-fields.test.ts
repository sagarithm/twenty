import { describe, expect, it } from 'vitest';

import { buildFathomCallRecordingUpsertFields } from 'src/logic-functions/utils/build-fathom-call-recording-upsert-fields.util';

const buildFields = ({
  existingCallRecording,
  retryMedia = false,
}: {
  existingCallRecording?: {
    hasVideo: boolean;
    hasAudio: boolean;
    failureReason: string | undefined;
    downloadId: string | undefined;
    connectedAccountId: string | undefined;
  };
  retryMedia?: boolean;
} = {}) =>
  buildFathomCallRecordingUpsertFields({
    sharedFields: { transcript: [] },
    existingCallRecording,
    connectedAccountId: 'current-connected-account-id',
    retryMedia,
  });

describe('buildFathomCallRecordingUpsertFields', () => {
  it('creates new recordings in processing while media is pending', () => {
    expect(buildFields().createFields).toEqual({
      transcript: [],
      fathomConnectedAccountId: 'current-connected-account-id',
      status: 'PROCESSING',
    });
  });

  it('does not move an existing recording back to processing automatically', () => {
    expect(buildFields().updateFields).not.toHaveProperty('status');
  });

  it('does not request an automatic retry for settled media', () => {
    const fields = buildFields({
      existingCallRecording: {
        hasVideo: false,
        hasAudio: false,
        failureReason: 'download_forbidden',
        downloadId: undefined,
        connectedAccountId: 'connected-account-id',
      },
    });

    expect(fields.isMediaDownloadRequestNeeded).toBe(false);
  });

  it('reopens a settled failure only for an explicit media retry', () => {
    const fields = buildFields({
      retryMedia: true,
      existingCallRecording: {
        hasVideo: false,
        hasAudio: false,
        failureReason: 'download_forbidden',
        downloadId: undefined,
        connectedAccountId: 'previous-connected-account-id',
      },
    });

    expect(fields.updateFields).toEqual({
      transcript: [],
      status: 'PROCESSING',
      fathomConnectedAccountId: 'current-connected-account-id',
      fathomMediaDownloadId: null,
      fathomMediaUploadCheckpoint: null,
      fathomMediaFailureReason: null,
    });
    expect(fields.isMediaDownloadRequestNeeded).toBe(true);
  });

  it('keeps the owner of an active private Fathom download', () => {
    const fields = buildFields({
      existingCallRecording: {
        hasVideo: false,
        hasAudio: false,
        failureReason: undefined,
        downloadId: 'download-id',
        connectedAccountId: 'current-connected-account-id',
      },
    });

    expect(fields.updateFields).not.toHaveProperty('fathomConnectedAccountId');
    expect(fields.isMediaDownloadRequestNeeded).toBe(false);
  });

  it('replaces a download owned by another connection', () => {
    const fields = buildFields({
      existingCallRecording: {
        hasVideo: false,
        hasAudio: false,
        failureReason: undefined,
        downloadId: 'download-id',
        connectedAccountId: 'previous-connected-account-id',
      },
    });

    expect(fields.updateFields).toEqual({
      transcript: [],
      fathomConnectedAccountId: 'current-connected-account-id',
      fathomMediaDownloadId: null,
      fathomMediaUploadCheckpoint: null,
    });
    expect(fields.isMediaDownloadRequestNeeded).toBe(true);
  });
});
