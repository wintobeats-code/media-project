/* Feed page: load articles, render hero + grid, filter by author, sort, paginate. */
(function () {
    "use strict";

    var PER_PAGE = 12;
    var params = new URLSearchParams(window.location.search);
    var state = {
        items: [],          // all loaded articles (excluding hero)
        hero: null,         // first (fresh) article, shown large
        page: 1,
        hasMore: true,
        loading: false,
        authorFilter: "",
        sort: "new",
        section: params.get("section") || "",   // from ?section=slug
        tag: params.get("tag") || "",           // from ?tag=slug
        allTags: []                             // все теги (для поиска), из /api/tags
    };

    var els = {};
    var heroTpl, cardTpl;

    function cacheDom() {
        els.feed = document.getElementById("feed");
        els.hero = document.getElementById("hero-slot");
        els.empty = document.getElementById("feed-empty");
        els.error = document.getElementById("feed-error");
        els.loadMore = document.getElementById("load-more");
        els.authorDropdown = document.getElementById("author-dropdown");
        els.sortDropdown = document.getElementById("sort-dropdown");
        els.searchInput = document.getElementById("search-input");
        els.searchSuggest = document.getElementById("search-suggest");
        els.ticker = document.getElementById("ticker");
        els.year = document.getElementById("year");
        els.sectionNav = document.getElementById("section-nav");
        els.feedContext = document.getElementById("feed-context");
        els.trackSection = document.getElementById("track-of-day");
        els.trackPlayer = document.getElementById("track-player");
        heroTpl = document.getElementById("hero-template");
        cardTpl = document.getElementById("card-template");
    }

    /* ---------- helpers ---------- */

    function formatDate(iso) {
        if (!iso) return "";
        var d = new Date(iso);
        if (isNaN(d.getTime())) return "";
        var months = ["янв", "фев", "мар", "апр", "мая", "июн",
                      "июл", "авг", "сен", "окт", "ноя", "дек"];
        return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
    }

    function todayLabel() {
        var d = new Date();
        var months = ["января", "февраля", "марта", "апреля", "мая", "июня",
                      "июля", "августа", "сентября", "октября", "ноября", "декабря"];
        return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
    }

    function placeholderAvatar(name) {
        var letter = (name || "?").trim().charAt(0).toUpperCase() || "?";
        var span = document.createElement("span");
        span.className = "avatar-placeholder";
        span.textContent = letter;
        return span;
    }

    function setAvatar(container, url, name) {
        var img = container.querySelector(".author-avatar");
        if (url) {
            if (img) {
                img.src = url;
                img.alt = name || "";
            }
        } else if (img) {
            img.replaceWith(placeholderAvatar(name));
        }
    }

    function setCover(mediaEl, url) {
        var img = mediaEl.querySelector("img");
        // Сброс предыдущего состояния
        mediaEl.classList.remove("cover-broken");
        img.onerror = null;
        if (url) {
            // Если картинка не загрузится (битая ссылка, HTML вместо изображения и т.п.) —
            // показываем аккуратный плейсхолдер вместо битого img.
            img.onerror = function () {
                img.style.visibility = "hidden";
                mediaEl.classList.add("cover-broken");
            };
            img.src = url;
            img.alt = "";
            img.style.visibility = "";
            mediaEl.style.display = "";
        } else {
            // нет обложки — сворачиваем медиа-блок
            mediaEl.style.display = "none";
        }
    }

    /* ---------- rendering ---------- */

    function renderHero(article) {
        els.hero.innerHTML = "";
        if (!article) return;
        var node = heroTpl.content.firstElementChild.cloneNode(true);
        var link = node.querySelector(".hero-card-link");
        link.href = "/article.html?slug=" + encodeURIComponent(article.slug);

        setCover(node.querySelector(".hero-card-media"), article.cover_image_url);
        node.querySelector(".card-date").textContent = formatDate(article.published_at || article.created_at);
        var titleEl = node.querySelector(".hero-card-title");
        if (article.section) {
            var badge = document.createElement("span");
            badge.className = "section-badge section-badge-link";
            badge.dataset.sectionSlug = article.section;
            badge.setAttribute("role", "link");
            badge.setAttribute("tabindex", "0");
            badge.textContent = sectionTitle(article.section);
            titleEl.before(badge);
        }
        titleEl.textContent = article.title;
        var lead = node.querySelector(".hero-card-lead");
        if (article.subtitle) {
            lead.textContent = article.subtitle;
        } else {
            lead.remove();
        }
        var author = node.querySelector(".card-author");
        setAvatar(author, null, article.author_name); // placeholder; avatar not in list API
        node.querySelector(".author-name").textContent = article.author_name;
        els.hero.appendChild(node);

        // Превью текста статьи: догружаем body по slug и показываем начало
        // с fade-out + «Читать далее». Сохраняем slug, чтобы при гонке запросов
        // не подставить чужой текст (узел мог быть заменён другим hero).
        node.dataset.slug = article.slug;
        var excerptEl = node.querySelector(".hero-card-excerpt");
        var currentSlug = article.slug;
        MediaAPI.getArticle(currentSlug).then(function (full) {
            if (!full || !full.body) return;
            if (node.dataset.slug !== currentSlug) return; // hero уже заменён
            var text = stripMarkdown(full.body);
            if (text) {
                excerptEl.innerHTML = "";
                var p = document.createElement("p");
                p.textContent = text.slice(0, 600);
                excerptEl.appendChild(p);
            }
        }).catch(function () { /* превью не критично */ });
    }

    // Грубая очистка markdown: убираем разметку, оставляя читаемый текст.
    function stripMarkdown(md) {
        if (!md) return "";
        return md
            // картинки и сноски-маркеры ![n]
            .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
            .replace(/!\[(\d+)\]/g, "")
            // ссылки [текст](url) → текст
            .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
            // заголовки/жирный/курсив/код
            .replace(/^#{1,6}\s*/gm, "")
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/__([^_]+)__/g, "$1")
            .replace(/\*([^*]+)\*/g, "$1")
            .replace(/_([^_]+)_/g, "$1")
            .replace(/`([^`]+)`/g, "$1")
            // списки и цитаты
            .replace(/^[\s]*[-*+]\s+/gm, "")
            .replace(/^>\s?/gm, "")
            // лишние пустые строки
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    function renderCard(article) {
        var node = cardTpl.content.firstElementChild.cloneNode(true);
        node.dataset.authorSlug = article.author_slug || "";
        node.dataset.authorName = article.author_name || "";
        node.dataset.date = (article.published_at || article.created_at || "");

        var link = node.querySelector(".card-link");
        link.href = "/article.html?slug=" + encodeURIComponent(article.slug);

        setCover(node.querySelector(".card-media"), article.cover_image_url);
        node.querySelector(".card-date").textContent =
            formatDate(article.published_at || article.created_at);
        // Время чтения рядом с датой
        if (article.reading_time_minutes) {
            var rt = document.createElement("span");
            rt.className = "reading-time";
            rt.textContent = article.reading_time_minutes + " мин";
            node.querySelector(".card-date").parentNode.appendChild(rt);
        }
        var cardTitle = node.querySelector(".card-title");
        if (article.section) {
            var badge = document.createElement("span");
            badge.className = "section-badge section-badge-link";
            badge.dataset.sectionSlug = article.section;
            badge.setAttribute("role", "link");
            badge.setAttribute("tabindex", "0");
            badge.textContent = sectionTitle(article.section);
            cardTitle.before(badge);
        }
        cardTitle.textContent = article.title;

        var lead = node.querySelector(".card-lead");
        if (article.subtitle) {
            lead.textContent = article.subtitle;
        } else {
            lead.remove();
        }

        var author = node.querySelector(".card-author");
        setAvatar(author, null, article.author_name);
        node.querySelector(".author-name").textContent = article.author_name;

        return node;
    }

    function applyFilterAndSort() {
        var cards = Array.prototype.slice.call(els.feed.children);

        // Hide hero when an author filter is active and it does not match the
        // hero's author (hero represents only the freshest article).
        if (state.hero) {
            var heroMatches = !state.authorFilter ||
                state.hero.author_slug === state.authorFilter;
            els.hero.style.display = heroMatches ? "" : "none";
        }

        // filter
        cards.forEach(function (card) {
            var match = !state.authorFilter ||
                card.dataset.authorSlug === state.authorFilter;
            card.style.display = match ? "" : "none";
        });

        // Клиентская сортировка только для new/old; «popular» сортируется на сервере.
        if (state.sort !== "popular") {
            cards.sort(function (a, b) {
                var da = new Date(a.dataset.date).getTime() || 0;
                var db = new Date(b.dataset.date).getTime() || 0;
                return state.sort === "old" ? da - db : db - da;
            });
            var frag = document.createDocumentFragment();
            cards.forEach(function (c) { frag.appendChild(c); });
            els.feed.innerHTML = "";
            els.feed.appendChild(frag);
        }
    }

    function updateEmptyState() {
        var visibleCards = Array.prototype.some.call(els.feed.children, function (c) {
            return c.style.display !== "none";
        });
        // Consider the hero too: if the only article became the hero, the grid
        // is empty but the page is not.
        var hasHero = !!state.hero &&
            (!state.authorFilter || state.hero.author_slug === state.authorFilter);
        els.empty.hidden = visibleCards || hasHero;
    }

    function populateAuthorFilter(articles) {
        var seen = {};
        var items = [{ value: "", label: "Все авторы" }];
        articles.forEach(function (a) {
            var slug = a.author_slug;
            if (!slug || seen[slug]) return;
            seen[slug] = true;
            items.push({ value: slug, label: a.author_name });
        });
        if (authorDD) authorDD.setItems(items);
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (ch) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
        });
    }

    /* ---------- sections / tags ---------- */

    // slug -> title map, populated from /api/sections
    var sectionMap = {};

    function sectionTitle(slug) {
        return sectionMap[slug] || slug;
    }

    // Build the top section-nav links (Мода, Музыка…) from /api/sections.
    function renderSectionNav() {
        if (!els.sectionNav) return;
        return MediaAPI.listSections().then(function (sections) {
            sectionMap = {};
            sections.forEach(function (s) { sectionMap[s.slug] = s.title; });
            els.sectionNav.innerHTML = "";
            sections.forEach(function (s) {
                var a = document.createElement("a");
                a.href = "/?section=" + encodeURIComponent(s.slug);
                a.textContent = s.title;
                if (state.section === s.slug) a.classList.add("active");
                els.sectionNav.appendChild(a);
            });
            // re-render already-loaded cards so section badges get titles
            if (state.hero || state.items.length) {
                renderHero(state.hero);
                els.feed.innerHTML = "";
                state.items.forEach(function (a) { els.feed.appendChild(renderCard(a)); });
                applyFilterAndSort();
            }
        }).catch(function () { /* nav is non-critical */ });
    }

    // Show a "Раздел: Мода ✕" / "Тег: ... ✕" line above the feed.
    function renderFeedContext() {
        if (!els.feedContext) return;
        if (!state.section && !state.tag) { els.feedContext.hidden = true; return; }
        var html = "";
        if (state.section) {
            html += 'Раздел: ' + escapeHtml(sectionTitle(state.section)) +
                    ' · <a href="/' + (state.tag ? ("?tag=" + encodeURIComponent(state.tag)) : "") + '">все</a>';
        } else if (state.tag) {
            html += 'Тег: #' + escapeHtml(state.tag) +
                    ' · <a href="/' + (state.section ? ("?section=" + encodeURIComponent(state.section)) : "") + '">все</a>';
        }
        els.feedContext.innerHTML = html;
        els.feedContext.hidden = false;
    }

    // Загружаем «Трек дня» и встраиваем iframe-плеер Яндекс Музыки.
    function renderTrack() {
        if (!els.trackSection) return;
        return MediaAPI.getTrack()
            .then(function (track) {
                if (!track || !track.embed_url) {
                    els.trackSection.hidden = true;
                    return;
                }
                // iframe с плеером; allow — для воспроизведения
                els.trackPlayer.innerHTML =
                    '<iframe src="' + escapeHtml(track.embed_url) + '" ' +
                    'allow="autoplay; fullscreen" ' +
                    'loading="lazy" ' +
                    'title="Трек дня — Яндекс Музыка"></iframe>';
                els.trackSection.hidden = false;
            })
            .catch(function () { /* трек не критичен — скрываем блок */ });
    }

    /* ---------- loading ---------- */

    // Полная перезагрузка ленты с сервера (при смене сортировки, например на «по популярности»).
    function reloadFeed() {
        state.items = [];
        state.hero = null;
        state.page = 1;
        state.hasMore = true;
        els.hero.innerHTML = "";
        els.feed.innerHTML = "";
        loadNext();
    }

    function loadNext() {
        if (state.loading || !state.hasMore) return Promise.resolve();
        state.loading = true;
        els.loadMore.disabled = true;
        els.loadMore.textContent = "Загрузка…";

        return MediaAPI.listArticles(state.page, PER_PAGE, {
            section: state.section || null,
            tag: state.tag || null,
            sort: state.sort || null,
        })
            .then(function (batch) {
                state.loading = false;
                els.loadMore.disabled = false;
                els.loadMore.textContent = "Загрузить ещё";

                if (!batch || !batch.length) {
                    state.hasMore = false;
                    els.loadMore.hidden = true;
                    updateEmptyState();
                    return;
                }
                els.error.hidden = true;

                // Дедупликация по slug: если статья уже показана (например,
                // published_at изменился между запросами и она попала на две
                // страницы), не рендерим её повторно.
                var seen = {};
                state.items.forEach(function (a) { seen[a.slug] = true; });
                if (state.hero) seen[state.hero.slug] = true;
                batch = batch.filter(function (a) {
                    if (seen[a.slug]) return false;
                    seen[a.slug] = true;
                    return true;
                });

                // first page: take the freshest as hero
                if (state.page === 1) {
                    state.hero = batch[0];
                    renderHero(state.hero);
                    batch = batch.slice(1);
                    populateAuthorFilter(state.hero ? [state.hero].concat(batch) : batch);
                } else {
                    populateAuthorFilter(state.items.concat(batch));
                }

                var frag = document.createDocumentFragment();
                batch.forEach(function (a) {
                    frag.appendChild(renderCard(a));
                });
                els.feed.appendChild(frag);
                state.items = state.items.concat(batch);
                state.page += 1;

                applyFilterAndSort();
                updateEmptyState();

                // If fewer than requested returned, no more pages
                if (batch.length < PER_PAGE) {
                    state.hasMore = false;
                    els.loadMore.hidden = true;
                } else {
                    els.loadMore.hidden = false;
                }
            })
            .catch(function () {
                state.loading = false;
                els.loadMore.disabled = false;
                els.loadMore.textContent = "Загрузить ещё";
                if (state.items.length === 0 && !state.hero) {
                    els.error.hidden = false;
                }
            });
    }

    /* ---------- поиск по тегам (autocomplete) ---------- */

    var searchFocusIndex = -1;

    // Загружаем все теги один раз для подсказок поиска.
    function loadAllTags() {
        return MediaAPI.listTags()
            .then(function (tags) { state.allTags = tags || []; })
            .catch(function () { state.allTags = []; });
    }

    // Подсказки по введённому тексту (по имени и slug, частичное совпадение).
    function filterTags(query) {
        var q = (query || "").toLowerCase().trim();
        if (!q) return state.allTags.slice(0, 8);
        return state.allTags.filter(function (t) {
            return (t.name || "").toLowerCase().indexOf(q) !== -1 ||
                   (t.slug || "").toLowerCase().indexOf(q) !== -1;
        }).slice(0, 8);
    }

    function renderSuggest(query) {
        var matches = filterTags(query);
        els.searchSuggest.innerHTML = "";
        if (!matches.length) {
            if (query && query.trim()) {
                var empty = document.createElement("li");
                empty.className = "search-suggest-empty";
                empty.textContent = "Ничего не найдено";
                els.searchSuggest.appendChild(empty);
            }
            els.searchSuggest.hidden = !query || !query.trim();
            searchFocusIndex = -1;
            return;
        }
        matches.forEach(function (t, idx) {
            var li = document.createElement("li");
            var b = document.createElement("button");
            b.type = "button";
            b.className = "search-suggest-item";
            b.dataset.slug = t.slug;
            b.innerHTML = escapeHtml(t.name) +
                ' <span class="tag-count">' + (t.count || 0) + '</span>';
            b.addEventListener("click", function () {
                applyTagFilter(t.slug);
                els.searchInput.value = t.name;
            });
            b.addEventListener("mouseenter", function () {
                setSuggestFocus(idx);
            });
            li.appendChild(b);
            els.searchSuggest.appendChild(li);
        });
        searchFocusIndex = -1;
        els.searchSuggest.hidden = false;
    }

    function setSuggestFocus(idx) {
        searchFocusIndex = idx;
        var items = els.searchSuggest.querySelectorAll(".search-suggest-item");
        items.forEach(function (el, i) {
            el.classList.toggle("focused", i === idx);
        });
    }

    // Применяет тег как фильтр ленты (через URL ?tag=) и перезагружает страницу.
    function applyTagFilter(slug) {
        els.searchSuggest.hidden = true;
        var url = "/?tag=" + encodeURIComponent(slug);
        if (state.section) url += "&section=" + encodeURIComponent(state.section);
        window.location.href = url;
    }

    function initSearch() {
        if (!els.searchInput) return;
        // Если из URL уже есть активный тег — покажем его в поле
        if (state.tag) {
            var found = state.allTags.filter(function (t) { return t.slug === state.tag; })[0];
            els.searchInput.value = found ? found.name : state.tag;
        }

        els.searchInput.addEventListener("input", function () {
            renderSuggest(this.value);
        });
        els.searchInput.addEventListener("focus", function () {
            if (this.value) renderSuggest(this.value);
            else if (state.allTags.length) renderSuggest("");
        });
        els.searchInput.addEventListener("keydown", function (e) {
            var items = els.searchSuggest.querySelectorAll(".search-suggest-item");
            if (e.key === "ArrowDown" && items.length) {
                e.preventDefault();
                setSuggestFocus(Math.min(searchFocusIndex + 1, items.length - 1));
            } else if (e.key === "ArrowUp" && items.length) {
                e.preventDefault();
                setSuggestFocus(Math.max(searchFocusIndex - 1, 0));
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (searchFocusIndex >= 0 && items[searchFocusIndex]) {
                    var slug = items[searchFocusIndex].dataset.slug;
                    els.searchInput.value = items[searchFocusIndex].textContent.replace(/\d+$/, "").trim();
                    applyTagFilter(slug);
                } else {
                    // нет подсветки — берём первый совпадающий тег или ищем частично
                    var matches = filterTags(this.value);
                    if (matches.length) {
                        applyTagFilter(matches[0].slug);
                    }
                }
            } else if (e.key === "Escape") {
                els.searchSuggest.hidden = true;
            }
        });
        // Закрытие подсказок при клике вне поля
        document.addEventListener("click", function (e) {
            if (!e.target.closest("#search-control")) {
                els.searchSuggest.hidden = true;
            }
        });
    }

    /* ---------- events ---------- */

    // Ссылки на инициализированные dropdown'ы
    var authorDD = null;

    function bindEvents() {
        els.loadMore.addEventListener("click", loadNext);

        // Кастомный dropdown «Автор»
        authorDD = createDropdown(els.authorDropdown, {
            items: [{ value: "", label: "Все авторы" }],
            value: state.authorFilter,
            onChange: function (val) {
                state.authorFilter = val;
                applyFilterAndSort();
                updateEmptyState();
            },
        });

        // Кастомный dropdown «Сортировка»
        createDropdown(els.sortDropdown, {
            items: [
                { value: "new", label: "Сначала новые" },
                { value: "old", label: "Сначала старые" },
                { value: "popular", label: "По популярности" },
            ],
            value: state.sort,
            onChange: function (val) {
                state.sort = val;
                // Любая смена сортировки — перезагружаем ленту с сервера,
                // т.к. порядок (и hero) должны вычисляться на сервере.
                reloadFeed();
            },
        });

        initSearch();

        // Делегирование клика/Enter по section-badge внутри карточек
        // (badge не вложён в <a>, чтобы HTML оставался валидным).
        var onBadgeActivate = function (e) {
            var badge = e.target.closest(".section-badge-link");
            if (!badge) return;
            var slug = badge.dataset.sectionSlug;
            if (!slug) return;
            window.location.href = "/?section=" + encodeURIComponent(slug);
        };
        document.addEventListener("click", onBadgeActivate);
        document.addEventListener("keydown", function (e) {
            if (e.key !== "Enter" && e.key !== " ") return;
            onBadgeActivate(e);
        });
    }

    /* ---------- init ---------- */

    document.addEventListener("DOMContentLoaded", function () {
        cacheDom();
        if (els.year) els.year.textContent = new Date().getFullYear();
        if (els.ticker) els.ticker.textContent = todayLabel();
        if (!els.feed) return;
        bindEvents();
        // Теги для поиска — загружаем параллельно, не блокируя ленту
        loadAllTags();
        // «Трек дня» — независимая загрузка, не блокирует ленту
        renderTrack();
        // section nav populates the slug->title map; context + feed use it.
        // Even if the sections request fails, still render the feed.
        renderSectionNav()
            .then(renderFeedContext)
            .catch(renderFeedContext)
            .then(loadNext);
    });
})();
