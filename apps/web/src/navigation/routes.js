import { HomeScreen } from "../screens/home/homeScreen.js";
import { SearchScreen } from "../screens/search/searchScreen.js";
import { DiscoverScreen } from "../screens/discover/discoverScreen.js";
import { DetailScreen } from "../screens/detail/detailScreen.js";
import { LibraryScreen } from "../screens/library/libraryScreen.js";
import { SourcesScreen } from "../screens/sources/sourcesScreen.js";
import { ProfilesScreen } from "../screens/profiles/profilesScreen.js";
import { StreamScreen } from "../screens/streams/streamScreen.js";
import { PlayerScreen } from "../screens/player/playerScreen.js";
import { AccountScreen } from "../screens/account/accountScreen.js";
import { AuthSignInScreen } from "../screens/account/authSignInScreen.js";
import { SyncCodeScreen } from "../screens/account/syncCodeScreen.js";
import { SettingsScreen } from "../screens/settings/settingsScreen.js";
import { CatalogScreen } from "../screens/catalog/catalogScreen.js";
import { FolderScreen } from "../screens/collection/folderScreen.js";
import { CastScreen } from "../screens/cast/castScreen.js";
import { ExperienceScreen } from "../screens/onboarding/experienceScreen.js";
import { SourceSetupScreen } from "../screens/onboarding/sourceSetupScreen.js";
import { TraktScreen } from "../screens/integrations/traktScreen.js";
import { DebugScreen, LicensesScreen, SupportersScreen } from "../screens/info/infoScreens.js";
import { TmdbScreen } from "../screens/integrations/tmdbScreen.js";
import { CatalogOrderScreen } from "../screens/catalog/catalogOrderScreen.js";
import { AuthQrScreen } from "../screens/account/authQrScreen.js";

export const routes = {
  home: HomeScreen,
  search: SearchScreen,
  discover: DiscoverScreen,
  detail: DetailScreen,
  library: LibraryScreen,
  plugins: SourcesScreen,
  profileSelection: ProfilesScreen,
  stream: StreamScreen,
  player: PlayerScreen,
  account: AccountScreen,
  authSignIn: AuthSignInScreen,
  authQrSignIn: AuthQrScreen,
  syncCode: SyncCodeScreen,
  settings: SettingsScreen,
  catalogSeeAll: CatalogScreen,
  folderDetail: FolderScreen,
  castDetail: CastScreen,
  experienceModeSelection: ExperienceScreen,
  essentialAddonSetup: SourceSetupScreen,
  trakt: TraktScreen,
  supportersContributors: SupportersScreen,
  licensesAttributions: LicensesScreen,
  debugConsole: DebugScreen,
  plugin: SourcesScreen,
  tmdbEntityBrowse: TmdbScreen,
  catalogOrder: CatalogOrderScreen
};
