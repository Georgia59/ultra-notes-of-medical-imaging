const state = {
  manifest: null,
  pages: [],
  activePage: null,
  activeAnchor: "",
  searchIndex: [],
  fullTextSearchIndex: [],
  fullTextSearchPromise: null,
  fullTextSearchReady: false,
  fullTextSearchFailures: 0,
  markdownCache: new Map(),
  notes: {},
  noteSaveTimer: null,
  favoriteDiseases: new Set(),
  collapsedChapters: new Set(),
};

const NOTES_STORAGE_KEY = "ultra-notes-user-notes-v1";
const FAVORITE_DISEASES_STORAGE_KEY = "ultra-notes-favorite-diseases-v1";

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
  searchStatus: document.querySelector("#searchStatus"),
  searchResults: document.querySelector("#searchResults"),
  scrim: document.querySelector("#scrim"),
  sidebar: document.querySelector("#sidebar"),
  notesPanel: document.querySelector("#notesPanel"),
  notesEditor: document.querySelector("#notesEditor"),
  notesPageTitle: document.querySelector("#notesPageTitle"),
  notesSaveStatus: document.querySelector("#notesSaveStatus"),
  notesCharacterCount: document.querySelector("#notesCharacterCount"),
  notesScrim: document.querySelector("#notesScrim"),
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

function diseaseKey(page, index) {
  return `${page.id}:${index}`;
}

function diseaseAnchor(page, disease, index, diseaseCount) {
  if (diseaseCount <= 1) return "";
  return disease.anchor || `${page.id}-disease-${index + 1}`;
}

function routeForDisease(page, disease, index, diseaseCount) {
  return routeFor(page, diseaseAnchor(page, disease, index, diseaseCount));
}

function allDiseases() {
  return state.manifest.chapters.flatMap((chapter) =>
    chapter.pages.flatMap((page) => {
      const diseases = diseaseItems(page);
      return diseases.map((disease, index) => ({
        ...disease,
        chapter,
        page,
        index,
        key: diseaseKey(page, index),
        route: routeForDisease(page, disease, index, diseases.length),
      }));
    })
  );
}

function renderDiseaseRow(page, disease, index, diseaseCount) {
  const key = diseaseKey(page, index);
  const isFavorite = state.favoriteDiseases.has(key);
  const anchor = diseaseAnchor(page, disease, index, diseaseCount);
  return `
    <div class="disease-nav-row">
      <a
        class="page-link disease-link"
        data-page-id="${page.id}"
        data-anchor="${anchor}"
        href="${routeForDisease(page, disease, index, diseaseCount)}"
      >${disease.title}</a>
      <button
        class="disease-favorite${isFavorite ? " active" : ""}"
        type="button"
        data-favorite-disease="${key}"
        aria-label="${isFavorite ? "取消收藏" : "收藏"}${disease.title}"
        aria-pressed="${isFavorite}"
        title="${isFavorite ? "取消收藏" : "收藏疾病"}"
      >${isFavorite ? "&#9733;" : "&#9734;"}</button>
    </div>`;
}

