import { isNonEmptyString, isUndefined } from '@sniptt/guards';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';

import { FATHOM_MEDIA_FILE_FOLDER } from 'src/constants/fathom.constant';
import { cancelFathomMediaDownloadBody } from 'src/logic-functions/utils/cancel-fathom-media-download-body.util';
import { putFathomMediaBodyToUploadTarget } from 'src/logic-functions/utils/put-fathom-media-body-to-upload-target.util';

type MediaUploadTarget = {
  fileId: string;
  uploadUrl: string;
  contentType: string;
};

export const uploadFathomMediaStream = async ({
  callRecordingId,
  fileName,
  fieldMetadataUniversalIdentifier,
  body,
  sizeBytes,
}: {
  callRecordingId: string;
  fileName: string;
  fieldMetadataUniversalIdentifier: string;
  body: ReadableStream<Uint8Array>;
  sizeBytes: number;
}): Promise<string> => {
  const metadataClient = new MetadataApiClient();
  const uploadTarget = await createFileUploadTarget({
    metadataClient,
    fileName,
    sizeBytes,
    fieldMetadataUniversalIdentifier,
  }).catch(async (error: unknown) => {
    await cancelFathomMediaDownloadBody({
      callRecordingId,
      fileName,
      body,
    });

    throw error;
  });

  await putFathomMediaBodyToUploadTarget({
    fileName,
    mediaDownloadBody: body,
    sizeBytes,
    uploadTarget,
  });

  return completeFileUpload({ metadataClient, fileId: uploadTarget.fileId });
};

const createFileUploadTarget = async ({
  metadataClient,
  fileName,
  sizeBytes,
  fieldMetadataUniversalIdentifier,
}: {
  metadataClient: Pick<InstanceType<typeof MetadataApiClient>, 'mutation'>;
  fileName: string;
  sizeBytes: number;
  fieldMetadataUniversalIdentifier: string;
}): Promise<MediaUploadTarget> => {
  const mutationResult = await metadataClient.mutation({
    createFileUpload: {
      __args: {
        filename: fileName,
        size: sizeBytes,
        fileFolder: FATHOM_MEDIA_FILE_FOLDER,
        fieldMetadataUniversalIdentifier,
      },
      fileId: true,
      uploadUrl: true,
      contentType: true,
    },
  });
  const uploadTarget = mutationResult.createFileUpload;

  if (
    isUndefined(uploadTarget) ||
    !isNonEmptyString(uploadTarget.fileId) ||
    !isNonEmptyString(uploadTarget.uploadUrl) ||
    !isNonEmptyString(uploadTarget.contentType)
  ) {
    throw new Error('createFileUpload mutation returned an invalid target');
  }

  return uploadTarget;
};

const completeFileUpload = async ({
  metadataClient,
  fileId,
}: {
  metadataClient: Pick<InstanceType<typeof MetadataApiClient>, 'mutation'>;
  fileId: string;
}): Promise<string> => {
  const mutationResult = await metadataClient.mutation({
    completeFileUpload: {
      __args: { fileId },
      id: true,
    },
  });
  const uploadedFileId = mutationResult.completeFileUpload?.id;

  if (!isNonEmptyString(uploadedFileId)) {
    throw new Error('completeFileUpload mutation did not return a file id');
  }

  return uploadedFileId;
};
