export type RemoteSession = {
  paired: boolean;
  approved: boolean;
  online: boolean;
  active: boolean;
  synchronized: boolean;
  snapshot: any;
};
export const emptySession: RemoteSession = {
  paired: false,
  approved: false,
  online: false,
  active: false,
  synchronized: false,
  snapshot: null
};
// Authorization is independent of whether a video/catalog snapshot has arrived.
export function sessionEvent(s: RemoteSession, m: any): RemoteSession {
  switch (m.type) {
    case "paired":
      return { ...emptySession, paired: true };
    case "connected":
      return {
        ...s,
        paired: true,
        synchronized: m.approved === undefined ? s.synchronized : false,
        approved: m.approved ?? s.approved,
        active: m.controlActive ?? s.active,
        online: m.webOnline !== false
      };
    case "approved":
      return {
        ...s,
        paired: true,
        approved: true,
        active: m.controlActive !== false,
        online: m.webOnline !== false
      };
    case "session.snapshot":
      return {
        ...s,
        paired: true,
        approved: true,
        active: m.controlActive !== false,
        online: m.webOnline !== false,
        snapshot: m.state ?? s.snapshot,
        synchronized: m.webOnline !== false
      };
    case "control.changed":
      return { ...s, active: m.controlActive === true };
    case "offline":
      return { ...s, online: false, synchronized: false };
    case "suspended":
      return { ...s, approved: false, active: false, synchronized: false, snapshot: null };
    case "revoked":
    case "forgotten":
      return { ...emptySession };
    default:
      return s;
  }
}
