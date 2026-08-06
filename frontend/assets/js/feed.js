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
        tag: params.get("tag") || ""            // from ?tag=slug
    };

    var els = {};
    var heroTpl, cardTpl;

    function cacheDom() {
        els.feed = document.getElementById("feed");
        els.hero = document.getElementById("hero-slot");
        els.empty = document.getElementById("feed-empty");
        els.error = document.getElementById("feed-error");
        els.loadMore = document.getElementById("load-more");
        els.authorFilter = document.getElementById("author-filter");
        els.sortOrder = document.getElementById("sort-order");
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
        if (url) {
            img.src = url;
            img.alt = "";
            mediaEl.style.display = "";
        } else {
            // no cover: collapse the media block to a subtle placeholder
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

        // sort (only reorders DOM nodes)
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
        // keep existing selected value if any
        var current = state.authorFilter;
        var optionsHtml = '<option value="">Все</option>';
        articles.forEach(function (a) {
            var slug = a.author_slug;
            if (!slug || seen[slug]) return;
            seen[slug] = true;
            optionsHtml += '<option value="' + slug + '">' +
                escapeHtml(a.author_name) + "</option>";
        });
        els.authorFilter.innerHTML = optionsHtml;
        els.authorFilter.value = current || "";
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

    function loadNext() {
        if (state.loading || !state.hasMore) return Promise.resolve();
        state.loading = true;
        els.loadMore.disabled = true;
        els.loadMore.textContent = "Загрузка…";

        return MediaAPI.listArticles(state.page, PER_PAGE, {
            section: state.section || null,
            tag: state.tag || null,
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

    /* ---------- events ---------- */

    function bindEvents() {
        els.loadMore.addEventListener("click", loadNext);

        els.authorFilter.addEventListener("change", function () {
            state.authorFilter = els.authorFilter.value;
            applyFilterAndSort();
            updateEmptyState();
        });

        els.sortOrder.addEventListener("change", function () {
            state.sort = els.sortOrder.value;
            applyFilterAndSort();
        });

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
