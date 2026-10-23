// Cookie banner + Google Analytics, loaded only after the visitor says yes.
//
// The CNIL requires consent before any audience-measurement cookie is set, and
// refusing must be as easy as accepting: two buttons of the same size, and
// nothing from Google is requested until "Accept" is pressed. The choice is
// kept for 6 months, then asked again. Any element with data-cookie-settings,
// plus a "Cookies" link added to the footer, reopens the banner.
(function () {
  var GA_ID = "G-G2CYFLHNTC";
  var KEY = "foamies-consent";
  var SIX_MONTHS = 182 * 24 * 60 * 60 * 1000;

  var fr = (document.documentElement.lang || "").toLowerCase().indexOf("fr") === 0;
  var text = fr
    ? {
        body: "On aimerait mesurer l'audience du site avec Google Analytics, qui dépose des cookies. Rien n'est chargé sans ton accord.",
        more: "En savoir plus",
        privacy: "/fr/privacy",
        accept: "Accepter",
        refuse: "Refuser",
        link: "Cookies",
      }
    : {
        body: "We'd like to measure the site's audience with Google Analytics, which sets cookies. Nothing loads without your consent.",
        more: "Learn more",
        privacy: "/privacy",
        accept: "Accept",
        refuse: "Refuse",
        link: "Cookies",
      };

  function readChoice() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved && Date.now() - saved.at < SIX_MONTHS) return saved.choice;
    } catch (e) {}
    return null;
  }

  function saveChoice(choice) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ choice: choice, at: Date.now() }));
    } catch (e) {}
  }

  var gaLoaded = false;
  function loadAnalytics() {
    if (gaLoaded) return;
    gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID);
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(s);
  }

  // Withdrawing consent: delete the cookies Google Analytics set on this domain.
  function clearAnalyticsCookies() {
    document.cookie.split(";").forEach(function (c) {
      var name = c.split("=")[0].trim();
      if (name === "_ga" || name.indexOf("_ga_") === 0) {
        var host = location.hostname.replace(/^www\./, "");
        document.cookie = name + "=; Max-Age=0; path=/";
        document.cookie = name + "=; Max-Age=0; path=/; domain=." + host;
      }
    });
  }

  var banner = null;
  function showBanner() {
    if (banner) return;
    banner = document.createElement("div");
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", text.link);
    banner.style.cssText =
      "position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;max-width:520px;margin:0 auto;" +
      "background:#fff;color:#0D3D47;border-radius:16px;padding:16px 18px;box-shadow:0 8px 30px rgba(0,0,0,.18);" +
      "font:14px/1.45 Quicksand,system-ui,-apple-system,sans-serif;";
    var p = document.createElement("p");
    p.style.cssText = "margin:0 0 12px";
    p.appendChild(document.createTextNode(text.body + " "));
    var a = document.createElement("a");
    a.href = text.privacy;
    a.textContent = text.more;
    a.style.cssText = "color:#E8450A";
    p.appendChild(a);
    banner.appendChild(p);

    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:10px";
    function button(label, filled, choice) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText =
        "flex:1;padding:10px 12px;border-radius:12px;font:inherit;font-weight:700;cursor:pointer;" +
        "border:2px solid #E8450A;" +
        (filled ? "background:#E8450A;color:#fff;" : "background:#fff;color:#E8450A;");
      b.addEventListener("click", function () {
        saveChoice(choice);
        if (choice === "granted") loadAnalytics();
        else clearAnalyticsCookies();
        banner.remove();
        banner = null;
      });
      return b;
    }
    // Same size, side by side: refusing must be as easy as accepting.
    row.appendChild(button(text.refuse, false, "denied"));
    row.appendChild(button(text.accept, true, "granted"));
    banner.appendChild(row);
    document.body.appendChild(banner);
  }

  function addFooterLink() {
    document.addEventListener("click", function (e) {
      var el = e.target.closest && e.target.closest("[data-cookie-settings]");
      if (!el) return;
      e.preventDefault();
      showBanner();
    });
    var footer = document.querySelector("footer");
    if (!footer || footer.querySelector("[data-cookie-settings]")) return;
    var link = document.createElement("a");
    link.href = "#";
    link.setAttribute("data-cookie-settings", "");
    link.textContent = text.link;
    // Next to the privacy link when the footer has one, dressed like it.
    var privacy = footer.querySelector('a[href*="privacy"]');
    if (privacy) {
      link.style.cssText = privacy.style.cssText;
      link.className = privacy.className;
      var inline = privacy.parentNode.tagName === "SPAN";
      privacy.parentNode.insertBefore(link, privacy.nextSibling);
      if (inline) privacy.parentNode.insertBefore(document.createTextNode(" · "), link);
      return;
    }
    var spans = footer.querySelectorAll("span");
    var target = spans.length ? spans[spans.length - 1] : footer;
    target.appendChild(document.createTextNode(" · "));
    target.appendChild(link);
  }

  function start() {
    var choice = readChoice();
    if (choice === "granted") loadAnalytics();
    else if (choice !== "denied") showBanner();
    addFooterLink();
  }

  // The home pages are a bundle that swaps the whole document for the real
  // page once it has unpacked, after "load". Anything added before the swap is
  // thrown away, so wait until the bundle's template is gone (15 s at most).
  function whenPageReady(fn) {
    var waited = 0;
    (function check() {
      var bundling = document.querySelector('script[type="__bundler/template"]');
      if (!bundling || waited >= 15000) return fn();
      waited += 200;
      setTimeout(check, 200);
    })();
  }

  if (document.readyState === "complete") whenPageReady(start);
  else window.addEventListener("load", function () {
    whenPageReady(start);
  });
})();
