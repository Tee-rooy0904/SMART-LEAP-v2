(function () {
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const on = (el, event, handler, options) => {
    if (!el) return;
    el.addEventListener(event, handler, options || false);
  };

  const delegate = (root, event, selector, handler) => {
    if (!root) return;
    root.addEventListener(event, (e) => {
      const target = e.target.closest(selector);
      if (target && root.contains(target)) {
        handler(e, target);
      }
    });
  };

  const show = (el) => {
    if (!el) return;
    el.style.display = '';
    el.hidden = false;
  };

  const hide = (el) => {
    if (!el) return;
    el.style.display = 'none';
    el.hidden = true;
  };

  const createEl = (tag, className, attrs = {}) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    Object.keys(attrs).forEach((key) => {
      if (key === 'text') {
        el.textContent = attrs[key];
      } else if (key === 'html') {
        el.innerHTML = attrs[key];
      } else {
        el.setAttribute(key, attrs[key]);
      }
    });
    return el;
  };

  const setHTML = (el, html) => {
    if (!el) return;
    el.innerHTML = html;
  };

  const clearChildren = (el) => {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  };

  window.App = window.App || {};
  window.App.dom = { qs, qsa, on, delegate, show, hide, createEl, setHTML, clearChildren };
})();
