/* Article page: load by slug, render markdown body, footnotes (from `*` markers), gallery. */
(function () {
    "use strict";

    var els = {};

    function cacheDom() {
        els.loading = document.getElementById("article-loading");
        els.error = document.getElementById("article-error");
        els.content = document.getElementById("article-content");
        els.date = document.getElementById("article-date");
        els.section = document.getElementById("article-section");
        els.title = document.getElementById("article-title");
        els.subtitle = document.getElementById("article-subtitle");
        els.authorWrap = document.getElementById("article-author");
        els.authorAvatar = document.getElementById("author-avatar");
        els.authorName = document.getElementById("author-name");
        els.coverWrap = document.getElementById("article-cover");
        els.coverImg = document.getElementById("cover-img");
        els.body = document.getElementById("article-body");
        els.tags = document.getElementById("article-tags");
        els.likeBtn = document.getElementById("like-btn");
        els.likeCount = document.getElementById("like-count");
        els.favBtn = document.getElementById("fav-btn");
        els.shareGroup = document.getElementById("share-group");
        els.gallery = document.getElementById("article-images");
        els.footnotes = document.getElementById("article-footnotes");
        els.fnList = document.getElementById("footnotes-list");
        els.relatedSection = document.getElementById("related-articles");
        els.relatedGrid = document.getElementById("related-grid");
        els.sectionNav = document.getElementById("section-nav");
        els.year = document.getElementById("year");
    }

    // slug -> title map from /api/sections
    var sectionMap = {};
    function sectionTitle(slug) { return sectionMap[slug] || slug; }

    function renderSectionNav() {
        if (!els.sectionNav) return Promise.resolve();
        return MediaAPI.listSections().then(function (sections) {
            sectionMap = {};
            sections.forEach(function (s) { sectionMap[s.slug] = s.title; });
            els.sectionNav.innerHTML = "";
            sections.forEach(function (s) {
                var a = document.createElement("a");
                a.href = "/?section=" + encodeURIComponent(s.slug);
                a.textContent = s.title;
                if (s.slug === (els.section.dataset.slug || "")) a.classList.add("active");
                els.sectionNav.appendChild(a);
            });
        }).catch(function () {});
    }

    /* ---------- helpers ---------- */

    function formatDate(iso) {
        if (!iso) return "";
        var d = new Date(iso);
        if (isNaN(d.getTime())) return "";
        var months = ["января", "февраля", "марта", "апреля", "мая", "июня",
                      "июля", "августа", "сентября", "октября", "ноября", "декабря"];
        return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear() + " г.";
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (ch) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
        });
    }

    // Санитизация HTML через DOMPurify: запрещаем скрипты, on*-атрибуты,
    // style и опасные URI (javascript:, vbscript:, data: блокируются
    // DOMPurify по умолчанию). Если DOMPurify недоступен — возвращаем пустую
    // строку, чтобы не вставлять потенциально опасный HTML.
    function sanitizeHtml(html) {
        if (typeof window.DOMPurify !== "undefined") {
            return window.DOMPurify.sanitize(html, {
                USE_PROFILES: { html: true },
                FORBID_ATTR: ["style"],
                FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
            });
        }
        return "";
    }

    function placeholderAvatar(name) {
        var letter = (name || "?").trim().charAt(0).toUpperCase() || "?";
        var span = document.createElement("span");
        span.className = "avatar-placeholder author-avatar author-avatar-lg";
        span.textContent = letter;
        return span;
    }

    /* ---------- тело статьи и сноски ---------- */

    /**
     * Рендерит markdown-тело и преобразует маркеры сносок/картинок.
     *
     * В админке тело — это Markdown, а `*` обозначает сноску
     * (1-я `*` -> сноска №1 и т.д.). Сноски также приходят отдельным
     * упорядоченным списком (article.footnotes) с {number, text}.
     *
     * Картинки в тексте: маркеры `![n]` ссылаются на article.images
     * по `position` (с 1). Мы заменяем их на блоки <figure>.
     *
     * Стратегия:
     *  - До markdown-парсинга заменяем `![n]` плейсхолдером на отдельной
     *    строке, чтобы marked обернул его в <p>; затем меняем эти <p>
     *    на настоящие элементы <figure> после парсинга.
     *  - После парсинга заменяем одиночные символы "*" (вне code) на
     *    надстрочные ссылки-сноски в порядке появления.
     */
    function renderBody(article) {
        var raw = article.body || "";
        // Если тело пустое — показываем плейсхолдер
        if (!raw.trim()) {
            els.body.innerHTML = "<p>Содержимое статьи отсутствует.</p>";
            return {};
        }
        var images = (article.images || []).slice();
        var imgByPos = {};
        images.forEach(function (im) { imgByPos[im.position] = im; });

        // 1) Заменяем маркеры ![n] плейсхолдерами ДО markdown-парсинга,
        //    чтобы marked не превратил их в битые <img>.
        //    Формат токена: @@IMG-n@@ отдельным абзацем.
        raw = raw.replace(/!\[(\d+)\]/g, function (m, n) {
            return "\n\n@@IMG-" + n + "@@\n\n";
        });

        var html;
        if (window.marked) {
            try {
                html = window.marked.parse(raw, { breaks: false, gfm: true });
            } catch (e) {
                html = "<p>" + escapeHtml(raw).replace(/\n/g, "<br>") + "</p>";
            }
        } else {
            html = "<p>" + escapeHtml(raw).replace(/\n/g, "<br>") + "</p>";
        }
        // Санитизируем вывод markdown для защиты от XSS (скрипты, on*-атрибуты,
        // javascript:-URL и т.п. запрещены конфигурацией DOMPurify).
        els.body.innerHTML = sanitizeHtml(html);

        // 2) Заменяем плейсхолдеры <p>@@IMG-n@@</p> на настоящие <figure>.
        var usedPositions = {};
        Array.prototype.slice.call(els.body.querySelectorAll("p")).forEach(function (p) {
            var txt = (p.textContent || "").trim();
            var match = txt.match(/^@@IMG-(\d+)@@$/);
            if (!match) return;
            var n = parseInt(match[1], 10);
            var im = imgByPos[n];
            if (!im) {
                // no matching image record — drop the placeholder silently
                p.remove();
                return;
            }
            usedPositions[n] = true;
            var figure = document.createElement("figure");
            var img = document.createElement("img");
            img.src = im.url;
            img.alt = im.caption || "";
            img.loading = "lazy";
            figure.appendChild(img);
            if (im.caption) {
                var fc = document.createElement("figcaption");
                fc.textContent = im.caption;
                figure.appendChild(fc);
            }
            p.replaceWith(figure);
        });

        // Заменяем изолированные маркеры "*" на ссылки-сноски.
        // "*" считается маркером только если он окружён пробелом, началом/концом
        // строки или знаком препинания — но НЕ внутри слова (например "100*").
        // Работаем по текстовым нодам, не трогая теги/атрибуты.
        var footnotes = article.footnotes || [];
        var counter = 0;
        var walker = document.createTreeWalker(els.body, NodeFilter.SHOW_TEXT, null);
        var textNodes = [];
        var node;
        while ((node = walker.nextNode())) {
            // пропускаем внутри <code> / <pre>
            if (node.parentElement.closest("code, pre")) continue;
            textNodes.push(node);
        }
        // Regex: * окружён границей слова/пробелом/началом/концом/пунктуацией
        var starRe = /(?<=^|[\s.,;:!?()])\*(?=$|[\s.,;:!?()])/g;
        textNodes.forEach(function (tn) {
            var text = tn.nodeValue;
            if (!starRe.test(text)) return;
            starRe.lastIndex = 0;
            var frag = document.createDocumentFragment();
            var last = 0;
            var match;
            while ((match = starRe.exec(text)) !== null) {
                var i = match.index;
                if (i > last) {
                    frag.appendChild(document.createTextNode(text.slice(last, i)));
                }
                counter += 1;
                var num = counter;
                var a = document.createElement("a");
                a.className = "fn-ref";
                a.href = "#fn-" + num;
                a.id = "fnref-" + num;
                a.textContent = "[" + num + "]";
                a.title = "Сноска " + num;
                frag.appendChild(a);
                last = i + 1;
            }
            if (last < text.length) {
                frag.appendChild(document.createTextNode(text.slice(last)));
            }
            tn.parentNode.replaceChild(frag, tn);
        });

        // Рендерим список сносок из записей article.footnotes.
        if (footnotes.length) {
            els.footnotes.hidden = false;
            els.fnList.innerHTML = "";
            footnotes.forEach(function (fn) {
                var li = document.createElement("li");
                li.id = "fn-" + fn.number;
                var span = document.createElement("span");
                span.innerHTML = renderInline(fn.text);
                li.appendChild(span);
                var back = document.createElement("a");
                back.className = "footnote-back";
                back.href = "#fnref-" + fn.number;
                back.textContent = "↑";
                back.title = "Вернуться к тексту";
                li.appendChild(back);
                els.fnList.appendChild(li);
            });
        } else {
            els.footnotes.hidden = true;
        }

        return usedPositions;
    }

    // Текст сноски может содержать простой markdown — рендерим через marked
    // и обязательно санитизируем (защита от XSS).
    function renderInline(text) {
        if (!text) return "";
        if (window.marked) {
            try {
                var out = window.marked.parseInline(text);
                return sanitizeHtml(out);
            } catch (e) { /* fall through */ }
        }
        return escapeHtml(text);
    }

    /* ---------- gallery ---------- */

    // Показывает только картинки, которые НЕ вставлены в текст через `![n]`.
    function renderGallery(images, usedPositions) {
        usedPositions = usedPositions || {};
        var leftover = (images || []).filter(function (im) {
            return !usedPositions[im.position];
        });
        if (!leftover.length) {
            els.gallery.hidden = true;
            return;
        }
        // sort by position
        var sorted = leftover.slice().sort(function (a, b) {
            return (a.position || 0) - (b.position || 0);
        });
        els.gallery.innerHTML = "";
        sorted.forEach(function (img) {
            var figure = document.createElement("figure");
            figure.className = "gallery-item";
            var i = document.createElement("img");
            i.src = img.url;
            i.alt = img.caption || "";
            i.loading = "lazy";
            figure.appendChild(i);
            if (img.caption) {
                var fc = document.createElement("figcaption");
                fc.textContent = img.caption;
                figure.appendChild(fc);
            }
            els.gallery.appendChild(figure);
        });
        els.gallery.hidden = false;
    }

    /* ---------- main render ---------- */

    function render(article) {
        document.title = article.title + " — БОГЕМА";

        // Динамически обновляем мета-теги для SEO/шеринга
        var setMeta = function (selector, attr, value) {
            var el = document.querySelector(selector);
            if (el) el.setAttribute(attr, value);
        };
        var description = article.subtitle || article.title;
        setMeta('meta[name="description"]', "content", description);
        setMeta('#og-title', "content", article.title + " — БОГЕМА");
        setMeta('#og-description', "content", description);
        var articleUrl = window.location.origin + "/article.html?slug=" + encodeURIComponent(article.slug);
        setMeta('#og-url', "content", articleUrl);
        setMeta('#canonical', "href", articleUrl);
        if (article.cover_image_url) {
            // Мессенджерам нужен абсолютный URL картинки
            try {
                var absImg = new URL(article.cover_image_url, window.location.origin).href;
                setMeta('#og-image', "content", absImg);
            } catch (e) {
                setMeta('#og-image', "content", article.cover_image_url);
            }
        }

        // Бейдж раздела (преобразуем slug в человекочитаемое название через sectionMap).
        if (article.section && els.section) {
            els.section.dataset.slug = article.section;
            els.section.textContent = sectionTitle(article.section);
            els.section.href = "/?section=" + encodeURIComponent(article.section);
            els.section.hidden = false;
        } else if (els.section) {
            els.section.hidden = true;
        }

        els.date.textContent = formatDate(article.published_at || article.created_at);
        // Время чтения рядом с датой
        var rt = article.reading_time_minutes || 1;
        var rtSpan = document.createElement("span");
        rtSpan.className = "reading-time";
        rtSpan.textContent = rt + " мин";
        els.date.parentNode.appendChild(rtSpan);
        els.title.textContent = article.title;

        if (article.subtitle) {
            els.subtitle.textContent = article.subtitle;
        } else {
            els.subtitle.remove();
        }

        // author
        var author = article.author || {};
        els.authorName.textContent = author.name || "";
        if (author.avatar_url) {
            els.authorAvatar.src = author.avatar_url;
            els.authorAvatar.alt = author.name || "";
        } else {
            els.authorAvatar.replaceWith(placeholderAvatar(author.name));
        }

        // cover
        if (article.cover_image_url) {
            els.coverImg.src = article.cover_image_url;
            els.coverImg.alt = "";
            els.coverWrap.hidden = false;
        } else {
            els.coverWrap.hidden = true;
        }

        var usedPositions = renderBody(article);
        renderGallery(article.images, usedPositions);
        renderTags(article.tags);
        renderLike(article);
        renderFavorite(article);
        initShare();

        els.loading.hidden = true;
        els.content.hidden = false;
    }

    // Ключ localStorage для хранения лайкнутых статей: { slug: true, ... }
    var LIKES_KEY = "media-likes";

    function getLikedSlugs() {
        try { return JSON.parse(localStorage.getItem(LIKES_KEY) || "{}"); }
        catch (e) { return {}; }
    }
    function setLiked(slug, liked) {
        try {
            var data = getLikedSlugs();
            if (liked) data[slug] = true; else delete data[slug];
            localStorage.setItem(LIKES_KEY, JSON.stringify(data));
        } catch (e) {}
    }

    // Текущий slug статьи — нужен обработчику клика.
    var currentSlug = "";

    function renderLike(article) {
        if (!els.likeBtn) return;
        currentSlug = article.slug || "";
        var count = article.likes_count || 0;
        if (els.likeCount) els.likeCount.textContent = String(count);
        // Активное состояние — по факту из localStorage (сервер — источник правды,
        // но localStorage даёт мгновенный отклик UI без запроса).
        var liked = !!getLikedSlugs()[currentSlug];
        els.likeBtn.classList.toggle("liked", liked);
        els.likeBtn.hidden = false;
        if (!els.likeBtn.dataset.bound) {
            els.likeBtn.dataset.bound = "1";
            els.likeBtn.addEventListener("click", onLikeClick);
        }
    }

    function onLikeClick() {
        if (!currentSlug) return;
        var btn = els.likeBtn;
        if (btn.disabled) return;
        btn.disabled = true;
        MediaAPI.likeArticle(currentSlug)
            .then(function (res) {
                if (els.likeCount) els.likeCount.textContent = String(res.likes_count || 0);
                var liked = !!res.liked;
                btn.classList.toggle("liked", liked);
                setLiked(currentSlug, liked);
            })
            .catch(function () { /* молча — можно показать toast */ })
            .then(function () { btn.disabled = false; });
    }

    /* ---------- Избранное (localStorage, без аккаунтов) ---------- */
    var FAV_KEY = "media-favorites";

    function getFavorites() {
        try { return JSON.parse(localStorage.getItem(FAV_KEY) || "{}"); }
        catch (e) { return {}; }
    }
    function saveFavorites(data) {
        try { localStorage.setItem(FAV_KEY, JSON.stringify(data)); } catch (e) {}
    }
    // Сохраняем минимальные данные статьи для отображения на /favorites.html
    function setFavorite(article, fav) {
        var data = getFavorites();
        if (fav) {
            data[article.slug] = {
                title: article.title,
                subtitle: article.subtitle || "",
                slug: article.slug,
                cover_image_url: article.cover_image_url || "",
                author_name: (article.author && article.author.name) || article.author_name || "",
                published_at: article.published_at || "",
            };
        } else {
            delete data[article.slug];
        }
        saveFavorites(data);
    }

    function renderFavorite(article) {
        if (!els.favBtn) return;
        var active = !!getFavorites()[article.slug];
        els.favBtn.classList.toggle("active", active);
        els.favBtn.hidden = false;
        if (!els.favBtn.dataset.bound) {
            els.favBtn.dataset.bound = "1";
            els.favBtn.addEventListener("click", function () {
                var nowActive = !els.favBtn.classList.contains("active");
                els.favBtn.classList.toggle("active", nowActive);
                setFavorite(article, nowActive);
            });
        }
    }

    /* ---------- Поделиться ---------- */
    function initShare() {
        if (!els.shareGroup) return;
        if (els.shareGroup.dataset.bound) return; // обработчики вешаются один раз
        els.shareGroup.dataset.bound = "1";
        els.shareGroup.hidden = false;
        var url = window.location.href;
        var title = document.title;
        els.shareGroup.querySelectorAll("[data-share]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var type = btn.dataset.share;
                var shareUrl;
                if (type === "telegram") {
                    shareUrl = "https://t.me/share/url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(title);
                    window.open(shareUrl, "_blank", "noopener");
                } else if (type === "vk") {
                    shareUrl = "https://vk.com/share.php?url=" + encodeURIComponent(url) + "&title=" + encodeURIComponent(title);
                    window.open(shareUrl, "_blank", "noopener");
                } else if (type === "copy") {
                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(url).then(function () {
                            btn.classList.add("copied");
                            var orig = btn.textContent;
                            btn.textContent = "Скопировано";
                            setTimeout(function () { btn.classList.remove("copied"); btn.textContent = orig; }, 1500);
                        });
                    }
                }
            });
        });
    }

    function renderTags(tags) {
        if (!els.tags) return;
        if (!tags || !tags.length) { els.tags.hidden = true; return; }
        els.tags.innerHTML = "";
        var label = document.createElement("span");
        label.className = "tags-label";
        label.textContent = "Теги:";
        els.tags.appendChild(label);
        tags.forEach(function (t) {
            var a = document.createElement("a");
            a.className = "tag-chip";
            a.href = "/?tag=" + encodeURIComponent(t.slug);
            a.textContent = t.name;
            els.tags.appendChild(a);
        });
        els.tags.hidden = false;
    }

    // Блок «Читайте по теме»: догружаем свежие статьи (исключая текущую).
    function renderRelated(slug) {
        if (!els.relatedSection) return;
        MediaAPI.relatedArticles(slug)
            .then(function (items) {
                if (!items || !items.length) { els.relatedSection.hidden = true; return; }
                els.relatedGrid.innerHTML = "";
                items.forEach(function (a) {
                    var card = document.createElement("article");
                    card.className = "related-card";
                    var link = document.createElement("a");
                    link.className = "related-link";
                    link.href = "/article.html?slug=" + encodeURIComponent(a.slug);

                    if (a.cover_image_url) {
                        var media = document.createElement("div");
                        media.className = "related-card-media";
                        var img = document.createElement("img");
                        img.src = a.cover_image_url;
                        img.alt = "";
                        img.loading = "lazy";
                        media.appendChild(img);
                        link.appendChild(media);
                    }
                    var title = document.createElement("h3");
                    title.className = "related-card-title";
                    title.textContent = a.title;
                    link.appendChild(title);
                    if (a.subtitle) {
                        var sub = document.createElement("p");
                        sub.className = "related-card-subtitle";
                        sub.textContent = a.subtitle;
                        link.appendChild(sub);
                    }
                    card.appendChild(link);
                    els.relatedGrid.appendChild(card);
                });
                els.relatedSection.hidden = false;
            })
            .catch(function () { els.relatedSection.hidden = true; });
    }

    function showError(message) {
        els.loading.hidden = true;
        els.content.hidden = true;
        els.error.hidden = false;
        if (message) {
            var p = els.error.querySelector(".err-detail");
            if (!p) {
                p = document.createElement("p");
                p.className = "err-detail";
                p.style.color = "var(--text-muted)";
                p.style.fontSize = "0.85rem";
                els.error.appendChild(p);
            }
            p.textContent = message;
        }
    }

    /* ---------- init ---------- */

    function getSlug() {
        var p = new URLSearchParams(window.location.search);
        return p.get("slug");
    }

    document.addEventListener("DOMContentLoaded", function () {
        cacheDom();
        if (els.year) els.year.textContent = new Date().getFullYear();

        var slug = getSlug();
        if (!slug) {
            showError();
            return;
        }

        // Загружаем разделы (для навигации + разрешения slug->title), затем
        // статью. renderSectionNav заполняет sectionMap; статья рендерится
        // после этого, чтобы бейдж раздела получил человекочитаемый заголовок.
        renderSectionNav()
            .catch(function () {}) // навигация не критична — продолжаем
            .then(function () {
                return MediaAPI.getArticle(slug);
            })
            .then(function (article) {
                if (!article) { showError("Статья не найдена."); return; }
                try {
                    render(article);
                } catch (e) {
                    showError("Ошибка отрисовки: " + (e && e.message ? e.message : e));
                }
                // «Читайте по теме» — догружаем независимо
                renderRelated(article.slug);
            })
            .catch(function (e) { showError("Ошибка загрузки: " + (e && e.message ? e.message : e)); });
    });
})();
