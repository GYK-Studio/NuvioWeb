import {
  SUPPORTERS_API_BASE_URL,
  SPONSOR_NAMES,
  UNIQUE_CONTRIBUTIONS_BASE_URL
} from "../../../../../js/config.js";
import {
  normalizeContributors,
  normalizeSupporterMembers,
  parseSponsorNames
} from "../../../../../js/core/supporters/supportersData.js";
import { escapeHtml } from "../../components/media/mediaCard.js";
import { emptyState } from "../../components/feedback/pageState.js";

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

export const SupportersScreen = {
  async mount({ outlet, router }) {
    outlet.className = "page-host interior-page people-page";
    outlet.innerHTML = `<div class="result-loading"><i></i><span>Loading community…</span></div>`;
    const [supporters, contributors] = await Promise.allSettled([
      json(`${String(SUPPORTERS_API_BASE_URL).replace(/\/$/, "")}/api/supporters/wall`).then(
        (data) => normalizeSupporterMembers(data?.top?.members)
      ),
      UNIQUE_CONTRIBUTIONS_BASE_URL
        ? json(
            `${String(UNIQUE_CONTRIBUTIONS_BASE_URL).replace(/\/$/, "")}/api/unique-contributions`
          ).then((data) => normalizeContributors(data?.contributors))
        : Promise.resolve([])
    ]);
    const groups = [
      { title: "Supporters", items: supporters.status === "fulfilled" ? supporters.value : [] },
      { title: "Sponsors", items: parseSponsorNames(SPONSOR_NAMES) },
      {
        title: "Contributors",
        items: contributors.status === "fulfilled" ? contributors.value : []
      }
    ];
    outlet.innerHTML = `<header class="page-heading page-heading--split"><div><p>NUVIO COMMUNITY</p><h1>Supporters & contributors</h1></div><button class="button button--glass" data-back>← Back</button></header>${groups
      .map(
        (group) =>
          `<section class="people-group"><h2>${group.title}</h2>${
            group.items.length
              ? `<div class="people-grid">${group.items
                  .map(
                    (person) =>
                      `<article>${person.avatarUrl ? `<img src="${escapeHtml(person.avatarUrl)}" alt="">` : `<span>${escapeHtml(person.name?.[0] || "N")}</span>`}<b>${escapeHtml(person.name)}</b><small>${escapeHtml(person.membershipLevel || (person.totalContributions ? `${person.totalContributions} contributions` : "Nuvio supporter"))}</small></article>`
                  )
                  .join("")}</div>`
              : emptyState(
                  `No ${group.title.toLowerCase()} available`,
                  "This list is currently empty or unavailable."
                )
          }</section>`
      )
      .join("")}`;
    outlet.querySelector("[data-back]").addEventListener("click", () => router.back());
  }
};

export const LicensesScreen = {
  async mount({ outlet, router }) {
    outlet.className = "page-host interior-page legal-page";
    const license = await fetch("/LICENSE")
      .then((response) => response.text())
      .catch(() => "License text unavailable.");
    outlet.innerHTML = `<header class="page-heading page-heading--split"><div><p>OPEN SOURCE</p><h1>Licenses & attributions</h1></div><button class="button button--glass" data-back>← Back</button></header><article class="legal-copy"><h2>Nuvio</h2><pre>${escapeHtml(license)}</pre><p>Additional dependency notices remain available with their installed packages and bundled assets.</p></article>`;
    outlet.querySelector("[data-back]").addEventListener("click", () => router.back());
  }
};

export const DebugScreen = {
  async mount({ outlet, router }) {
    outlet.className = "page-host interior-page debug-page";
    const diagnostics = {
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      language: navigator.language,
      route: location.hash,
      storageKeys: localStorage.length
    };
    outlet.innerHTML = `<header class="page-heading page-heading--split"><div><p>INTERNAL / DEBUG</p><h1>Runtime diagnostics</h1></div><button class="button button--glass" data-back>← Back</button></header><pre class="diagnostic-copy">${escapeHtml(JSON.stringify(diagnostics, null, 2))}</pre>`;
    outlet.querySelector("[data-back]").addEventListener("click", () => router.back());
  }
};
