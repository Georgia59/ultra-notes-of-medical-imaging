const state = {
  manifest: null,
  pages: [],
  activePage: null,
  activeAnchor: "",
  searchIndex: [],
};

const elements = {
  article: document.querySelector("#article"),
  pageTitle: document.querySelector("#pageTitle"),
  pageCategory: document.querySelector("#pageCategory"),
  pageDescription: document.querySelector("#pageDescription"),
  chapterNavigation: document.querySelector("#chapterNavigation"),
  outlineNavigation: document.querySelector("#outlineNavigation"),
  diseaseSelect: document.querySelector("#diseaseSelect"),
  globalSearch: document.querySelector("#globalSearch"),
  searchPanel: document.querySelector("#searchPanel"),
  searchResults: document.querySelector("#searchResults"),
  scrim: document.querySelector("#scrim"),
  sidebar: document.querySelector("#sidebar"),
};

marked.setOptions({ gfm: true, breaks: false });

function flattenPages(manifest) {
  return manifest.chapters.flatMap((chapter) =>
    chapter.pages.map((page) => ({ ...page, chapter }))
  );
}

function diseaseItems(page) {
  return (page.diseases || []).map((item) =>
    typeof item === "string" ? { title: item, anchor: "" } : item
  );
}

function routeFor(page, anchor = "") {
  const params = new URLSearchParams({ page: page.id });
  if (anchor) params.set("anchor", anchor);
  return `#${params.toString()}`;
}

function parseRoute() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  return {
    pageId: params.get("page"),
    anchor: params.get("anchor") || "",
  };
}

function renderNavigation() {
  elements.chapterNavigation.innerHTML = state.manifest.chapters
    .map(
      (chapter) => `
        <section class="chapter-block" data-chapter="${chapter.number}">
          <button class="chapter-toggle" type="button">
            <span><span class="chapter-number">${chapter.number}</span>${chapter.title}</span>
            <span class="chapter-arrow">⌄</span>
          </button>
          <div class="chapter-pages">
            ${chapter.pages
              .map(
                (page) => `
                  <a class="page-link" data-page-id="${page.id}" href="${routeFor(page)}">
                    ${page.title}
                  </a>`
              )
              .join("")}
          </div>
        </section>`
    )
    .join("");

  document.querySelectorAll(".chapter-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".chapter-block").classList.toggle("collapsed");
    });
  });
}

function renderDiseaseSelect() {
  const options = [];
  state.manifest.chapters.forEach((chapter) => {
    options.push(`<optgroup label="第${chapter.number}章 ${chapter.title}">`);
    chapter.pages.forEach((page) => {
      const diseases = diseaseItems(page);
      if (diseases.length <= 1) {
        options.push(`<option value="${routeFor(page)}">${page.title}</option>`);
      } else {
        diseases.forEach((disease) => {
          options.push(
            `<option value="${routeFor(page, disease.anchor)}">${disease.title}</option>`
          );
        });
      }
    });
    options.push("</optgroup>");
  });
  elements.diseaseSelect.innerHTML = options.join("");
  elements.diseaseSelect.addEventListener("change", (event) => {
    location.hash = event.target.value.slice(1);
  });
}

function stripFrontMatter(markdown) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

function slugifyHeading(text, index) {
  const normalized = text
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return normalized || `section-${index}`;
}

function prepareRenderedHeadings() {
  const headings = [...elements.article.querySelectorAll("h2, h3")];
  const used = new Set();
  headings.forEach((heading, index) => {
    if (!heading.id) {
      let id = slugifyHeading(heading.textContent, index);
      let suffix = 2;
      while (used.has(id) || document.getElementById(id)) {
        id = `${id}-${suffix++}`;
      }
      heading.id = id;
    }
    used.add(heading.id);
  });
  return headings;
}

function renderOutline() {
  const headings = prepareRenderedHeadings();
  elements.outlineNavigation.innerHTML = headings
    .map(
      (heading) =>
        `<a class="outline-link level-${heading.tagName.slice(1)}" data-anchor="${heading.id}" href="${routeFor(
          state.activePage,
          heading.id
        )}">${heading.textContent}</a>`
    )
    .join("");
}

function updateActiveOutline(anchor) {
  elements.outlineNavigation.querySelectorAll(".outline-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.anchor === anchor);
  });
}

function scrollToElementImmediately(target) {
  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  target.scrollIntoView({ block: "start" });
  requestAnimationFrame(() => {
    root.style.scrollBehavior = previousScrollBehavior;
  });
}

function updateActiveNavigation() {
  document.querySelectorAll(".page-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.pageId === state.activePage?.id);
  });
  const selectedRoute = routeFor(state.activePage, state.activeAnchor);
  if ([...elements.diseaseSelect.options].some((option) => option.value === selectedRoute)) {
    elements.diseaseSelect.value = selectedRoute;
  } else {
    const pageRoute = routeFor(state.activePage);
    const pageOption = [...elements.diseaseSelect.options].find(
      (option) =>
        option.value === pageRoute ||
        option.value.startsWith(`${pageRoute}&anchor=`)
    );
    if (pageOption) elements.diseaseSelect.value = pageOption.value;
  }
}

