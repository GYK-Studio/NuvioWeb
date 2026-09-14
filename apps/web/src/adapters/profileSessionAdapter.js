import { ProfileManager } from "../../../../js/core/profile/profileManager.js";
import { StartupSyncService } from "../../../../js/core/profile/startupSyncService.js";
import { detailWatchedEnrichmentService } from "../../../../js/data/repository/detailWatchedEnrichmentService.js";
import { MemberAccessRepository } from "../../../../js/data/remote/supabase/memberAccessRepository.js";
import { I18n } from "../../../../js/i18n/index.js";
import { applyThemePreferences } from "./themeAdapter.js";

export async function activateProfile(profileId, { notifyPullCompleted = true } = {}) {
  await ProfileManager.setActiveProfile(profileId);
  StartupSyncService.enableProfileScopedSync();
  detailWatchedEnrichmentService.invalidateAllCache();
  await I18n.init();
  I18n.apply();
  applyThemePreferences();
  void MemberAccessRepository.getAccess().catch((error) => {
    console.warn("Profile member access refresh failed", error);
  });
  void StartupSyncService.requestSyncNow({ notifyPullCompleted }).catch((error) => {
    console.warn("Profile background sync failed", error);
  });
}
