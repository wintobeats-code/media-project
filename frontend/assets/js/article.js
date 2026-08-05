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
        els.gallery = document.getElementById("article-images");
        els.footnotes = document.getElementById("article-footnotes");
        els.fnList = document.getElementById("footnotes-list");
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

    function placeholderAvatar(name) {
        var letter = (name || "?").trim().charAt(0).toUpperCase() || "?";
        var span = document.createElement("span");
        span.className = "avatar-placeholder author-avatar author-avatar-lg";
        span.textContent = letter;
        return span;
    }

    /* ---------- body & footnotes ---------- */

    /**
     * Render the markdown body and convert footnote markers.
     *
     * In the admin form, the body is Markdown and `*` denotes a footnote
     * (1st `*` -> footnote #1, etc.). Footnotes are also provided as a
     * separate ordered list (article.footnotes) with {number, text}.
     *
     * Inline images: markers `![n]` in the text reference article.images
     * by their `position` (1-based). We replace them with <figure> blocks.
     *
     * Strategy:
     *  - Before markdown parsing, replace `![n]` with a placeholder token
     *    on its own line so marked wraps it in a <p>; we then swap those
     *    <p> nodes for real <figure> elements after parsing.
     *  - After parsing, replace standalone "*" characters (outside code)
     *    with superscript footnote-reference links, in order of appearance.
     */
    function renderBody(article) {
        var raw = article.body || "";
        var images = (article.images || []).slice();
        var imgByPos = {};
        images.forEach(function (im) { imgByPos[im.position] = im; });

        // 1) Replace ![n] markers with placeholder tokens BEFORE markdown,
        //    so marked doesn't turn them into broken <img> tags.
        //    Token format: @@IMG-n@@ on its own paragraph.
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
        els.body.innerHTML = html;

        // 2) Swap placeholder <p>@@IMG-n@@</p> for real <figure> elements.
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

        // Replace standalone "*" markers with footnote references.
        // Operate on text nodes to avoid touching tags/attributes.
        var footnotes = article.footnotes || [];
        var counter = 0;
        var walker = document.createTreeWalker(els.body, NodeFilter.SHOW_TEXT, null);
        var textNodes = [];
        var node;
        while ((node = walker.nextNode())) {
            // skip inside <code> / <pre>
            if (node.parentElement.closest("code, pre")) continue;
            textNodes.push(node);
        }
        textNodes.forEach(function (tn) {
            var text = tn.nodeValue;
            if (text.indexOf("*") === -1) return;
            var frag = document.createDocumentFragment();
            var last = 0;
            var i;
            while ((i = text.indexOf("*", last)) !== -1) {
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

        // Render footnotes list from the article's footnote records.
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

    // Footnote text may contain simple markdown; render with marked too.
    function renderInline(text) {
        if (!text) return "";
        if (window.marked) {
            try {
                // marked returns block HTML; for inline use, strip wrapping <p>
                var out = window.marked.parseInline(text);
                return out;
            } catch (e) { /* fall through */ }
        }
        return escapeHtml(text);
    }

    /* ---------- gallery ---------- */

    // Shows only images that were NOT embedded inline via `![n]` markers.
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

        // Section badge (resolved to a title via sectionMap).
        if (article.section && els.section) {
            els.section.dataset.slug = article.section;
            els.section.textContent = sectionTitle(article.section);
            els.section.href = "/?section=" + encodeURIComponent(article.section);
            els.section.hidden = false;
        } else if (els.section) {
            els.section.hidden = true;
        }

        els.date.textContent = formatDate(article.published_at || article.created_at);
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

        els.loading.hidden = true;
        els.content.hidden = false;
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

        // Load sections (for nav + section-title resolution), then the article.
        // Sequential to avoid races filling sectionMap.
        renderSectionNav();
        MediaAPI.getArticle(slug)
            .then(function (article) {
                if (!article) { showError("Статья не найдена."); return; }
                // ensure sectionMap is ready before rendering the badge
                var ready = Object.keys(sectionMap).length > 0
                    ? Promise.resolve()
                    : MediaAPI.listSections().then(function (sections) {
                          sections.forEach(function (s) { sectionMap[s.slug] = s.title; });
                      }).catch(function () {});
                return ready.then(function () {
                    try {
                        render(article);
                    } catch (e) {
                        showError("Ошибка отрисовки: " + (e && e.message ? e.message : e));
                    }
                });
            })
            .catch(function (e) { showError("Ошибка загрузки: " + (e && e.message ? e.message : e)); });
    });
})();
