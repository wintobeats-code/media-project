/* Обёртка над публичным API. Один origin, CORS не нужен. */
(function (global) {
    "use strict";

    var API = {};

    // Таймаут на запросы (мс), чтобы не висеть вечно при зависшем бэкенде.
    var REQUEST_TIMEOUT = 10000;

    function fetchWithTimeout(url, options) {
        options = options || {};
        var controller = new AbortController();
        var timerId = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT);
        options.signal = controller.signal;
        return fetchWithTimeout(url, options).finally(function () { clearTimeout(timerId); });
    }

    /**
     * Fetch a page of published articles.
     * @param {number} page
     * @param {number} perPage
     * @param {object} [filters] - { section: slug, tag: slug, sort: "new|old|popular" }
     * @returns {Promise<Array>}
     */
    API.listArticles = function (page, perPage, filters) {
        filters = filters || {};
        var qs = "?page=" + encodeURIComponent(page || 1) +
                 "&per_page=" + encodeURIComponent(perPage || 12);
        if (filters.section) qs += "&section=" + encodeURIComponent(filters.section);
        if (filters.tag) qs += "&tag=" + encodeURIComponent(filters.tag);
        if (filters.sort) qs += "&sort=" + encodeURIComponent(filters.sort);
        return fetchWithTimeout("/api/articles" + qs)
            .then(function (r) {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            });
    };

    /**
     * Fetch a single article by slug.
     * @param {string} slug
     * @returns {Promise<object>}
     */
    API.getArticle = function (slug) {
        return fetchWithTimeout("/api/articles/" + encodeURIComponent(slug))
            .then(function (r) {
                if (r.status === 404) return null;
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            });
    };

    /**
     * Поставить лайк статье. Возвращает {likes_count, liked}.
     * @param {string} slug
     * @returns {Promise<object>}
     */
    API.likeArticle = function (slug) {
        return fetchWithTimeout("/api/articles/" + encodeURIComponent(slug) + "/like", {
            method: "POST",
        })
            .then(function (r) {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            });
    };

    /** Sections with published counts. */
    API.listSections = function () {
        return fetchWithTimeout("/api/sections")
            .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
    };

    /** Tags with published counts. */
    API.listTags = function () {
        return fetchWithTimeout("/api/tags")
            .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
    };

    /** Трек дня: {value, embed_url}. */
    API.getTrack = function () {
        return fetchWithTimeout("/api/settings/track")
            .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
    };

    /** Связанные статьи (для блока «Читайте по теме»). */
    API.relatedArticles = function (slug) {
        return fetchWithTimeout("/api/articles/" + encodeURIComponent(slug) + "/related")
            .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
    };

    global.MediaAPI = API;
})(window);
