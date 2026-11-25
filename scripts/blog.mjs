#!/usr/bin/env node
// Builds the blog of foamiesclub.com from the articles published in Supabase
// (the dashboard's Blog page, admin/phase67 in the app repo).
//
//   node scripts/blog.mjs [--out <dir>]
//   node scripts/blog.mjs --preview <posts.json> --out <dir>
//
// Writes, in English and French:
//   blog/index.html             fr/blog/index.html            the lists
//   blog/<slug>/index.html      fr/blog/<slug>/index.html     the articles
//   blog/rss.xml                fr/blog/rss.xml               the feeds
// the 3 latest articles on the home pages, between the blog:latest markers,
// and the blog part of sitemap.xml, between the blog:start / blog:end markers.
// blog/ and fr/blog/ are rebuilt from scratch each time, so an unpublished or
// renamed article disappears from the site. Nothing else is touched.
//
// Reads BLOG_SUPABASE_URL and BLOG_SUPABASE_KEY (the PUBLIC key: Supabase only
// returns published articles whose date has come — never drafts).
// Plain static HTML, no JavaScript: what Google reads is what people read.
//
// --preview builds the same pages from a local JSON array of articles (drafts
// included), never asks Supabase and never touches the real site: links stay
// on the local server, every page is noindex and the sitemap is left alone.
// Serve <dir> with the site's assets/ next to it to see the real look.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const OUT = resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : ROOT);
const PREVIEW = args.includes("--preview") ? resolve(args[args.indexOf("--preview") + 1]) : null;
if (PREVIEW && OUT === ROOT) {
  console.error("--preview needs --out <dir>: a preview never goes into the site itself.");
  process.exit(1);
}
const SITE = PREVIEW ? "" : "https://foamiesclub.com";
const URL_ = process.env.BLOG_SUPABASE_URL;
const KEY = process.env.BLOG_SUPABASE_KEY;
if (!PREVIEW && (!URL_ || !KEY)) {
  console.error("BLOG_SUPABASE_URL and BLOG_SUPABASE_KEY are required.");
  process.exit(1);
}

// ---- texts ----------------------------------------------------------------
const T = {
  en: {
    home: "/", blog: "/blog/", lang: "en", locale: "en_GB",
    back: "← Back to Foamies", blogTitle: "The Foamies blog",
    blogIntro: "Surf spots, tips for beginners and stories from the Foamies community.",
    eyebrow: "Blog", read: "Read", empty: "First articles coming soon.",
    by: "By", other: "Lire en français", allPosts: "← All articles",
    ctaTitle: "Ready to go?",
    ctaText: "Plan your session on Foamies Club and find surfers to join you.",
    ctaButton: "Plan my session", related: "Read next",
    navFeatures: "features", navPros: "for pros", navFounders: "founders", navApp: "Download the app",
    minRead: "min read", toc: "Contents", share: "Share", copyLink: "Copy link", all: "All", featured: "Featured",
    boxRetenir: "Key points", boxConseil: "Flo's tip", boxApp: "In the Foamies app", fromBlog: "From the blog", terms: "Terms of use", homeLink: "Home", rss: "RSS",
  },
  fr: {
    home: "/fr/", blog: "/fr/blog/", lang: "fr", locale: "fr_FR",
    back: "← Retour sur Foamies", blogTitle: "Le blog Foamies",
    blogIntro: "Spots de surf, conseils pour débuter et histoires de la communauté Foamies.",
    eyebrow: "Blog", read: "Lire", empty: "Les premiers articles arrivent bientôt.",
    by: "Par", other: "Read in English", allPosts: "← Tous les articles",
    ctaTitle: "Prêt·e à y aller ?",
    ctaText: "Planifie ta session sur Foamies Club et trouve des surfeurs pour t'accompagner.",
    ctaButton: "Planifier ma session", related: "À lire aussi",
    navFeatures: "fonctionnalités", navPros: "pour les pros", navFounders: "les fondatrices", navApp: "Télécharger l'app",
    minRead: "min de lecture", toc: "Sommaire", share: "Partager", copyLink: "Copier le lien", all: "Tout", featured: "À la une",
    boxRetenir: "À retenir", boxConseil: "Le conseil de Flo", boxApp: "Dans l'app Foamies", fromBlog: "Sur le blog", terms: "Conditions d'utilisation", homeLink: "Accueil", rss: "RSS",
  },
};

// ---- helpers --------------------------------------------------------------
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Raw HTML in the Markdown is shown as text, never executed: the articles
// come from the dashboard and the writing agent, not from hand-written pages.
marked.use({ renderer: { html: (token) => esc(token.text) } });
const md = (s) => marked.parse(s ?? "", { async: false });

