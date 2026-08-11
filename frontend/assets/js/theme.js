/* Theme toggle: persists choice in localStorage, respects prefers-color-scheme. */
(function () {
    "use strict";

    var STORAGE_KEY = "media-theme";
    var root = document.documentElement;

    function getStored() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    }
    function setStored(theme) {
        try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
    }

    function applyTheme(theme) {
        root.setAttribute("data-theme", theme);
    }

    function initTheme() {
        var stored = getStored();
        if (stored === "light" || stored === "dark") {
            applyTheme(stored);
        } else {
            var prefersDark = window.matchMedia &&
                window.matchMedia("(prefers-color-scheme: dark)").matches;
            applyTheme(prefersDark ? "dark" : "light");
        }
    }

    // Применяем тему сразу, чтобы избежать «вспышки» при загрузке.
    // Инлайн-скрипт в <head> уже задал тему до отрисовки, а здесь
    // дублируем для надёжности (скрипт грузится в конце body).
    initTheme();

    document.addEventListener("DOMContentLoaded", function () {
        var btn = document.getElementById("theme-toggle");
        if (!btn) return;
        btn.addEventListener("click", function () {
            var current = root.getAttribute("data-theme");
            var next = current === "dark" ? "light" : "dark";
            applyTheme(next);
            setStored(next);
        });
    });
})();
