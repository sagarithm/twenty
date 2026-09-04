import { createServer, type IncomingMessage, type Server } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { putFathomMediaBodyToUploadTarget } from 'src/logic-functions/utils/put-fathom-media-body-to-upload-target.util';

const openServers: Server[] = [];

const startUploadServer = async ({
  statusCode,
  onRequest,
}: {
  statusCode: number;
  onRequest?: (request: IncomingMessage) => Promise<void>;
}): Promise<string> => {
  const server = createServer(async (request, response) => {
    await onRequest?.(request);
    response.writeHead(statusCode);
    response.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  openServers.push(server);

  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('Upload test server did not bind a TCP port');
  }

  return `http://127.0.0.1:${address.port}/upload`;
};

const buildMediaBody = (bytes: number[]): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Uint8Array.from(bytes));
      controller.close();
    },
  });

afterEach(async () => {
  await Promise.all(
    openServers
      .splice(0)
      .map(
        async (server) =>
          await new Promise<void>((resolve, reject) =>
            server.close((error) =>
              error === undefined ? resolve() : reject(error),
            ),
          ),
      ),
  );
});

describe('putFathomMediaBodyToUploadTarget', () => {
  it('streams the media body to an upload target with its declared headers', async () => {
    const uploadedChunks: Buffer[] = [];
    const uploadUrl = await startUploadServer({
      statusCode: 200,
      onRequest: async (request) => {
        expect(request.headers['content-type']).toBe('video/mp4');
        expect(request.headers['content-length']).toBe('4');

        for await (const chunk of request) {
          uploadedChunks.push(Buffer.from(chunk));
        }
      },
    });

    await putFathomMediaBodyToUploadTarget({
      fileName: 'video.mp4',
      mediaDownloadBody: buildMediaBody([1, 2, 3, 4]),
      sizeBytes: 4,
      uploadTarget: { uploadUrl, contentType: 'video/mp4' },
    });

    expect(Buffer.concat(uploadedChunks)).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it('rejects a failed storage response', async () => {
    const uploadUrl = await startUploadServer({ statusCode: 500 });

    await expect(
      putFathomMediaBodyToUploadTarget({
        fileName: 'video.mp4',
        mediaDownloadBody: buildMediaBody([1, 2, 3, 4]),
        sizeBytes: 4,
        uploadTarget: { uploadUrl, contentType: 'video/mp4' },
      }),
    ).rejects.toThrow('upload of video.mp4 failed with status 500');
  });
});