function date(iso, lang) {
  return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

const postUrl = (p, lang) => `${SITE}${T[lang].blog}${p[`slug_${lang}`]}/`;
const when = (p) => p.publish_at ?? p.published_at;

function write(rel, content) {
  const f = join(OUT, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, content);
}

// ---- families -----------------------------------------------------------------
// Each article belongs to one family, shown as a coloured tag from the list to
// the article, with a page per family (/fr/blog/spots/…). Keyed by the French
// slug; a new article that is not listed here lands in "guides".
// PROPOSAL of 20/11, to be validated by Lorène.
const FAMILY_OF = {
  "surf-hiver-europe-novembre-mars": "spots",
  "surf-maroc-meilleurs-spots-surf-trip": "spots",
  "surf-taghazout-spots-niveaux-conseils": "spots",
  "surf-portugal-hiver-peniche-ericeira": "spots",
  "combinaison-surf-temperature-eau": "guides",
  "comprendre-prevision-surf-houle-periode-vent": "guides",
  "surfer-seul-conseils-trouver-partenaires": "guides",
  "taille-planche-surf-debutant": "debuter",
};
const FAMILIES = {
  spots: { path: { fr: "spots", en: "spots" }, label: { fr: "Spots & trips", en: "Spots & trips" } },
  guides: { path: { fr: "guides-pratiques", en: "how-to" }, label: { fr: "Guides pratiques", en: "How-to guides" }, tag: { fr: "Guide pratique", en: "How-to guide" } },
  debuter: { path: { fr: "debuter", en: "beginners" }, label: { fr: "Débuter", en: "Beginners" } },
};
const familyOf = (p) => FAMILY_OF[p.slug_fr] ?? "guides";
const familyUrl = (f, lang) => `${SITE}${T[lang].blog}${FAMILIES[f].path[lang]}/`;
const tagLabel = (f, lang) => (FAMILIES[f].tag ?? FAMILIES[f].label)[lang];
const tag = (f, lang) => `<span class="tag tag-${f}">${esc(tagLabel(f, lang))}</span>`;

// Reading time from the word count, about 200 words a minute.
const minutes = (p, lang) => Math.max(1, Math.round(String(p[`body_${lang}`] ?? "").split(/\s+/).filter(Boolean).length / 200));
const readLabel = (p, lang) => `${minutes(p, lang)} ${T[lang].minRead}`;

// ---- page shell -----------------------------------------------------------
// The site's colours (beige, light blue, teal, orange), Fjalla One for titles
// and Quicksand for text, with the sun and Flo (Claude Design mock-up, 20/11).
// Absolute paths, so it works at any depth (/blog/<slug>/).
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fjalla+One&family=Quicksand:wght@500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font:500 18px/1.7 'Quicksand',system-ui,sans-serif;color:#1f4a46;background:#f5f0e8}
a{color:#c44a1a;text-decoration:none}a:hover{color:#9c3812}
img{max-width:100%}
main{padding-bottom:96px}
/* The home page's header (same links, burger and behaviour) in the blog colours. */
header{position:sticky;top:0;z-index:50;background:rgba(245,240,232,.94);backdrop-filter:blur(10px);border-bottom:1px solid #E6DED0}
.bar{max-width:1240px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:24px}
.bar>a img{height:38px;width:auto;display:block}
.hnav{display:flex;align-items:center;gap:30px;font:600 15px 'Fjalla One','Quicksand',sans-serif;color:#08403c}
.htext{display:flex;align-items:center;gap:22px;white-space:nowrap}.htext a{color:#08403c}
.htext a.cur{color:#c44a1a;border-bottom:2px solid #c44a1a;padding-bottom:3px}
.hdiv{width:1px;height:20px;background:#d6cdbd;margin:0 -14px;flex-shrink:0}
.hlang{display:inline-flex;align-items:center;gap:14px;font:700 14px 'Fjalla One','Quicksand',sans-serif;line-height:1;margin-right:6px}
.hlang a{color:#7a8a86;padding-bottom:3px}.hlang a.cur{color:#08403c;border-bottom:2px solid #c44a1a}
.hcta{background:#08403c;color:#fff!important;border-radius:999px;padding:10px 22px;white-space:nowrap;font:600 15px 'Quicksand',sans-serif}
.hcta:hover{filter:brightness(.88)}
.burger{display:none;flex-direction:column;justify-content:center;align-items:center;gap:5px;width:44px;height:38px;padding:0;background:transparent;border:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.burger span{display:block;width:24px;height:2.5px;border-radius:2px;background:#08403c;transition:transform .22s ease,opacity .18s ease}
.mmenu{border-top:1px solid #E6DED0;background:rgba(245,240,232,.98);max-height:calc(100vh - 70px);overflow-y:auto}
.mmenu[hidden]{display:none!important}
.mmenu .in{max-width:1240px;margin:0 auto;padding:6px 24px 22px}
.mmenu a.ml{display:block;padding:14px 2px;font:600 17px 'Fjalla One','Quicksand',sans-serif;color:#08403c;border-bottom:1px solid #ebe3d6}
.mmenu a.ml.cur{color:#c44a1a}.mmenu a.ml:last-of-type{border-bottom:none}
.mmenu .mcta{display:none;margin-top:18px;text-align:center;background:#08403c;color:#fff;border-radius:999px;padding:14px 22px;font:600 16px 'Quicksand',sans-serif}
@media(max-width:1024px){.htext,.hdiv{display:none!important}.burger{display:inline-flex}}
/* The French menu is longer: it folds into the burger earlier, as on the home page (1140 px). */
@media(max-width:1140px){html[lang="fr"] .htext,html[lang="fr"] .hdiv{display:none!important}html[lang="fr"] .burger{display:inline-flex}}
@media(max-width:640px){.hcta{display:none!important}.mmenu .mcta{display:block}}
.wrap{max-width:1240px;margin:0 auto;padding:0 24px}
.crumbs{font:600 13px 'Quicksand';color:#5b7470;padding:22px 0 0}.crumbs a{color:#5b7470}.crumbs span{color:#08403c}
.eyebrow{font:400 14px 'Fjalla One';letter-spacing:.14em;color:#c44a1a;text-transform:uppercase}
h1{font:400 64px/1.04 'Fjalla One',sans-serif;color:#08403c;text-wrap:balance}
.tag{display:inline-block;border-radius:9px;padding:4px 9px;font:400 12px 'Fjalla One';letter-spacing:.08em;text-transform:uppercase;color:#08403c}
.tag-spots{background:#d7e7e9}.tag-guides{background:#F6DCCD}.tag-debuter{background:#08403c;color:#fff}
.tag-hot{background:#E8450A;color:#fff}.tag-white{background:#fff}
.muted{font:600 14px 'Quicksand';color:#5b7470}
/* list */
.hero{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:40px;align-items:center;padding:28px 0 36px}
.hero h1{margin:14px 0 16px}
.hero .lead{max-width:640px;font:500 20px/1.55 'Quicksand';color:#2f5753}
.art{position:relative;height:340px}
/* As in the mock-up (Claude Design « Blog », 1a): the big orange sun top right,
   Flo the surfer in teal in front of it, bottom left. */
.art .sun{position:absolute;right:0;top:0;width:340px;opacity:.95}
.art .flo{position:absolute;left:30px;bottom:-10px;width:210px;transform:rotate(-6deg)}
.sun-m{display:none}
.filters{display:flex;flex-wrap:wrap;gap:10px;padding-bottom:22px;border-bottom:1px solid #E6DED0}
/* Filters look like filters (25/11): all alike, white with a light outline, the
   chosen one filled in teal. The family colours stay on the article tags only. */
.filters a{display:inline-flex;align-items:center;gap:8px;border-radius:22px;padding:9px 16px;font:700 15px 'Quicksand';color:#08403c;background:#fff;border:1.5px solid #D9D0C1;transition:border-color .15s,background .15s}
.filters a:hover{border-color:#08403c}
.filters a .n{font-weight:600;font-size:13px;color:#7a8f8b}
.filters a.on{background:#08403c;border-color:#08403c;color:#fff}
.filters a.on .n{color:rgba(255,255,255,.75)}
.feat{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);background:#d7e7e9;border-radius:28px;overflow:hidden;color:#08403c;margin-top:36px}
.feat:hover{color:#08403c}
.feat .img{min-height:260px;max-height:320px}.feat .img img,.feat .img .ph{width:100%;height:100%;object-fit:cover;display:block}
.feat .txt{padding:28px 36px;display:flex;flex-direction:column;gap:12px;justify-content:center}
/* Less tall (25/11): smaller title, excerpt cut at 3 lines. */
.feat .t{font:400 34px/1.1 'Fjalla One'}
.feat .x{font:500 16px/1.5 'Quicksand';color:#2f5753;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.go{font:700 16px 'Quicksand';color:#c44a1a;text-underline-offset:4px}
/* On the featured card, « Read » underlines on hover, not the arrow (25/11). */
.feat:hover .go .u{text-decoration:underline}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px;margin-top:36px}
.card{display:flex;flex-direction:column;background:#fff;border-radius:22px;overflow:hidden;color:#08403c;transition:transform .25s ease,box-shadow .25s ease}
/* Hover (25/11): the card lifts a little and its photo zooms in slowly, instead
   of an underlined title. */
.card:hover{color:#08403c;transform:translateY(-4px);box-shadow:0 14px 32px rgba(8,64,60,.12)}
.card .img img,.feat .img img{transition:transform .45s ease}
.card:hover .img img,.feat:hover .img img{transform:scale(1.04)}
.feat{transition:box-shadow .25s ease}.feat:hover{box-shadow:0 14px 32px rgba(8,64,60,.12)}
@media(prefers-reduced-motion:reduce){.card,.card .img img,.feat .img img{transition:none}.card:hover{transform:none}.card:hover .img img,.feat:hover .img img{transform:none}}
.card .img{aspect-ratio:16/10;overflow:hidden;background:#d7e7e9}.card .img img{width:100%;height:100%;object-fit:cover;display:block}
.card .txt{padding:18px 22px 24px;display:flex;flex-direction:column;gap:10px}
.card .t{font:400 26px/1.15 'Fjalla One';text-wrap:balance}
/* The app's hero (25/11): the sea gradient, with Flo big and faint on the right. */
.band{position:relative;overflow:hidden;background:linear-gradient(120deg,#092530 0%,#134656 55%,#2C7A8E 100%);color:#fff;border-radius:28px;padding:36px 44px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:30px;align-items:center;margin-top:36px}
.band .wm{position:absolute;right:-40px;top:-30px;width:280px;opacity:.1;transform:rotate(-12deg);pointer-events:none}
.band>div,.band .btn{position:relative}
.band h2{font:400 32px/1.1 'Fjalla One';color:#fff;margin:0 0 6px}
.band p{font:500 16px/1.5 'Quicksand';opacity:.85;margin:0}
.btn{display:inline-block;background:#E8450A;color:#fff;font:700 16px 'Quicksand';padding:13px 22px;border-radius:14px;white-space:nowrap}
.btn:hover{color:#fff;opacity:.92}
.empty{margin:36px 0}
/* article */
.ahero{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:56px;align-items:center;padding:28px 0 44px}
.ahero h1{font-size:58px;margin:16px 0}
.ahero .lead{font:500 21px/1.55 'Quicksand';color:#2f5753;margin-bottom:18px}
.byline{display:flex;flex-direction:column;gap:2px}.byline b{font:700 15px 'Quicksand';color:#08403c}
.cov{position:relative}.cov .c{aspect-ratio:16/10;border-radius:28px;overflow:hidden;background:#d7e7e9}
.cov .c img{width:100%;height:100%;object-fit:cover;display:block}
.body{display:grid;grid-template-columns:240px minmax(0,720px) minmax(0,1fr);gap:64px;align-items:start}
.toc{position:sticky;top:84px;display:flex;flex-direction:column;gap:14px}
.toc .box{background:#fff;border-radius:20px;padding:18px}
.toc .h{font:400 13px 'Fjalla One';letter-spacing:.12em;color:#5b7470;text-transform:uppercase;display:block;padding-bottom:6px}
.toc ol{list-style:none}.toc li a{display:flex;gap:10px;padding:6px 0;font:600 15px/1.35 'Quicksand';color:#08403c}
.toc li a span{font:400 14px 'Fjalla One';color:#c44a1a}
.pills{display:flex;flex-wrap:wrap;gap:8px;font:700 13px 'Quicksand'}
.pills a,.pills button{border:1.5px solid #08403c;border-radius:12px;padding:7px 12px;color:#08403c;background:none;font:inherit;cursor:pointer}
article{font:500 19px/1.75 'Quicksand';color:#1f4a46}
article h2{font:400 34px/1.15 'Fjalla One';color:#08403c;margin:40px 0 14px;scroll-margin-top:84px}
article h3{font:700 21px/1.35 'Quicksand';color:#08403c;margin:28px 0 8px}
article p{margin:0 0 18px}
article ul,article ol{margin:0 0 18px 24px}article li{margin-bottom:8px}
article img{border-radius:16px;margin:12px 0}
article blockquote{border-left:4px solid #d7e7e9;padding:4px 0 4px 18px;margin:18px 0;color:#08403c;font-style:italic}
article strong{color:#08403c}
article table{border-collapse:separate;border-spacing:0;width:100%;margin:22px 0;font:600 16px/1.4 'Quicksand';background:#fff;border-radius:22px;overflow:hidden}
article th{background:#08403c;color:#fff;font:400 13px 'Fjalla One';letter-spacing:.1em;text-transform:uppercase;text-align:left;padding:14px 18px}
article td{text-align:left;padding:13px 18px;border-top:1px solid #EFE8DC}
article td:first-child{font-weight:700;color:#08403c}
.box-retenir{background:#d7e7e9;border-radius:22px;padding:22px 26px;margin:22px 0}
.box-conseil{position:relative;background:#F6DCCD;border-radius:22px;padding:22px 26px 22px 124px;margin:22px 0;min-height:110px}
.box-conseil img{position:absolute;left:18px;top:50%;transform:translateY(-50%) rotate(-8deg);width:88px;margin:0}
.box-app{background:#08403c;color:#fff;border-radius:22px;padding:22px 26px;margin:22px 0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px;align-items:center}
.box-app p{margin:0;font:400 24px/1.2 'Fjalla One';color:#fff}
.box-h{display:flex;align-items:center;gap:8px;font:400 14px 'Fjalla One';letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;color:#08403c}
.box-h img{width:22px;margin:0}
.box-conseil .box-h{color:#9c3812}.box-app .box-h{color:#FFCB47}
.box-retenir p:last-child,.box-conseil p:last-child{margin:0}
.spot{background:#fff;border-radius:18px;padding:16px 20px;margin:18px 0;display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:18px;align-items:center;font:600 15px 'Quicksand'}
.spot b{font:400 22px 'Fjalla One';color:#08403c}
.faq{display:flex;flex-direction:column;gap:10px;margin:0 0 18px}
.faq details{background:#fff;border-radius:18px;padding:16px 22px}
.faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:16px;font:700 18px/1.4 'Quicksand';color:#08403c}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:'+';flex:none;width:28px;height:28px;border-radius:50%;border:1.5px solid #08403c;display:grid;place-items:center}
.faq details[open] summary::after{content:'−';background:#E8450A;border-color:#E8450A;color:#fff}
.faq details>*:not(summary){margin-top:10px}
.after{margin-top:18px;border-top:2px solid #E6DED0;padding-top:24px;display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.next{margin-top:64px;padding:48px 0 56px;background:#d7e7e9}
.next .head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap}
.next h2{font:400 40px 'Fjalla One';color:#08403c}
/* Justified, as asked: both edges straight. Hyphenation (the page carries
   its lang) keeps the gaps between words small on a phone. */
article p,article li{text-align:justify;hyphens:auto;-webkit-hyphens:auto}
footer{background:#08403c;color:#bfe0e6}
.foot{max-width:1240px;margin:0 auto;padding:28px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;font:600 13px 'Quicksand'}
.foot img{height:40px;width:auto;display:block}
footer a{color:#fff}
@media(max-width:1100px){.body{grid-template-columns:minmax(0,1fr)}.toc{display:none}.ahero{grid-template-columns:1fr}.ahero .cov{order:-1}}
@media(max-width:860px){h1,.ahero h1{font-size:40px}.hero{grid-template-columns:1fr;position:relative;overflow:hidden}.art{display:none}.sun-m{display:block;position:absolute;right:-30px;top:-10px;width:150px;opacity:.9}.htxt{position:relative}
.filters{flex-wrap:nowrap;overflow-x:auto;margin:0 -24px;padding:0 24px 18px}.filters a{flex:none}
.feat{grid-template-columns:1fr}.feat .img{min-height:0;max-height:none;aspect-ratio:16/9}.feat .txt{padding:20px}.feat .t{font-size:26px}
.grid{grid-template-columns:1fr;gap:12px}.card{flex-direction:row;align-items:center;border-radius:18px}.card .img{flex:none;width:120px;border-radius:14px;margin:10px}.card .txt{padding:10px 14px 10px 4px;gap:6px}.card .t{font-size:19px}.card .x{display:none}
.band{grid-template-columns:1fr;padding:24px;text-align:left}.band .wm{width:200px;right:-50px;top:-20px}
article{font-size:18px}article h2{font-size:28px}article table{display:block;overflow-x:auto;font-size:14px}.box-conseil{padding-left:26px}.box-conseil img{display:none}.box-app{grid-template-columns:1fr}
.spot{grid-template-columns:1fr 1fr}.next h2{font-size:30px}.next .grid .card .img{width:96px}}
`.trim();

// The site's header: logo, the home page's sections, blog marked as the
// current one, the EN/FR switch to this same page in the other language, the
// app button, and the burger menu on phones (with the home page's script).
function header(lang, alternates) {
  const t = T[lang];
  const other = lang === "fr" ? "en" : "fr";
  const links = [["features", t.navFeatures], ["pros", t.navPros], ["founders", t.navFounders], ["blog", "blog"], ["faq", "faq"]];
  const href = (k) => (k === "blog" ? t.blog : `${t.home}#${k}`);
  // A path, not a full address, so the switch also works on a local preview.
  const otherUrl = (alternates ? alternates[other] : T[other].blog).replace(SITE, "");
  const langs = lang === "fr"
    ? `<a href="${otherUrl}" hreflang="en">EN</a><a class="cur" aria-current="page" href="#">FR</a>`
    : `<a class="cur" aria-current="page" href="#">EN</a><a href="${otherUrl}" hreflang="fr">FR</a>`;
  return `<header>
    <div class="bar">
      <a href="${t.home}"><img width="600" height="207" src="/assets/logo.png" alt="Foamies"></a>
      <nav class="hnav">
        <span class="htext">${links.map(([k, l]) => `<a href="${href(k)}"${k === "blog" ? ' class="cur" aria-current="page"' : ""}>${esc(l)}</a>`).join("")}</span>
        <span class="hdiv" aria-hidden="true"></span><span class="hlang">${langs}</span><a class="hcta" href="/app/">${esc(t.navApp)}</a>
        <button type="button" class="burger" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
      </nav>
    </div>
    <div id="fm-menu" hidden class="mmenu"><div class="in">
      ${links.map(([k, l]) => `<a class="ml${k === "blog" ? " cur" : ""}" href="${href(k)}">${esc(l)}</a>`).join("\n      ")}
      <a class="mcta" href="/app/">${esc(t.navApp)}</a>
    </div></div>
  </header>
  <script>
  // The home page's phone menu (assets/home.js), on its own here.
  (function(){var b=document.querySelector(".burger"),m=document.getElementById("fm-menu");if(!b||!m)return;
  function set(o){m.hidden=!o;b.setAttribute("aria-expanded",o?"true":"false");var s=b.querySelectorAll("span");s[0].style.transform=o?"translateY(7.5px) rotate(45deg)":"";s[1].style.opacity=o?"0":"";s[2].style.transform=o?"translateY(-7.5px) rotate(-45deg)":"";}
  b.addEventListener("click",function(){set(m.hidden);});m.addEventListener("click",function(e){if(e.target.closest("a"))set(false);});})();
  </script>`;
}

function page({ lang, title, description, canonical, alternates, ogImage, ogType, jsonLd, body, noindex }) {
  const t = T[lang];
  const alt = alternates
    ? `<link rel="alternate" hreflang="en" href="${alternates.en}">
  <link rel="alternate" hreflang="fr" href="${alternates.fr}">
  <link rel="alternate" hreflang="x-default" href="${alternates.en}">`
    : "";
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  ${noindex || PREVIEW ? '<meta name="robots" content="noindex">' : ""}
  <link rel="canonical" href="${canonical}">
  ${alt}
  <link rel="icon" href="/assets/favicon.png">
  <link rel="alternate" type="application/rss+xml" title="${esc(t.blogTitle)}" href="${SITE}${t.blog}rss.xml">
  <meta property="og:type" content="${ogType}">
  <meta property="og:locale" content="${t.locale}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ogImage}">
  <meta name="twitter:card" content="summary_large_image">
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
  <style>${CSS}</style>
  <script src="/assets/consent.js" defer></script>
</head>
<body>
  ${header(lang, alternates)}
  <main>
${body}
  </main>
  <footer>
    <div class="foot">
      <img src="/assets/blog/flo-white.png" alt="" loading="lazy">
      <span>© ${new Date().getFullYear()} Foamies · foamiesclub.com</span>
      <span><a href="${t.blog}">Blog</a> · <a href="${t.blog}rss.xml">${t.rss}</a> · <a href="${lang === "fr" ? "/fr/terms" : "/terms"}">${esc(t.terms)}</a> · <a href="${t.home}">${esc(t.homeLink)}</a></span>
    </div>
  </footer>
</body>
</html>
`;
}

// The app box: the same texts as before, in the mock-up's teal band with Flo.
function cta(lang) {
  const t = T[lang];
  return `<aside class="band">
      <img class="wm" src="/assets/blog/flo-white.png" alt="" loading="lazy">
      <div><h2>${esc(t.ctaTitle)}</h2><p>${esc(t.ctaText)}</p></div>
      <a class="btn" href="/app/">${esc(t.ctaButton)}</a>
    </aside>`;
}

// A lighter version of a cover: some weigh over 2 MB. Supabase resizes images
// stored with it; anything else is shown as it is.
const thumb = (url, width = 800, quality = 70) =>
  url.includes("/storage/v1/object/public/")
    ? `${url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/")}?width=${width}&resize=contain&quality=${quality}`
    : url;

// A card: cover cropped 16:10 whatever its shape, family, title, reading time.
function card(p, lang) {
  return `<a class="card" href="${postUrl(p, lang)}">
          <div class="img">${p.cover_url ? `<img src="${esc(thumb(p.cover_url))}" alt="" width="800" height="500" loading="lazy">` : ""}</div>
          <div class="txt">
            <div>${tag(familyOf(p), lang)}</div>
            <span class="t">${esc(p[`title_${lang}`])}</span>
            <span class="muted">${readLabel(p, lang)} · ${date(when(p), lang)}</span>
          </div>
        </a>`;
}

// "Read next": the 3 articles that follow this one in the list, starting again
// from the top at the end. Every article gets links this way, not just the
// newest, and only published articles are in the list, so none can be a 404.
function related(p, posts, lang) {
  const at = posts.indexOf(p);
  const next = posts.map((_, i) => posts[(at + 1 + i) % posts.length]).filter((o) => o !== p).slice(0, 3);
  if (!next.length) return "";
  return `<aside class="next">
      <div class="wrap">
        <div class="head"><h2>${esc(T[lang].related)}</h2><a class="go" href="${T[lang].blog}">${esc(T[lang].allPosts)}</a></div>
        <div class="grid">
        ${next.map((o) => card(o, lang)).join("\n        ")}
        </div>
      </div>
    </aside>`;
}

// ---- article body: table of contents and the optional blocks ---------------
const slugify = (s) =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "partie";

// The optional blocks the dashboard can write (an article without them renders
// exactly as before):
//   > [!retenir] … · > [!conseil] … · > [!app] text | /app
//   ## FAQ, then ### Question + answer, until the next ## heading
//   [spot] Name | Level | Season | Type
// They are swapped for placeholders before Markdown, and the placeholders for
// their HTML after, because raw HTML in the Markdown is escaped on purpose.
function renderBody(src, lang) {
  const t = T[lang];
  const blocks = [];
  const hold = (html) => `\n\nFOAMIESBLOCK${blocks.push(html) - 1}\n\n`;
  const inline = (s) => marked.parseInline(s, { async: false });
  let text = String(src ?? "").replace(/\r\n/g, "\n");

  // > [!type] … callouts (consecutive "> " lines).
  text = text.replace(/^> \[!(retenir|conseil|app)\][^\n]*(?:\n>[^\n]*)*/gm, (all, kind) => {
    const lines = all.split("\n").map((l) => l.replace(/^> ?/, ""));
    lines[0] = lines[0].replace(/^\[!\w+\]\s*/, "");
    const inner = lines.join("\n").trim();
    if (kind === "app") {
      const [label, href = "/app/"] = inner.split("|").map((s) => s.trim());
      return hold(`<aside class="box-app"><div><div class="box-h">${esc(t.boxApp)}</div><p>${inline(label)}</p></div><a class="btn" href="${esc(href)}">${esc(t.ctaButton)}</a></aside>`);
    }
    const body = marked.parse(inner, { async: false });
    if (kind === "retenir") return hold(`<aside class="box-retenir"><div class="box-h"><img src="/assets/blog/sun-teal.png" alt="">${esc(t.boxRetenir)}</div>${body}</aside>`);
    return hold(`<aside class="box-conseil"><img src="/assets/blog/flo-orange.png" alt=""><div class="box-h">${esc(t.boxConseil)}</div>${body}</aside>`);
  });

  // [spot] Name | Level | Season | Type
  text = text.replace(/^\[spot\]\s*([^\n]+)$/gm, (all, rest) => {
    const [name, ...more] = rest.split("|").map((s) => s.trim());
    return hold(`<div class="spot"><b>${esc(name)}</b>${more.map((m) => `<span>${esc(m)}</span>`).join("")}</div>`);
  });

  // ## FAQ: the ### questions under it become native <details>, no script.
  text = text.replace(/^## FAQ[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m, (all, section) => {
    const items = section.split(/^### /m).slice(1).map((q) => {
      const [question, ...answer] = q.split("\n");
      return `<details><summary>${inline(question.trim())}</summary>${marked.parse(answer.join("\n").trim(), { async: false })}</details>`;
    });
    if (!items.length) return all;
    return `## FAQ\n${hold(`<div class="faq">${items.join("")}</div>`)}`;
  });

  // Headings get an id, and the ## ones make the table of contents.
  const toc = [];
  const used = new Set();
  const renderer = new marked.Renderer();
  const plain = marked.Renderer.prototype.heading;
  renderer.heading = function (token) {
    if (token.depth !== 2) return plain.call(this, token);
    let id = slugify(token.text);
    while (used.has(id)) id += "-2";
    used.add(id);
    toc.push({ id, text: token.text });
    return `<h2 id="${id}">${this.parser.parseInline(token.tokens)}</h2>\n`;
  };
  renderer.html = (token) => esc(token.text);
  let html = marked.parse(text, { async: false, renderer });
  html = html.replace(/<p>FOAMIESBLOCK(\d+)<\/p>\n?/g, (all, i) => blocks[Number(i)]);
  return { html, toc };
}

function tocHtml(toc, lang) {
  if (toc.length < 2) return "";
  const items = toc.map((h, i) => `<li><a href="#${h.id}"><span>${String(i + 1).padStart(2, "0")}</span>${marked.parseInline(h.text, { async: false }).replace(/<[^>]+>/g, "")}</a></li>`).join("");
  return `<ol>${items}</ol>`;
}

// ---- pages ----------------------------------------------------------------
function articlePage(p, lang, posts) {
  const t = T[lang];
  const other = lang === "fr" ? "en" : "fr";
  const url = postUrl(p, lang);
  const fam = familyOf(p);
  const title = p[`title_${lang}`];
  const description = p[`meta_description_${lang}`] || p[`excerpt_${lang}`] || "";
  const image = p.cover_url ? thumb(p.cover_url, 1600, 75) : `${SITE}/assets/share-${lang}.jpg`;
  const home = lang === "fr" ? "/fr/" : "/";
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t.homeLink, item: `${SITE}${home}` },
      { "@type": "ListItem", position: 2, name: t.eyebrow, item: `${SITE}${t.blog}` },
      { "@type": "ListItem", position: 3, name: FAMILIES[fam].label[lang], item: familyUrl(fam, lang) },
      { "@type": "ListItem", position: 4, name: title, item: url },
    ],
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    image: [image],
    datePublished: when(p),
    dateModified: p.updated_at,
    inLanguage: lang,
    author: { "@type": "Organization", name: p.author, url: SITE },
    publisher: { "@type": "Organization", name: "Foamies", logo: { "@type": "ImageObject", url: `${SITE}/assets/logo.png` } },
    mainEntityOfPage: url,
  };
  const { html, toc } = renderBody(p[`body_${lang}`], lang);
  const list = tocHtml(toc, lang);
  const share = `<a href="https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}" rel="noopener" target="_blank">WhatsApp</a><button type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText('${url}').then(()=>{this.textContent='✓'})">${esc(t.copyLink)}</button>`;
  const body = `    <div class="wrap">
      <nav class="crumbs"><a href="${home}">${esc(t.homeLink)}</a> › <a href="${t.blog}">${esc(t.eyebrow)}</a> › <a href="${familyUrl(fam, lang)}">${esc(FAMILIES[fam].label[lang])}</a></nav>
      <div class="ahero">
        <div>
          ${tag(fam, lang)}
          <h1>${esc(title)}</h1>
          ${p[`excerpt_${lang}`] ? `<p class="lead">${esc(p[`excerpt_${lang}`])}</p>` : ""}
          <div class="byline"><b>${t.by} ${esc(p.author)}</b><span class="muted">${date(when(p), lang)} · ${readLabel(p, lang)}</span></div>
        </div>
        ${p.cover_url ? `<div class="cov"><div class="c"><img src="${esc(image)}" alt="${esc(title)}" width="1600" height="1000" fetchpriority="high"></div></div>` : ""}
      </div>
      <div class="body">
        <nav class="toc">
          ${list ? `<div class="box"><span class="h">${esc(t.toc)}</span>${list}</div>` : ""}
          <div class="pills"><a href="${postUrl(p, other)}" hreflang="${other}">${esc(t.other)}</a></div>
        </nav>
        <article>
          ${html}
          <!-- TODO bios : Lorène et Théa écriront leurs deux lignes de présentation (bloc auteures de la maquette Claude Design), à mettre ici. -->
          <div class="after pills"><span class="muted">${esc(t.share)}</span>${share}<a href="${postUrl(p, other)}" hreflang="${other}" style="margin-left:auto">${esc(t.other)}</a></div>
          ${cta(lang)}
        </article>
        <div></div>
      </div>
    </div>
    ${related(p, posts, lang)}`;
  return page({
    lang, title: `${title} | Foamies`, description, canonical: url,
    alternates: { en: postUrl(p, "en"), fr: postUrl(p, "fr") },
    ogImage: image, ogType: "article", jsonLd: [jsonLd, breadcrumb], body,
  });
}

// The blog list, or one family's list when `fam` is given.
function listPage(posts, lang, fam = null) {
  const t = T[lang];
  const home = lang === "fr" ? "/fr/" : "/";
  const shown = fam ? posts.filter((p) => familyOf(p) === fam) : posts;
  const count = (f) => posts.filter((p) => familyOf(p) === f).length;
  const filters = `<nav class="filters">
      <a href="${t.blog}" class="${fam ? "" : "on"}"${fam ? "" : ' aria-current="page"'}>${esc(t.all)} <span class="n">${posts.length}</span></a>
      ${Object.keys(FAMILIES).filter((f) => count(f) > 0 || f === fam).map((f) => `<a href="${familyUrl(f, lang)}" class="f-${f}${fam === f ? " on" : ""}"${fam === f ? ' aria-current="page"' : ""}>${esc(FAMILIES[f].label[lang])} <span class="n">${count(f)}</span></a>`).join("\n      ")}
    </nav>`;
  // On the full list the newest article is featured; a family page lists all.
  const [first, ...rest] = shown;
  const featured = !fam && first ? `<a class="feat" href="${postUrl(first, lang)}">
        <div class="img">${first.cover_url ? `<img src="${esc(thumb(first.cover_url, 1200))}" alt="" width="1200" height="750">` : '<div class="ph"></div>'}</div>
        <div class="txt">
          <div><span class="tag tag-hot">${esc(t.featured)}</span> <span class="tag tag-white">${esc(tagLabel(familyOf(first), lang))}</span></div>
          <span class="t">${esc(first[`title_${lang}`])}</span>
          <span class="x">${esc(first[`excerpt_${lang}`] || first[`meta_description_${lang}`] || "")}</span>
          <span class="muted">${esc(first.author)} · ${readLabel(first, lang)} · ${date(when(first), lang)}</span>
          <span class="go"><span class="u">${esc(t.read)}</span> →</span>
        </div>
      </a>` : "";
  const cards = fam ? shown : rest;
  const row1 = cards.slice(0, 3).map((p) => card(p, lang)).join("\n      ");
  const more = cards.slice(3).map((p) => card(p, lang)).join("\n      ");
  const h1 = fam ? FAMILIES[fam].label[lang] : t.blogTitle;
  const body = `    <div class="wrap">
      <nav class="crumbs"><a href="${home}">${esc(t.homeLink)}</a> › ${fam ? `<a href="${t.blog}">${esc(t.eyebrow)}</a> › <span>${esc(h1)}</span>` : `<span>${esc(t.eyebrow)}</span>`}</nav>
      <div class="hero">
        <img class="sun-m" src="/assets/blog/sun-orange.svg" alt="">
        <div class="htxt">
          ${fam ? `<div class="eyebrow">${esc(t.blogTitle)}</div>` : ""}
          <h1>${esc(h1)}</h1>
          <p class="lead">${esc(t.blogIntro)}</p>
        </div>
        <div class="art"><img class="sun" src="/assets/blog/sun-orange.svg" alt=""><img class="flo" src="/assets/blog/flo-fig-teal.png" alt=""></div>
      </div>
      ${filters}
      ${shown.length ? `${featured}
      ${row1 ? `<div class="grid">\n      ${row1}\n      </div>` : ""}
      ${cta(lang)}
      ${more ? `<div class="grid">\n      ${more}\n      </div>` : ""}` : `<p class="empty">${esc(t.empty)}</p>\n      ${cta(lang)}`}
    </div>`;
  const canonical = fam ? familyUrl(fam, lang) : `${SITE}${t.blog}`;
  return page({
    lang, title: `${h1} | Foamies`, description: t.blogIntro,
    canonical,
    alternates: fam ? { en: familyUrl(fam, "en"), fr: familyUrl(fam, "fr") } : { en: `${SITE}/blog/`, fr: `${SITE}/fr/blog/` },
    ogImage: `${SITE}/assets/share-${lang}.jpg`, ogType: "website",
    jsonLd: { "@context": "https://schema.org", "@type": "Blog", name: h1, url: canonical, inLanguage: lang },
    body,
    // An empty blog (or family) is not worth indexing yet.
    noindex: shown.length === 0,
  });
}

function rss(posts, lang) {
  const t = T[lang];
  const items = posts.map((p) => `    <item>
      <title>${esc(p[`title_${lang}`])}</title>
      <link>${postUrl(p, lang)}</link>
      <guid isPermaLink="true">${postUrl(p, lang)}</guid>
      <pubDate>${new Date(when(p)).toUTCString()}</pubDate>
      <description>${esc(p[`excerpt_${lang}`] || p[`meta_description_${lang}`] || "")}</description>
    </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(t.blogTitle)}</title>
    <link>${SITE}${t.blog}</link>
    <description>${esc(t.blogIntro)}</description>
    <language>${lang}</language>
${items}
  </channel>
</rss>
`;
}

function sitemapBlock(posts) {
  if (!posts.length) return "";
  const lists = ["en", "fr"].map((lang) => `  <url>
    <loc>${SITE}${T[lang].blog}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE}/blog/"/>
    <xhtml:link rel="alternate" hreflang="fr" href="${SITE}/fr/blog/"/>
  </url>`);
  const articles = posts.flatMap((p) => ["en", "fr"].map((lang) => `  <url>
    <loc>${postUrl(p, lang)}</loc>
    <lastmod>${(p.updated_at ?? when(p)).slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
    <xhtml:link rel="alternate" hreflang="en" href="${postUrl(p, "en")}"/>
    <xhtml:link rel="alternate" hreflang="fr" href="${postUrl(p, "fr")}"/>
  </url>`));
  const families = Object.keys(FAMILIES)
    .filter((f) => posts.some((p) => familyOf(p) === f))
    .flatMap((f) => ["en", "fr"].map((lang) => `  <url>
    <loc>${familyUrl(f, lang)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
    <xhtml:link rel="alternate" hreflang="en" href="${familyUrl(f, "en")}"/>
    <xhtml:link rel="alternate" hreflang="fr" href="${familyUrl(f, "fr")}"/>
  </url>`));
  return [...lists, ...families, ...articles].join("\n");
}

// The 3 latest articles on a home page (index.html, fr/index.html), in the
// blog's card style. Its styles travel with it, between the markers, so the
// home page's own CSS is left alone.
function latestBlock(posts, lang) {
  if (!posts.length) return "";
  const cards = posts.slice(0, 3).map((p) => `        <a class="fm-latest-card" href="${postUrl(p, lang)}">
          <div class="img">${p.cover_url ? `<img src="${esc(thumb(p.cover_url))}" alt="" width="800" height="500" loading="lazy">` : ""}</div>
          <div class="txt">
            <div><span class="fm-tag fm-tag-${familyOf(p)}">${esc(tagLabel(familyOf(p), lang))}</span></div>
            <h3>${esc(p[`title_${lang}`])}</h3>
            <span class="fm-min">${readLabel(p, lang)}</span>
          </div>
        </a>`).join("\n");
  return `  <style>
    #latest-articles .fm-latest-card{display:flex;flex-direction:column;background:#fff;border-radius:22px;overflow:hidden;color:#08403c;box-shadow:0 1px 0 #E6DED0}
    #latest-articles .fm-latest-card .img{aspect-ratio:16/10;overflow:hidden;background:#d7e7e9}
    #latest-articles .fm-latest-card .img img{width:100%;height:100%;object-fit:cover;display:block;border-radius:0;aspect-ratio:auto}
    #latest-articles .fm-latest-card .txt{padding:18px 22px 24px;display:flex;flex-direction:column;gap:10px}
    #latest-articles .fm-latest-card h3{margin:0;font:400 24px/1.15 'Fjalla One','Fredoka',sans-serif}
    #latest-articles .fm-tag{display:inline-block;border-radius:9px;padding:4px 9px;font:400 12px 'Fjalla One',sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#08403c}
    #latest-articles .fm-tag-spots{background:#d7e7e9}#latest-articles .fm-tag-guides{background:#F6DCCD}#latest-articles .fm-tag-debuter{background:#08403c;color:#fff}
    #latest-articles .fm-min{font:600 14px 'Quicksand',sans-serif;color:#5b7470}
  </style>
  <section id="latest-articles" style="background:#f5f0e8;">
    <div class="fm-latest fm-padx">
      <h2>${esc(T[lang].fromBlog)}</h2>
      <div class="fm-latest-grid">
${cards}
      </div>
    </div>
  </section>
`;
}

// ---- run --------------------------------------------------------------------
async function fetchPosts() {
  if (PREVIEW) {
    // Drafts have no publication date yet: show them as published today.
    const now = new Date().toISOString();
    return JSON.parse(readFileSync(PREVIEW, "utf8")).map((p) => ({
      author: "L'équipe Foamies", ...p, published_at: p.published_at ?? now, updated_at: p.updated_at ?? now,
    }));
  }
  const res = await fetch(
    `${URL_}/rest/v1/blog_posts?select=*&status=eq.published&order=published_at.desc`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  );
  if (!res.ok) {
    console.error(`Supabase answered ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  return res.json();
}

const posts = (await fetchPosts())
  // Belt and braces: Supabase already hides what isn't due; a post missing a
  // language would make a broken page, and the database refuses those anyway.
  .filter((p) => new Date(when(p)) <= new Date())
  .filter((p) => ["fr", "en"].every((l) => p[`title_${l}`] && p[`slug_${l}`] && p[`body_${l}`]))
  .sort((a, b) => new Date(when(b)) - new Date(when(a)));

for (const lang of ["en", "fr"]) {
  const dir = lang === "fr" ? "fr/blog" : "blog";
  rmSync(join(OUT, dir), { recursive: true, force: true });
  write(`${dir}/index.html`, listPage(posts, lang));
  // One page per family, linked from the filters (/fr/blog/spots/…).
  for (const f of Object.keys(FAMILIES)) write(`${dir}/${FAMILIES[f].path[lang]}/index.html`, listPage(posts, lang, f));
  write(`${dir}/rss.xml`, rss(posts, lang));
  for (const p of posts) write(`${dir}/${p[`slug_${lang}`]}/index.html`, articlePage(p, lang, posts));
}

// The latest articles on the home pages, between markers, so the rest is untouched.
const LATEST_START = "  <!-- blog:latest:start -->\n";
const LATEST_END = "  <!-- blog:latest:end -->";
for (const [lang, page] of [["en", "index.html"], ["fr", "fr/index.html"]]) {
  const path = join(OUT, page);
  const html = readFileSync(existsSync(path) ? path : join(ROOT, page), "utf8");
  const from = html.indexOf(LATEST_START);
  const to = html.indexOf(LATEST_END);
  if (from === -1 || to === -1) {
    console.error(`${page}: the blog:latest markers are missing, home page left as it is.`);
    continue;
  }
  write(page, html.slice(0, from + LATEST_START.length) + latestBlock(posts, lang) + html.slice(to));
}

// The blog's part of the sitemap, between markers, so the rest is untouched.
if (PREVIEW) {
  console.log(`blog preview: ${posts.length} article(s) → ${OUT}`);
  process.exit(0);
}
const smPath = join(OUT, "sitemap.xml");
const START = "  <!-- blog:start -->";
const END = "  <!-- blog:end -->";
let sm = readFileSync(existsSync(smPath) ? smPath : join(ROOT, "sitemap.xml"), "utf8");
if (!sm.includes(START)) sm = sm.replace("</urlset>", `${START}\n${END}\n</urlset>`);
const block = sitemapBlock(posts);
sm = sm.replace(new RegExp(`${START}[\\s\\S]*?${END}`), `${START}\n${block}${block ? "\n" : ""}${END}`);
// The home pages change whenever a new article appears on them.
if (posts.length) {
  const newest = when(posts[0]).slice(0, 10);
  for (const home of [`${SITE}/`, `${SITE}/fr/`]) {
    sm = sm.replace(
      new RegExp(`(<loc>${home}</loc>\\s*<lastmod>)([0-9-]+)(</lastmod>)`),
      (all, a, current, b) => (newest > current ? a + newest + b : all),
    );
  }
}
write("sitemap.xml", sm);

console.log(`blog: ${posts.length} article(s) → ${OUT}`);
