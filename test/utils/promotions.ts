import type { AsyncAPIService } from "#core/resolve/service.js";
import type { DocumentPromotions } from "#emitter/lower/components/survey.js";
import { surveyDocument } from "#emitter/lower/components/survey.js";

/**
 * The promotions of an empty document: every survey closed, nothing shared.
 *
 * A test that lowers one section on its own has no whole-document survey to
 * hand it, and a section lowered alone has nothing to share with. So this
 * answers "write the fragment itself" everywhere, which is what those tests
 * asserted before promotion existed.
 *
 * @returns Closed, empty surveys
 */
export function noPromotions(): DocumentPromotions {
  const service: AsyncAPIService = {
    info: { title: "Test", version: "0.0.0", tags: [], extensions: {} },
    servers: [],
    securitySchemes: [],
    messages: [],
    messageKeys: new Map(),
    channels: [],
    operations: [],
  };
  return surveyDocument(service, { claimDerived: () => true });
}
