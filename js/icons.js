/* ============================================================
   TaskTick — SVG-иконки
   ============================================================ */
(function (global) {
  "use strict";

  // Возвращает строку SVG с заданным размером
  function svg(path, size) {
    size = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '">' + path + "</svg>";
  }

  var Icons = {
    check: function (s) { return svg('<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="currentColor"/>', s); },
    plus: function (s) { return svg('<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/>', s); },
    close: function (s) { return svg('<path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z" fill="currentColor"/>', s); },
    trash: function (s) { return svg('<path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>', s); },
    calendar: function (s) { return svg('<path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z" fill="currentColor"/>', s); },
    clock: function (s) { return svg('<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 5h2v5h4v2h-6V7z" fill="currentColor"/>', s); },
    flag: function (s) { return svg('<path d="M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6z" fill="currentColor"/>', s); },
    tag: function (s) { return svg('<path d="M21.4 11.6 12.4 2.6A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 .6 1.4l9 9a2 2 0 0 0 2.8 0l7-7a2 2 0 0 0 0-2.8zM6.5 8A1.5 1.5 0 1 1 8 6.5 1.5 1.5 0 0 1 6.5 8z" fill="currentColor"/>', s); },
    list: function (s) { return svg('<path d="M4 6h2v2H4V6zm0 5h2v2H4v-2zm0 5h2v2H4v-2zM8 6h12v2H8V6zm0 5h12v2H8v-2zm0 5h12v2H8v-2z" fill="currentColor"/>', s); },
    inbox: function (s) { return svg('<path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 2v2h-7V5h7zm-9 0v2H5V5h5zm-5 4h7v2H5V9zm9 0h5v2h-5V9zm-9 4h14v6H5v-6z" fill="currentColor"/>', s); },
    layers: function (s) { return svg('<path d="m12 2 9 5-9 5-9-5 9-5zm0 7 3.6-2L12 5 8.4 7 12 9zm9 3-9 5-9-5 2-1.1L12 15l7-4.1 2 1.1zm0 5-9 5-9-5 2-1.1L12 20l7-4.1 2 1.1z" fill="currentColor"/>', s); },
    subtask: function (s) { return svg('<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4zM9 16.2 4.8 12l-1.4 1.4z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h2l3 3 5-8h2l-6 9-3-3H3z" fill="currentColor"/>', s); },
    flame: function (s) { return svg('<path d="M13.5 2c.2 1.8-.6 3.1-1.6 4.2-.5.5-.9 1.1-1.1 1.7-.3-.4-.5-.9-.5-1.4C9 6 8 4.5 8 3 5.5 4.6 4 7 4 9.8 4 14 7.6 17.5 12 17.5s8-3.5 8-7.7c0-1.7-.6-3.2-1.5-4.6-.5.9-1.1 1.6-1.8 2.2C15.5 6 15.5 3.5 13.5 2zM12 20c-3 0-5.5-2.2-5.5-5 0-1.3.6-2.6 1.4-3.8.4 1 1 2 2 2.7C11 14 12 15.5 12 17.5c.7-.3 1.3-1 1.8-1.9.4 1.5 1.7 2.9 3.7 2.4C17.5 18.6 15 20 12 20z" fill="currentColor"/>', s); },
    search: function (s) { return svg('<path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" fill="currentColor"/>', s); },
    repeat: function (s) { return svg('<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" fill="currentColor"/>', s); },
    note: function (s) { return svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 18H6V4h7v5h5v11z" fill="currentColor"/>', s); },
    sun: function (s) { return svg('<path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM11 2h2v2h-2V2zm0 18h2v2h-2v-2zM2 11h2v2H2v-2zm18 0h2v2h-2v-2zM4.2 4.2l1.4-1.4 1.4 1.4-1.4 1.4-1.4-1.4zm13.6 13.6 1.4-1.4 1.4 1.4-1.4 1.4-1.4-1.4zM4.2 19.8l1.4 1.4 1.4-1.4-1.4-1.4-1.4 1.4zm13.6-13.6 1.4 1.4 1.4-1.4-1.4-1.4-1.4 1.4z" fill="currentColor"/>', s); },
    moon: function (s) { return svg('<path d="M12 3a9 9 0 1 0 9 9c0-.5-.05-1-.13-1.5a7 7 0 0 1-9.37-9.37A9 9 0 0 0 12 3z" fill="currentColor"/>', s); },
    sort: function (s) { return svg('<path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z" fill="currentColor"/>', s); },
    edit: function (s) { return svg('<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>', s); },
    chevron: function (s) { return svg('<path d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4L13.2 12z" fill="currentColor"/>', s); },
    drag: function (s) { return svg('<path d="M9 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm0 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm0 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM15 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm0 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm0 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" fill="currentColor"/>', s); },
    focus: function (s) { return svg('<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 5h2v5h4v2h-6V7z" fill="currentColor"/>', s); },
    bell: function (s) { return svg('<path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.9V4a1 1 0 0 0-2 0v1.1A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z" fill="currentColor"/>', s); },
    columns: function (s) { return svg('<path d="M3 5h5v14H3V5zm6.5 0h5v14h-5V5zM15 5h6v14h-6V5z" fill="currentColor"/>', s); },
    chart: function (s) { return svg('<path d="M4 20h16v2H2V2h2v18zm3-3V9h3v8H7zm5 0V5h3v12h-3zm5 0v-6h3v6h-3z" fill="currentColor"/>', s); },
    play: function (s) { return svg('<path d="M8 5v14l11-7z" fill="currentColor"/>', s); },
    pause: function (s) { return svg('<path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/>', s); },
    chevronLeft: function (s) { return svg('<path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" fill="currentColor"/>', s); },
    checkCircle: function (s) { return svg('<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 14.2-4.2-4.2 1.4-1.4 2.8 2.8 6.8-6.8 1.4 1.4-8.2 8.2z" fill="currentColor"/>', s); },
    select: function (s) { return svg('<path d="M4 6h2v2H4V6zm0 5h2v2H4v-2zm0 5h2v2H4v-2zM8 6h12v2H8V6zm0 5h12v2H8v-2zm0 5h12v2H8v-2z" fill="currentColor"/>', s); },
    broom: function (s) { return svg('<path d="M16.7 3.3a1 1 0 0 1 0 1.4l-1.6 1.6 2.6 2.6 1.6-1.6a1 1 0 0 1 1.4 1.4l-8.5 8.5-5.4-5.4 8.5-8.5a1 1 0 0 1 1.4 0zM5 15.6l3.4 3.4-3 3H2v-3.4l3-3z" fill="currentColor"/>', s); },
    palette: function (s) { return svg('<path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.3-9-7.3zM6.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" fill="currentColor"/>', s); }
  };

  global.Icons = Icons;
})(window);
