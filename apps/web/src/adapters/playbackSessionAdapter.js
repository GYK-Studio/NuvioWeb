const KEY = "nuvio.web.playback-session";

export function savePlaybackSession(stream, context) {
  const session = {
    stream: {
      url: stream.url || "",
      externalUrl: stream.externalUrl || "",
      ytId: stream.ytId || "",
      name: stream.name || "",
      title: stream.title || "",
      description: stream.description || "",
      addonName: stream.addonName || "",
      qualityLabel: stream.qualityLabel || "",
      behaviorHints: stream.behaviorHints || null
    },
    context
  };
  sessionStorage.setItem(KEY, JSON.stringify(session));
  return session;
}

export function loadPlaybackSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