async function loadPage(page, anchor = "") {
  if (!page) return;
  state.activePage = page;
  state.activeAnchor = anchor;
  elements.article.setAttribute("aria-busy", "true");
  elements.pageTitle.textContent = page.title;
  elements.pageCategory.textContent = `第 ${page.chapter.number} 章 · ${page.chapter.title}`;
  elements.pageDescription.textContent = diseaseItems(page)
    .map((item) => item.title)
    .join(" · ");

  const response = await fetch(`content/${encodeURI(page.path)}`);
  if (!response.ok) throw new Error(`无法载入 ${page.path}`);
  const markdown = stripFrontMatter(await response.text());
  elements.article.innerHTML = marked.parse(markdown);
  elements.article.setAttribute("aria-busy", "false");
  renderOutline();
  updateActiveNavigation();
  document.title = `${page.title} · Ultra Notes`;

  requestAnimationFrame(() => {
    if (anchor) {
      document.getElementById(anchor)?.scrollIntoView({ block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  });
}

function createSearchIndex() {
  state.searchIndex = [];
  state.pages.forEach((page) => {
    const diseases = diseaseItems(page);
    state.searchIndex.push({
      title: page.title,
      subtitle: `第${page.chapter.number}章 · ${page.chapter.title}`,
      keywords: `${page.title} ${diseases.map((item) => item.title).join(" ")}`,
      route: routeFor(page),
    });
    diseases.forEach((disease) => {
      if (disease.title === page.title) return;
      state.searchIndex.push({
        title: disease.title,
        subtitle: page.title,
        keywords: `${disease.title} ${page.title}`,
        route: routeFor(page, disease.anchor),
      });
    });
  });
}

function renderSearch(query) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    closeSearch();
    return;
  }
  const results = state.searchIndex
    .filter((item) => item.keywords.toLowerCase().includes(keyword))
    .slice(0, 18);
  elements.searchResults.innerHTML = results.length
    ? results
        .map(
          (item) => `
            <a class="search-result" href="${item.route}">
              <strong>${item.title}</strong>
              <span>${item.subtitle}</span>
            </a>`
        )
        .join("")
    : `<div class="empty-search">没有找到“${query}”</div>`;
  elements.searchPanel.hidden = false;
  elements.scrim.hidden = false;
}

function closeSearch() {
  elements.searchPanel.hidden = true;
  if (!elements.sidebar.classList.contains("open")) elements.scrim.hidden = true;
}

function openMobileMenu() {
  elements.sidebar.classList.add("open");
  elements.scrim.hidden = false;
}

function closeMobileMenu() {
  elements.sidebar.classList.remove("open");
  if (elements.searchPanel.hidden) elements.scrim.hidden = true;
}

function setupInteractions() {
  elements.globalSearch.addEventListener("input", (event) => renderSearch(event.target.value));
  elements.searchResults.addEventListener("click", () => {
    elements.globalSearch.value = "";
    closeSearch();
  });
  elements.outlineNavigation.addEventListener("click", (event) => {
    const link = event.target.closest(".outline-link");
    if (!link) return;
    event.preventDefault();

    const anchor = link.dataset.anchor;
    const target = document.getElementById(anchor);
    if (!target) return;

    state.activeAnchor = anchor;
    updateActiveOutline(anchor);
    history.replaceState(null, "", routeFor(state.activePage, anchor));
    scrollToElementImmediately(target);
  });
  document.querySelector("#closeSearchButton").addEventListener("click", closeSearch);
  document.querySelector("#menuButton").addEventListener("click", openMobileMenu);
  document.querySelector("#closeMenuButton").addEventListener("click", closeMobileMenu);
  elements.scrim.addEventListener("click", () => {
    closeSearch();
    closeMobileMenu();
  });
  elements.chapterNavigation.addEventListener("click", (event) => {
    if (event.target.closest(".page-link")) closeMobileMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== elements.globalSearch) {
      event.preventDefault();
      elements.globalSearch.focus();
    }
    if (event.key === "Escape") {
      closeSearch();
      closeMobileMenu();
    }
  });

  const savedTheme = localStorage.getItem("ultra-notes-theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  document.querySelector("#themeButton").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("ultra-notes-theme", next);
  });

  document.querySelector("#focusButton").addEventListener("click", () => {
    document.body.classList.toggle("focus-mode");
  });
  document.querySelector("#outlineButton").addEventListener("click", () => {
    document.querySelector("#pageOutline").scrollIntoView({ block: "start" });
  });
}

async function handleRoute() {
  const route = parseRoute();
  const page = state.pages.find((item) => item.id === route.pageId) || state.pages[0];
  await loadPage(page, route.anchor);
}

async function initialize() {
  try {
    const response = await fetch("content/manifest.json");
    state.manifest = await response.json();
    state.pages = flattenPages(state.manifest);
    renderNavigation();
    renderDiseaseSelect();
    createSearchIndex();
    setupInteractions();
    window.addEventListener("hashchange", handleRoute);
    await handleRoute();
  } catch (error) {
    elements.article.innerHTML = `
      <h2>页面载入失败</h2>
      <p>${error.message}</p>
      <p>请通过本地服务器或 GitHub Pages 打开本站。</p>`;
    console.error(error);
  }
}

initialize();
