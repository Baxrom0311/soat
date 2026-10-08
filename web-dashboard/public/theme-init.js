// Sets the theme before first paint, so a dark-mode user never sees a white flash.
// A file rather than an inline <script> so the Content-Security-Policy the server
// sends with this page can forbid inline scripts outright.
(function () {
  try {
    var saved = localStorage.getItem('theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = saved ? (saved === 'dark' ? 'dark' : 'light') : (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.getElementById('meta-theme-color');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0A101D' : '#0A6AFA');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
