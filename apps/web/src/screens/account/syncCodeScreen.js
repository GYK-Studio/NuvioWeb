import { accountState, clearSyncCode, setSyncCode } from "../../adapters/accountAdapter.js";
import { escapeHtml } from "../../components/media/mediaCard.js";

export const SyncCodeScreen = {
  async mount({ outlet, router }) {
    outlet.className = "page-host interior-page account-page";
    const render = () => {
      const current = accountState().syncCode;
      outlet.innerHTML = `<header class="page-heading"><p>ACCOUNT SYNC</p><h1>Manual sync code</h1></header><form class="account-panel sync-form"><label>Sync code<input name="code" autocomplete="off" value="${escapeHtml(current)}" placeholder="Enter a code"></label><p>Your code is stored locally and used by the existing Nuvio sync infrastructure.</p><div><button class="button button--primary" type="submit">Save</button><button class="button button--glass" type="button" data-clear>Clear</button><button class="button button--glass" type="button" data-back>Back</button></div></form>`;
    };
    render();
    outlet.addEventListener("submit", (event) => {
      event.preventDefault();
      setSyncCode(new FormData(event.target).get("code"));
      render();
    });
    outlet.addEventListener("click", (event) => {
      if (event.target.closest("[data-back]")) router.back();
      if (event.target.closest("[data-clear]")) {
        clearSyncCode();
        render();
      }
    });
  }
};
