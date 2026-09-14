import { RemoteClient } from "../../../../js/core/remote/remoteClient.js";

let client = null;

export function setupRemoteClient(router) {
  if (!client) client = new RemoteClient({ navigation: router });
  return client;
}

export function getRemoteClient() {
  return client;
}
