export function loadingHome() {
  return `<section class="home-skeleton" aria-label="Loading"><div class="home-skeleton__hero"></div>${[0, 1, 2].map(() => `<div class="home-skeleton__row"><i></i><div>${[0, 1, 2, 3, 4, 5].map(() => "<b></b>").join("")}</div></div>`).join("")}</section>`;
}

export function emptyState(title, message, action = "Retry") {
  return `<section class="empty-state"><span>NUVIO</span><h1>${title}</h1><p>${message}</p><button data-retry>${action}</button></section>`;
}
