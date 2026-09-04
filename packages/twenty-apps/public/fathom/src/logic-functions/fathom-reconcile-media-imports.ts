import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction } from 'twenty-sdk/define';

import { FATHOM_MEDIA_RECONCILIATION_CRON_PATTERN } from 'src/constants/fathom.constant';
import { FATHOM_RECONCILE_MEDIA_IMPORTS_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { buildRetryableFathomError } from 'src/logic-functions/utils/build-retryable-fathom-error.util';
import { reconcileFathomMediaImports } from 'src/logic-functions/utils/reconcile-fathom-media-imports.util';

export const fathomReconcileMediaImportsHandler = async () => {
  try {
    return await reconcileFathomMediaImports({
      coreApiClient: new CoreApiClient({ runAs: 'application' }),
      now: new Date(),
    });
  } catch (error) {
    throw buildRetryableFathomError({
      operation: 'media import reconciliation',
      error,
    });
  }
};

export default defineLogicFunction({
  universalIdentifier: FATHOM_RECONCILE_MEDIA_IMPORTS_UNIVERSAL_IDENTIFIER,
  name: 'fathom-reconcile-media-imports',
  description:
    'Finds stale Fathom media imports, completes settled recordings, and resumes missing download work.',
  timeoutSeconds: 300,
  handler: fathomReconcileMediaImportsHandler,
  cronTriggerSettings: {
    pattern: FATHOM_MEDIA_RECONCILIATION_CRON_PATTERN,
  },
});
