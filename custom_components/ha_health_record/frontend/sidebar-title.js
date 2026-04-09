/**
 * Sidebar title localization for ha_health_record.
 * Loaded on every page via add_extra_js_url() so that the sidebar
 * displays the correct language even before the user visits the panel.
 */
(function () {
  'use strict';

  var PANEL_URL = '/ha-health-record';
  var PANEL_KEY = 'ha-health-record';

  var TITLES = {
    'en': 'Health Record',
    'zh-Hant': '\u5065\u5eb7\u7d00\u9304',
    'zh-Hans': '\u5065\u5eb7\u8bb0\u5f55'
  };

  function getLanguage(hass) {
    var locale = (hass && hass.language) || (hass && hass.locale && hass.locale.language) || navigator.language || 'en';
    if (TITLES[locale]) return locale;
    if (locale.indexOf('zh-TW') === 0 || locale.indexOf('zh-HK') === 0) return 'zh-Hant';
    if (locale.indexOf('zh-CN') === 0 || locale.indexOf('zh-SG') === 0) return 'zh-Hans';
    if (locale.indexOf('zh') === 0) return 'zh-Hans';
    return 'en';
  }

  function getTitle(lang) {
    return TITLES[lang] || TITLES['en'];
  }

  function updateSidebarTitleDOM(title) {
    try {
      var ha = document.querySelector('home-assistant');
      if (!ha || !ha.shadowRoot) return false;
      var main = ha.shadowRoot.querySelector('home-assistant-main');
      if (!main || !main.shadowRoot) return false;
      var drawer = main.shadowRoot.querySelector('ha-drawer');
      if (!drawer) return false;
      var sidebar = drawer.querySelector('ha-sidebar');
      if (!sidebar || !sidebar.shadowRoot) return false;

      var listbox = sidebar.shadowRoot.querySelector('ha-md-list') ||
                    sidebar.shadowRoot.querySelector('paper-listbox');
      if (!listbox) return false;

      // Modern HA: ha-md-list-item with <a> in shadow root
      var items = listbox.querySelectorAll('ha-md-list-item');
      var found = false;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var shadowA = item.shadowRoot && item.shadowRoot.querySelector('a[href="' + PANEL_URL + '"]');
        if (shadowA) {
          var textEl = item.querySelector('.item-text') ||
                       item.querySelector('[slot="headline"]') ||
                       item.querySelector('span');
          if (textEl) {
            textEl.textContent = title;
            found = true;
          }
        }
      }
      if (found) return true;

      // Fallback: older HA with <a> directly in listbox
      var links = listbox.querySelectorAll('a[href="' + PANEL_URL + '"]');
      for (var j = 0; j < links.length; j++) {
        var el = links[j].querySelector('.item-text') ||
                 links[j].querySelector('[slot="headline"]') ||
                 links[j].querySelector('span');
        if (el) {
          el.textContent = title;
          found = true;
        }
      }
      return found;
    } catch (e) {
      return false;
    }
  }

  function updateSidebarTitleViaHass(hass, title) {
    try {
      if (!hass || !hass.panels || !hass.panels[PANEL_KEY]) return false;
      var ha = document.querySelector('home-assistant');
      if (!ha || !ha.shadowRoot) return false;
      var main = ha.shadowRoot.querySelector('home-assistant-main');
      if (!main || !main.hass) return false;

      main.hass.panels[PANEL_KEY].title = title;
      main.hass = Object.assign({}, main.hass);
      return true;
    } catch (e) {
      return false;
    }
  }

  function getHassObject() {
    try {
      var ha = document.querySelector('home-assistant');
      if (!ha || !ha.shadowRoot) return null;
      var main = ha.shadowRoot.querySelector('home-assistant-main');
      return (main && main.hass) ? main.hass : null;
    } catch (e) {
      return null;
    }
  }

  function init() {
    var lastLang = null;
    var attempts = 0;
    var maxAttempts = 30;
    var initDone = false;

    // Retry loop: wait for sidebar DOM to be ready, then update title
    var retryInterval = setInterval(function () {
      attempts++;
      var hass = getHassObject();
      if (!hass) {
        if (attempts >= maxAttempts) clearInterval(retryInterval);
        return;
      }

      var lang = getLanguage(hass);
      var title = getTitle(lang);
      lastLang = lang;

      if (updateSidebarTitleDOM(title)) {
        initDone = true;
        clearInterval(retryInterval);
      } else if (attempts >= maxAttempts) {
        // Last resort: try hass.panels fallback
        updateSidebarTitleViaHass(hass, title);
        initDone = true;
        clearInterval(retryInterval);
      }
    }, 2000);

    // Subscribe to core_config_updated for language changes
    var subscribed = false;
    var subInterval = setInterval(function () {
      if (subscribed) { clearInterval(subInterval); return; }
      var hass = getHassObject();
      if (!hass || !hass.connection) return;
      subscribed = true;
      clearInterval(subInterval);
      try {
        hass.connection.subscribeEvents(function () {
          setTimeout(function () {
            var h = getHassObject();
            if (!h) return;
            var lang = getLanguage(h);
            var title = getTitle(lang);
            if (!updateSidebarTitleDOM(title)) {
              updateSidebarTitleViaHass(h, title);
            }
            lastLang = lang;
          }, 500);
        }, 'core_config_updated');
      } catch (e) { /* ignore */ }
    }, 1000);

    // Polling fallback: detect Profile Language changes every 5s
    setInterval(function () {
      var hass = getHassObject();
      if (!hass) return;
      var lang = getLanguage(hass);
      if (lang !== lastLang) {
        lastLang = lang;
        var title = getTitle(lang);
        if (!updateSidebarTitleDOM(title)) {
          updateSidebarTitleViaHass(hass, title);
        }
      }
    }, 5000);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
