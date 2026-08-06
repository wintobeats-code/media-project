/* Универсальный кастомный dropdown (замена нативному <select>).
   Открывается внутри страницы, полностью стилизован под сайт.

   Использование:
     var dd = createDropdown(document.getElementById("my-dropdown"), {
       items: [{value: "a", label: "Вариант A"}, ...],
       value: "a",            // выбранное значение
       onChange: function(v) { ... },
     });
     dd.setItems([...]);      // обновить список пунктов
     dd.setValue("a");        // программно выбрать
*/
(function (global) {
    "use strict";

    function createDropdown(root, opts) {
        opts = opts || {};
        var btn = root.querySelector("[data-dropdown-toggle]");
        var valueEl = root.querySelector("[data-dropdown-value]");
        var menu = root.querySelector("[data-dropdown-menu]");
        var items = opts.items || [];
        var value = opts.value != null ? opts.value : (items[0] && items[0].value) || "";
        var onChange = opts.onChange || function () {};
        var focusedIndex = -1;

        function findIndex(val) {
            for (var i = 0; i < items.length; i++) {
                if (items[i].value === val) return i;
            }
            return -1;
        }

        function labelOf(val) {
            var i = findIndex(val);
            return i >= 0 ? items[i].label : "";
        }

        function render() {
            menu.innerHTML = "";
            items.forEach(function (item, idx) {
                var li = document.createElement("li");
                li.setAttribute("role", "option");
                var b = document.createElement("button");
                b.type = "button";
                b.className = "dropdown-item";
                b.textContent = item.label;
                b.dataset.value = item.value;
                if (item.value === value) b.classList.add("active");
                b.addEventListener("click", function () {
                    select(item.value);
                    close();
                    btn.focus();
                });
                b.addEventListener("mouseenter", function () {
                    setFocusedIndex(idx);
                });
                li.appendChild(b);
                menu.appendChild(li);
            });
            valueEl.textContent = labelOf(value) || "—";
        }

        function setFocusedIndex(idx) {
            focusedIndex = idx;
            var els = menu.querySelectorAll(".dropdown-item");
            els.forEach(function (el, i) {
                el.classList.toggle("focused", i === idx);
                if (i === idx) {
                    // прокрутка к элементу при необходимости
                    var r = el.getBoundingClientRect();
                    var mr = menu.getBoundingClientRect();
                    if (r.top < mr.top) menu.scrollTop -= (mr.top - r.top);
                    else if (r.bottom > mr.bottom) menu.scrollTop += (r.bottom - mr.bottom);
                }
            });
        }

        function select(val) {
            if (val === value) return;
            value = val;
            render();
            onChange(val);
        }

        function open() {
            // закрыть другие открытые dropdown'ы
            var opened = document.querySelectorAll(".dropdown.open");
            opened.forEach(function (d) {
                if (d !== root) d.classList.remove("open");
            });
            root.classList.add("open");
            btn.setAttribute("aria-expanded", "true");
            setFocusedIndex(findIndex(value));
        }

        function close() {
            root.classList.remove("open");
            btn.setAttribute("aria-expanded", "false");
            focusedIndex = -1;
        }

        function toggle() {
            if (root.classList.contains("open")) close();
            else open();
        }

        // События
        btn.addEventListener("click", toggle);
        // Клавиатура на кнопке
        btn.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                e.preventDefault();
                open();
                var idx = findIndex(value);
                setFocusedIndex(idx >= 0 ? idx : 0);
            } else if (e.key === "Escape") {
                close();
            }
        });
        // Клавиатура внутри меню (keydow всплывает к root)
        root.addEventListener("keydown", function (e) {
            if (!root.classList.contains("open")) return;
            var els = menu.querySelectorAll(".dropdown-item");
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setFocusedIndex(Math.min(focusedIndex + 1, els.length - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setFocusedIndex(Math.max(focusedIndex - 1, 0));
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (focusedIndex >= 0 && els[focusedIndex]) {
                    select(els[focusedIndex].dataset.value);
                    close();
                    btn.focus();
                }
            } else if (e.key === "Escape") {
                close();
                btn.focus();
            }
        });
        // Закрытие по клику вне dropdown
        document.addEventListener("click", function (e) {
            if (!root.contains(e.target)) close();
        });

        render();

        return {
            setItems: function (newItems) {
                items = newItems || [];
                // если текущее значение больше не валидно — сброс
                if (findIndex(value) < 0) value = items[0] ? items[0].value : "";
                render();
            },
            setValue: function (val) { select(val); },
            getValue: function () { return value; },
        };
    }

    global.createDropdown = createDropdown;
})(window);