function renderNavigation() {
  const favoriteDiseases = allDiseases().filter((disease) =>
    state.favoriteDiseases.has(disease.key)
  );
  const favoriteNavigation = favoriteDiseases.length
    ? `
      <section class="favorite-diseases" aria-label="已收藏疾病">
        <div class="favorite-diseases-title">已收藏疾病</div>
        <div class="favorite-diseases-list">
          ${favoriteDiseases
            .map(
              (disease) => `
                <a class="favorite-disease-link" href="${disease.route}">
                  <span aria-hidden="true">&#9733;</span>
                  <span>${disease.title}</span>
                </a>`
            )
            .join("")}
        </div>
      </section>`
    : "";

  const chapterNavigation = state.manifest.chapters
    .map(
      (chapter) => `
        <section class="chapter-block${
          state.collapsedChapters.has(String(chapter.number)) ? " collapsed" : ""
        }" data-chapter="${chapter.number}">
          <button class="chapter-toggle" type="button" aria-expanded="${
            !state.collapsedChapters.has(String(chapter.number))
          }">
            <span class="chapter-label">
              <span class="chapter-number">${chapter.number}</span>
              <span>${chapter.title}</span>
            </span>
            <span class="chapter-arrow" aria-hidden="true">⌄</span>
          </button>
          <div class="chapter-pages">
            ${chapter.pages
              .map((page) => {
                const diseases = diseaseItems(page);
                if (diseases.length <= 1) {
                  const disease = diseases[0] || { title: page.title, anchor: "" };
                  return renderDiseaseRow(page, disease, 0, 1);
                }
                return `
                  <div class="disease-page-group">
                    <a class="disease-page-title" data-page-id="${page.id}" href="${routeFor(
                      page
                    )}">${page.title}</a>
                    ${diseases
                      .map((disease, index) =>
                        renderDiseaseRow(page, disease, index, diseases.length)
                      )
                      .join("")}
                  </div>`;
              })
              .join("")}
          </div>
        </section>`
    )
    .join("");

  elements.chapterNavigation.innerHTML = favoriteNavigation + chapterNavigation;
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
        diseases.forEach((disease, index) => {
          options.push(
            `<option value="${routeForDisease(page, disease, index, diseases.length)}">${
              disease.title
            }</option>`
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

function assignHeadingIds(container, page) {
  const currentDiseases = diseaseItems(page);
  if (currentDiseases.length > 1) {
    const diseaseHeadings = [...container.querySelectorAll("h2")];
    currentDiseases.forEach((disease, index) => {
      const heading = diseaseHeadings.find((candidate) =>
        candidate.textContent.includes(disease.title)
      );
      if (heading) {
        heading.id = diseaseAnchor(page, disease, index, currentDiseases.length);
      }
    });
  }

  const headings = [...container.querySelectorAll("h2, h3")];
  const used = new Set();
  headings.forEach((heading, index) => {
    if (!heading.id) {
      let id = slugifyHeading(heading.textContent, index);
      let suffix = 2;
      while (used.has(id)) {
        id = `${id}-${suffix++}`;
      }
      heading.id = id;
    }
    used.add(heading.id);
  });
  return headings;
}

function renderOutline() {
  const headings = assignHeadingIds(elements.article, state.activePage);
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

function currentNote() {
  return state.activePage ? state.notes[state.activePage.id] : null;
}

function loadNotesFromStorage() {
  try {
    state.notes = JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || "{}");
  } catch {
    state.notes = {};
  }
}

function loadFavoriteDiseasesFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITE_DISEASES_STORAGE_KEY) || "[]");
    state.favoriteDiseases = new Set(Array.isArray(saved) ? saved.map(String) : []);
  } catch {
    state.favoriteDiseases = new Set();
  }
}

function toggleFavoriteDisease(key) {
  if (state.favoriteDiseases.has(key)) {
    state.favoriteDiseases.delete(key);
  } else {
    state.favoriteDiseases.add(key);
  }

  try {
    localStorage.setItem(
      FAVORITE_DISEASES_STORAGE_KEY,
      JSON.stringify([...state.favoriteDiseases])
    );
  } catch {
    // The current choice still works for this session when browser storage is unavailable.
  }
  renderNavigation();
  updateActiveNavigation();
}

function formatNoteTime(timestamp) {
  if (!timestamp) return "尚未记录";
  return `已保存 ${new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp))}`;
}

function updateNoteIndicators() {
  const hasNote = Boolean(currentNote()?.text.trim());
  document.querySelectorAll(".notes-button, .notes-fab").forEach((button) => {
    button.classList.toggle("has-note", hasNote);
  });
}

function renderCurrentNote() {
  if (!state.activePage) return;
  const note = currentNote();
  elements.notesPageTitle.textContent = state.activePage.title;
  elements.notesEditor.value = note?.text || "";
  elements.notesCharacterCount.textContent = `${elements.notesEditor.value.length} 字`;
  elements.notesSaveStatus.textContent = formatNoteTime(note?.updatedAt);
  updateNoteIndicators();
}

function persistCurrentNote() {
  if (!state.activePage) return;
  clearTimeout(state.noteSaveTimer);
  state.noteSaveTimer = null;

  const text = elements.notesEditor.value;
  if (text.trim()) {
    state.notes[state.activePage.id] = {
      text,
      updatedAt: new Date().toISOString(),
      pageTitle: state.activePage.title,
      chapterTitle: `第${state.activePage.chapter.number}章 ${state.activePage.chapter.title}`,
    };
  } else {
    delete state.notes[state.activePage.id];
  }

  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(state.notes));
    elements.notesSaveStatus.textContent = text.trim()
      ? formatNoteTime(state.notes[state.activePage.id].updatedAt)
      : "尚未记录";
  } catch {
    elements.notesSaveStatus.textContent = "保存失败：浏览器存储不可用";
  }
  updateNoteIndicators();
}

