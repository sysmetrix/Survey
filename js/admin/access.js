const KEY = "survey-v5-release-notes-access";
export const RELEASE_TAP_COUNT = 7;
export const hasReleaseAccess = () => { try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; } };
export const grantReleaseAccess = () => { try { sessionStorage.setItem(KEY, "1"); return true; } catch { return false; } };
export const revokeReleaseAccess = () => { try { sessionStorage.removeItem(KEY); } catch { /* unavailable */ } };
