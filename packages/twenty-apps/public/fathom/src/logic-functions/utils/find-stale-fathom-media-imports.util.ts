import { isNonEmptyString } from '@sniptt/guards';
import { type CoreApiClient } from 'twenty-client-sdk/core';
import { isDefined } from 'src/utils/is-defined';

import {
  FATHOM_MEDIA_RECONCILIATION_GRACE_PERIOD_MILLISECONDS,
  FATHOM_MEDIA_RECONCILIATION_MAX_PAGE_COUNT,
  FATHOM_MEDIA_RECONCILIATION_PAGE_SIZE,
} from 'src/constants/fathom.constant';
import { fathomMediaReconciliationQueryResultSchema } from 'src/logic-functions/schemas/fathom-media-reconciliation-query-result.schema';
import { type FathomMediaReconciliationCandidate } from 'src/logic-functions/types/fathom-media-reconciliation-plan.type';
import { mapCallRecordingMediaState } from 'src/logic-functions/utils/map-call-recording-media-state.util';

export const findStaleFathomMediaImports = async ({
  coreApiClient,
  now,
  activeConnectedAccountIds,
}: {
  coreApiClient: Pick<CoreApiClient, 'query'>;
  now: Date;
  activeConnectedAccountIds: string[];
}): Promise<FathomMediaReconciliationCandidate[]> => {
  if (activeConnectedAccountIds.length === 0) {
    return [];
  }

  const staleBefore = new Date(
    now.getTime() - FATHOM_MEDIA_RECONCILIATION_GRACE_PERIOD_MILLISECONDS,
  ).toISOString();
  const callRecordings: FathomMediaReconciliationCandidate[] = [];
  let cursor: string | undefined;

  for (
    let pageIndex = 0;
    pageIndex < FATHOM_MEDIA_RECONCILIATION_MAX_PAGE_COUNT;
    pageIndex += 1
  ) {
    const queryResult = await coreApiClient.query({
      callRecordings: {
        __args: {
          filter: {
            fathomConnectedAccountId: { in: activeConnectedAccountIds },
            updatedAt: { lte: staleBefore },
            or: [
              { status: { eq: 'PROCESSING' } },
              {
                fathomMediaFailureReason: { is: 'NULL' },
                video: { is: 'NULL' },
                audio: { is: 'NULL' },
              },
            ],
          },
          first: FATHOM_MEDIA_RECONCILIATION_PAGE_SIZE,
          orderBy: [{ updatedAt: 'AscNullsLast' }],
          ...(isNonEmptyString(cursor) ? { after: cursor } : {}),
        },
        pageInfo: { hasNextPage: true, endCursor: true },
        edges: {
          node: {
            id: true,
            externalRecordingId: true,
            video: { fileId: true },
            audio: { fileId: true },
            fathomMediaFailureReason: true,
            fathomConnectedAccountId: true,
            fathomMediaDownloadId: true,
            transcript: true,
            status: true,
            updatedAt: true,
          },
        },
      },
    });
    const parsedQueryResult =
      fathomMediaReconciliationQueryResultSchema.parse(queryResult);
    const connection = parsedQueryResult.callRecordings;

    if (!isDefined(connection)) {
      return callRecordings;
    }

    callRecordings.push(
      ...connection.edges.map(({ node }) => ({
        ...mapCallRecordingMediaState(node),
        status: node.status,
        updatedAt: node.updatedAt,
      })),
    );

    if (!connection.pageInfo.hasNextPage) {
      return callRecordings;
    }

    if (!isNonEmptyString(connection.pageInfo.endCursor)) {
      throw new Error(
        'Fathom media reconciliation page has no continuation cursor',
      );
    }

    cursor = connection.pageInfo.endCursor;
  }

  console.warn(
    `[fathom] media reconciliation stopped after ${FATHOM_MEDIA_RECONCILIATION_MAX_PAGE_COUNT} pages`,
  );

  return callRecordings;
};