function scheduleNoteSave() {
  clearTimeout(state.noteSaveTimer);
  elements.notesSaveStatus.textContent = "正在保存…";
  elements.notesCharacterCount.textContent = `${elements.notesEditor.value.length} 字`;
  state.noteSaveTimer = setTimeout(persistCurrentNote, 350);
}

function openNotes() {
  renderCurrentNote();
  elements.notesPanel.classList.add("open");
  elements.notesPanel.setAttribute("aria-hidden", "false");
  elements.notesScrim.hidden = false;
  setTimeout(() => elements.notesEditor.focus(), 180);
}

function closeNotes() {
  if (!elements.notesPanel.classList.contains("open")) return;
  persistCurrentNote();
  elements.notesPanel.classList.remove("open");
  elements.notesPanel.setAttribute("aria-hidden", "true");
  elements.notesScrim.hidden = true;
}

function safeFilename(value) {
  return value.replace(/[\\/:*?"<>|]/g, "-");
}

function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCurrentNote() {
  persistCurrentNote();
  const note = currentNote();
  if (!note?.text.trim()) return;
  downloadText(
    `${safeFilename(state.activePage.title)}-个人笔记.md`,
    `# ${state.activePage.title}个人笔记\n\n${note.text}\n`
  );
}

function exportAllNotes() {
  persistCurrentNote();
  const entries = Object.values(state.notes).filter((note) => note.text.trim());
  if (!entries.length) return;
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: state.notes,
  };
  downloadText(
    `ultra-notes-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(backup, null, 2),
    "application/json;charset=utf-8"
  );
}

function clearCurrentNote() {
  if (!elements.notesEditor.value.trim()) return;
  if (!window.confirm(`确定清空“${state.activePage.title}”的个人笔记吗？`)) return;
  elements.notesEditor.value = "";
  persistCurrentNote();
  elements.notesCharacterCount.textContent = "0 字";
}

function updateActiveNavigation() {
  document.querySelectorAll(".page-link").forEach((link) => {
    link.classList.toggle(
      "active",
      link.dataset.pageId === state.activePage?.id &&
        (!link.dataset.anchor || link.dataset.anchor === state.activeAnchor)
    );
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
  if (state.activePage) persistCurrentNote();
  state.activePage = page;
  state.activeAnchor = anchor;
  elements.article.setAttribute("aria-busy", "true");
  elements.pageTitle.textContent = page.title;
  elements.pageCategory.textContent = `第 ${page.chapter.number} 章 · ${page.chapter.title}`;
  elements.pageDescription.textContent = diseaseItems(page)
    .map((item) => item.title)
    .join(" · ");

  const markdown = await fetchPageMarkdown(page);
  elements.article.innerHTML = marked.parse(markdown);
  elements.article.setAttribute("aria-busy", "false");
  renderOutline();
  updateActiveNavigation();
  renderCurrentNote();
  document.title = `${page.title} · Ultra Notes`;

  requestAnimationFrame(() => {
    if (anchor) {
      document.getElementById(anchor)?.scrollIntoView({ block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  });
}

async function fetchPageMarkdown(page) {
  if (!state.markdownCache.has(page.id)) {
    const request = fetch(`content/${encodeURI(page.path)}`).then(async (response) => {
      if (!response.ok) throw new Error(`无法载入 ${page.path}`);
      return stripFrontMatter(await response.text());
    });
    state.markdownCache.set(page.id, request);
  }

  try {
    return await state.markdownCache.get(page.id);
  } catch (error) {
    state.markdownCache.delete(page.id);
    throw error;
  }
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
      kind: "title",
    });
    diseases.forEach((disease, index) => {
      if (disease.title === page.title) return;
      state.searchIndex.push({
        title: disease.title,
        subtitle: page.title,
        keywords: `${disease.title} ${page.title}`,
        route: routeForDisease(page, disease, index, diseases.length),
        kind: "title",
      });
    });
  });
}

function normalizeSearchText(value) {
  return value.toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
}

function pageSearchSections(page, markdown) {
  const container = document.createElement("article");
  container.innerHTML = marked.parse(markdown);
  assignHeadingIds(container, page);

  const sections = [];
  let current = {
    title: page.title,
    anchor: "",
    parts: [],
  };

  [...container.children].forEach((node) => {
    if (node.matches("h2, h3")) {
      if (current.parts.length) sections.push(current);
      current = {
        title: node.textContent.trim(),
        anchor: node.id,
        parts: [],
      };
      return;
    }
    const text = node.textContent.replace(/\s+/g, " ").trim();
    if (text) current.parts.push(text);
  });
  if (current.parts.length) sections.push(current);

  return sections.map((section) => ({
    title: section.title,
    subtitle:
      section.title === page.title
        ? `第${page.chapter.number}章 · ${page.chapter.title}`
        : `${page.title} · 第${page.chapter.number}章 ${page.chapter.title}`,
    keywords: `${page.title} ${section.title}`,
    content: section.parts.join(" "),
    route: routeFor(page, section.anchor),
    kind: "content",
  }));
}

async function ensureFullTextSearchIndex() {
  if (state.fullTextSearchReady) return;
  if (!state.fullTextSearchPromise) {
    state.fullTextSearchPromise = Promise.allSettled(
      state.pages.map(async (page) =>
        pageSearchSections(page, await fetchPageMarkdown(page))
      )
    ).then((results) => {
      state.fullTextSearchIndex = results.flatMap((result) =>
        result.status === "fulfilled" ? result.value : []
      );
      state.fullTextSearchFailures = results.filter(
        (result) => result.status === "rejected"
      ).length;
      state.fullTextSearchReady = true;
    });
  }
  return state.fullTextSearchPromise;
}

function scoreSearchResult(item, keyword) {
  const title = normalizeSearchText(item.title);
  const keywords = normalizeSearchText(item.keywords);
  const content = normalizeSearchText(item.content || "");
  let score = 0;

  if (title === keyword) score += 1200;
  else if (title.startsWith(keyword)) score += 900;
  else if (title.includes(keyword)) score += 700;
  if (keywords.includes(keyword)) score += 300;
  if (content.includes(keyword)) {
    score += 120;
    score += Math.max(0, 50 - content.indexOf(keyword) / 40);
  }
  if (item.kind === "title") score += 40;
  return score;
}

function searchItems(query) {
  const keyword = normalizeSearchText(query.trim());
  const source = state.fullTextSearchReady
    ? [...state.searchIndex, ...state.fullTextSearchIndex]
    : state.searchIndex;
  const bestByRoute = new Map();

  source.forEach((item) => {
    const score = scoreSearchResult(item, keyword);
    if (!score) return;
    const current = bestByRoute.get(item.route);
    if (!current || score > current.score) bestByRoute.set(item.route, { item, score });
  });

  return [...bestByRoute.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, 18)
    .map((result) => result.item);
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]
  );
}

function highlightSearchText(text, query) {
  const source = String(text);
  const keyword = normalizeSearchText(query.trim());
  if (!keyword) return escapeHtml(source);

  let cursor = 0;
  let output = "";
  let match = findSearchMatch(source, keyword, cursor);

  while (match) {
    output += escapeHtml(source.slice(cursor, match.start));
    output += `<mark>${escapeHtml(source.slice(match.start, match.end))}</mark>`;
    cursor = match.end;
    match = findSearchMatch(source, keyword, cursor);
  }
  return output + escapeHtml(source.slice(cursor));
}

function findSearchMatch(text, normalizedKeyword, fromIndex = 0) {
  for (let start = fromIndex; start < text.length; start += 1) {
    if (/\s/.test(text[start])) continue;
    let sourceIndex = start;
    let keywordIndex = 0;

    while (sourceIndex < text.length && keywordIndex < normalizedKeyword.length) {
      if (/\s/.test(text[sourceIndex])) {
        sourceIndex += 1;
        continue;
      }
      if (
        text[sourceIndex].toLocaleLowerCase("zh-CN") !==
        normalizedKeyword[keywordIndex]
      ) {
        break;
      }
      sourceIndex += 1;
      keywordIndex += 1;
    }

    if (keywordIndex === normalizedKeyword.length) {
      return { start, end: sourceIndex };
    }
  }
  return null;
}

function searchSnippet(content, query) {
  if (!content) return "";
  const text = content.replace(/\s+/g, " ").trim();
  const match = findSearchMatch(text, normalizeSearchText(query.trim()));
  const index = match?.start || 0;
  const start = Math.max(0, index - 42);
  const end = Math.min(text.length, (match?.end || 0) + 68);
  return `${start ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function renderSearchResults(query) {
  const results = searchItems(query);
  elements.searchStatus.textContent = state.fullTextSearchReady
    ? state.fullTextSearchFailures
      ? `搜索结果 · ${state.fullTextSearchFailures} 篇正文载入失败`
      : "全文搜索结果"
    : "标题结果 · 正在建立全文索引…";
  elements.searchResults.innerHTML = results.length
    ? results
        .map((item) => {
          const snippet = searchSnippet(item.content, query);
          return `
            <a class="search-result" href="${item.route}">
              <strong>${highlightSearchText(item.title, query)}</strong>
              <span>${escapeHtml(item.subtitle)}</span>
              ${
                snippet
                  ? `<p>${highlightSearchText(snippet, query)}</p>`
                  : ""
              }
            </a>`;
        })
        .join("")
    : state.fullTextSearchReady
      ? `<div class="empty-search">没有找到“${escapeHtml(query)}”</div>`
      : `<div class="search-loading">正在读取正文，请稍候…</div>`;
  elements.searchPanel.hidden = false;
  elements.scrim.hidden = false;
}

function renderSearch(query) {
  if (!query.trim()) {
    closeSearch();
    return;
  }
  renderSearchResults(query);
  if (!state.fullTextSearchReady) {
    ensureFullTextSearchIndex().then(() => {
      if (elements.globalSearch.value === query) renderSearchResults(query);
    });
  }
}

function closeSearch() {
  elements.searchPanel.hidden = true;
  document.body.classList.remove("mobile-search-open");
  if (!elements.sidebar.classList.contains("open")) elements.scrim.hidden = true;
}

function openMobileSearch() {
  document.body.classList.add("mobile-search-open");
  elements.globalSearch.focus();
  if (elements.globalSearch.value) renderSearch(elements.globalSearch.value);
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
  document.querySelector("#mobileSearchButton").addEventListener("click", openMobileSearch);
  document.querySelector("#notesButton").addEventListener("click", openNotes);
  document.querySelector("#notesFab").addEventListener("click", openNotes);
  document.querySelector("#closeNotesButton").addEventListener("click", closeNotes);
  elements.notesScrim.addEventListener("click", closeNotes);
  elements.notesEditor.addEventListener("input", scheduleNoteSave);
  document
    .querySelector("#exportCurrentNoteButton")
    .addEventListener("click", exportCurrentNote);
  document.querySelector("#exportAllNotesButton").addEventListener("click", exportAllNotes);
  document.querySelector("#clearNoteButton").addEventListener("click", clearCurrentNote);
  document.querySelector("#menuButton").addEventListener("click", openMobileMenu);
  document.querySelector("#closeMenuButton").addEventListener("click", closeMobileMenu);
  elements.scrim.addEventListener("click", () => {
    closeSearch();
    closeMobileMenu();
  });
  elements.chapterNavigation.addEventListener("click", (event) => {
    const favoriteButton = event.target.closest(".disease-favorite");
    if (favoriteButton) {
      toggleFavoriteDisease(favoriteButton.dataset.favoriteDisease);
      return;
    }

    const chapterToggle = event.target.closest(".chapter-toggle");
    if (chapterToggle) {
      const chapter = chapterToggle.closest(".chapter-block");
      const chapterNumber = String(chapter.dataset.chapter);
      const collapsed = chapter.classList.toggle("collapsed");
      chapterToggle.setAttribute("aria-expanded", String(!collapsed));
      if (collapsed) {
        state.collapsedChapters.add(chapterNumber);
      } else {
        state.collapsedChapters.delete(chapterNumber);
      }
      return;
    }

    if (event.target.closest(".page-link, .disease-page-title, .favorite-disease-link")) {
      closeMobileMenu();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== elements.globalSearch) {
      event.preventDefault();
      elements.globalSearch.focus();
    }
    if (event.key === "Escape") {
      closeSearch();
      closeMobileMenu();
      closeNotes();
    }
  });
  window.addEventListener("beforeunload", persistCurrentNote);

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
    loadNotesFromStorage();
    loadFavoriteDiseasesFromStorage();
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
