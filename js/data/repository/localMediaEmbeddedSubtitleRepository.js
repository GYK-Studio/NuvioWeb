import { requestBrowserLocalService as requestWebOsCompanionService } from "../../platform/browserServices.js";

const REQUEST_TIMEOUT_MS = 60000;

function withTimeout(
  promise,
  timeoutMs,
  timeoutMessage = "webOS embedded subtitle request timed out"
) {
  let timeoutId = 0;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

function getRequestErrorMessage(error, fallback) {
  return String(error?.errorText || error?.message || error?.errorCode || fallback);
}

function createRequestError(error, fallback) {
  const wrapped = new Error(getRequestErrorMessage(error, fallback));
  if (error?.errorCode != null) {
    wrapped.code = String(error.errorCode);
  }
  if (error?.errorDetails != null) {
    wrapped.details = error.errorDetails;
  }
  return wrapped;
}

export const localMediaEmbeddedSubtitleRepository = {
  async getWindow({ url, trackNumber, startSeconds, endSeconds, includeAssBody = false }) {
    const targetUrl = String(url || "").trim();
    const targetTrack = Math.trunc(Number(trackNumber));
    const hasTrackNumber = Number.isFinite(targetTrack) && targetTrack > 0;
    if (!/^https?:\/\//i.test(targetUrl) || !hasTrackNumber) {
      throw new Error("Invalid embedded text subtitle request");
    }

    let result;
    try {
      result = await withTimeout(
        requestWebOsCompanionService({
          method: "embeddedSubtitleTextWindow",
          parameters: {
            url: targetUrl,
            trackNumber: targetTrack,
            startSeconds: Math.max(0, Number(startSeconds) || 0),
            endSeconds: Math.max(1, Number(endSeconds) || 0),
            includeAssBody: Boolean(includeAssBody)
          }
        }),
        REQUEST_TIMEOUT_MS
      );
    } catch (error) {
      throw createRequestError(error, "Embedded text subtitle extraction failed");
    }

    const payload = result?.payload || result || {};
    if (payload.returnValue === false) {
      throw createRequestError(payload, "Embedded text subtitle extraction failed");
    }
    if (payload.bodyTruncated) {
      throw new Error("Embedded text subtitle response is too large");
    }
    const body = String(payload.body || "");
    if (!body.trim()) {
      throw new Error("Embedded text subtitle response is empty");
    }

    return {
      format: String(payload.format || "vtt").toLowerCase(),
      trackNumber:
        Number.isFinite(Number(payload.trackNumber)) && Number(payload.trackNumber) > 0
          ? Math.trunc(Number(payload.trackNumber))
          : targetTrack,
      codecId: String(payload.codecId || ""),
      language: String(payload.language || ""),
      name: String(payload.name || ""),
      windowStartSeconds: Math.max(0, Number(payload.windowStartSeconds) || 0),
      windowEndSeconds: Math.max(0, Number(payload.windowEndSeconds) || 0),
      contextStartSeconds: Math.max(0, Number(payload.contextStartSeconds) || 0),
      cueCount: Math.max(0, Math.trunc(Number(payload.cueCount) || 0)),
      hasAssOverrideTags: Boolean(payload.hasAssOverrideTags),
      hasAdvancedAssOverrideTags: Boolean(payload.hasAdvancedAssOverrideTags),
      assBody: String(payload.assBody || ""),
      body
    };
  }
};
