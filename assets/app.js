const state = {
  manifest: null,
  pages: [],
  activePage: null,
  activeAnchor: "",
  searchIndex: [],
  notes: {},
  noteSaveTimer: null,
};

const NOTES_STORAGE_KEY = "ultra-notes-user-notes-v1";

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
  if (state.activePage) persistCurrentNote();
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
