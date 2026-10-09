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
    ctaTitle: "Find surf buddies near you",
    ctaText: "Foamies is the free app to meet surfers around you, log your sessions and discover spots.",
    ctaButton: "Get Foamies", terms: "Terms of use", homeLink: "Home", rss: "RSS",
  },
  fr: {
    home: "/fr/", blog: "/fr/blog/", lang: "fr", locale: "fr_FR",
    back: "← Retour sur Foamies", blogTitle: "Le blog Foamies",
    blogIntro: "Spots de surf, conseils pour débuter et histoires de la communauté Foamies.",
    eyebrow: "Blog", read: "Lire", empty: "Les premiers articles arrivent bientôt.",
    by: "Par", other: "Read in English", allPosts: "← Tous les articles",
    ctaTitle: "Trouve des partenaires de surf près de chez toi",
    ctaText: "Foamies est l'appli gratuite pour trouver avec qui surfer, enregistrer ou planifier tes sessions et découvrir des spots.",
    ctaButton: "Télécharger Foamies", terms: "Conditions d'utilisation", homeLink: "Accueil", rss: "RSS",
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

// ---- page shell -----------------------------------------------------------
// Same look as privacy.html / terms.html, with absolute paths so it works at
// any depth (/blog/<slug>/).
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fjalla+One&family=Fredoka:wght@500;600;700&family=Quicksand:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font:500 17px/1.7 'Quicksand',sans-serif;color:#3c5860;background:#fff}
a{color:#E8450A;text-decoration:none}a:hover{text-decoration:underline}
header{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.92);backdrop-filter:blur(10px);border-bottom:1px solid #eef0ee}
.bar{max-width:820px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.bar img{height:28px;width:auto;display:block}
.nav{display:flex;gap:18px;font:600 14px 'Quicksand'}.nav a{color:#0D3D47}
main{max-width:820px;margin:0 auto;padding:56px 24px 80px}
.eyebrow{font:700 13px 'Quicksand';color:#E8450A;letter-spacing:.16em;text-transform:uppercase;margin-bottom:12px}
h1{font:700 40px/1.15 'Fjalla One','Fredoka',sans-serif;color:#0D3D47;margin-bottom:12px}
.meta{font:500 14px 'Quicksand';color:#8a9aa0;margin-bottom:28px}
.lead{font-size:19px;color:#0D3D47;margin-bottom:28px}
.cover{width:100%;aspect-ratio:1200/630;object-fit:cover;border-radius:18px;margin:0 0 32px;display:block}
article h2{font:700 26px/1.25 'Fjalla One','Fredoka',sans-serif;color:#0D3D47;margin:40px 0 12px}
article h3{font:700 19px 'Quicksand';color:#0D3D47;margin:28px 0 8px}
article p{margin:0 0 16px}
article ul,article ol{margin:0 0 16px 24px}article li{margin-bottom:8px}
article img{max-width:100%;border-radius:12px;margin:12px 0}
article blockquote{border-left:4px solid #A8E6F1;padding:4px 0 4px 18px;margin:18px 0;color:#0D3D47;font-style:italic}
article strong{color:#0D3D47}
article table{border-collapse:collapse;width:100%;margin:18px 0;font-size:15px}
article th,article td{text-align:left;padding:10px 12px;border-bottom:1px solid #eef0ee}
.cta{background:#D4F4FB;border-radius:18px;padding:26px 28px;margin:48px 0 20px}
.cta h2{font:700 24px 'Fjalla One','Fredoka',sans-serif;color:#0D3D47;margin:0 0 8px}
.cta p{color:#0D3D47;margin:0 0 16px}
.btn{display:inline-block;background:#E8450A;color:#fff;font:700 16px 'Quicksand';padding:12px 24px;border-radius:999px}
.btn:hover{text-decoration:none;opacity:.9}
.other{font:600 14px 'Quicksand';margin-top:28px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.list{display:grid;gap:22px}
.item{display:grid;grid-template-columns:220px 1fr;gap:20px;align-items:start;color:inherit}
.item:hover{text-decoration:none}.item:hover h2{text-decoration:underline}
.item img,.item .ph{width:220px;aspect-ratio:1200/630;object-fit:cover;border-radius:12px;background:#D4F4FB;display:block}
.item h2{font:700 22px/1.25 'Fjalla One','Fredoka',sans-serif;color:#0D3D47;margin:0 0 6px}
.item p{margin:0;font-size:15px}.item .meta{margin:0 0 6px}
/* Justified, as asked: both edges straight. Hyphenation (the page carries
   its lang) keeps the gaps between words small on a phone. */
.lead,article p,article li,.item p{text-align:justify;hyphens:auto;-webkit-hyphens:auto}
footer{background:#0D3D47;color:#8fb3bb}
.foot{max-width:820px;margin:0 auto;padding:28px 24px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;font:500 13px 'Quicksand'}
footer a{color:#bfe0e6}
@media(max-width:620px){h1{font-size:32px}.item{grid-template-columns:1fr}.item img,.item .ph{width:100%}}
`.trim();

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
  <meta property="og:site_name" content="Foamies">
  <meta property="og:locale" content="${t.locale}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ogImage}">
  <meta name="twitter:card" content="summary_large_image">
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
  <style>${CSS}</style>
</head>
<body>
  <header>
    <div class="bar">
      <a href="${t.home}"><img src="/assets/logo.png" alt="Foamies"></a>
      <nav class="nav"><a href="${t.blog}">Blog</a><a href="${t.home}">${esc(t.back)}</a></nav>
    </div>
  </header>
  <main>
${body}
  </main>
  <footer>
    <div class="foot">
      <span>© ${new Date().getFullYear()} Foamies · foamiesclub.com</span>
      <span><a href="${t.blog}">Blog</a> · <a href="${t.blog}rss.xml">${t.rss}</a> · <a href="${lang === "fr" ? "/fr/terms" : "/terms"}">${esc(t.terms)}</a> · <a href="${t.home}">${esc(t.homeLink)}</a></span>
    </div>
  </footer>
</body>
</html>
`;
}

function cta(lang) {
  const t = T[lang];
  return `<aside class="cta">
      <h2>${esc(t.ctaTitle)}</h2>
      <p>${esc(t.ctaText)}</p>
      <a class="btn" href="/app/">${esc(t.ctaButton)}</a>
    </aside>`;
}

// ---- pages ----------------------------------------------------------------
function articlePage(p, lang) {
  const t = T[lang];
  const other = lang === "fr" ? "en" : "fr";
  const url = postUrl(p, lang);
  const title = p[`title_${lang}`];
  const description = p[`meta_description_${lang}`] || p[`excerpt_${lang}`] || "";
  const image = p.cover_url || `${SITE}/assets/share-${lang}.png`;
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
  const body = `    <article>
      <div class="eyebrow">${t.eyebrow}</div>
      <h1>${esc(title)}</h1>
      <div class="meta">${t.by} ${esc(p.author)} · ${date(when(p), lang)}</div>
      ${p[`excerpt_${lang}`] ? `<p class="lead">${esc(p[`excerpt_${lang}`])}</p>` : ""}
      ${p.cover_url ? `<img class="cover" src="${esc(p.cover_url)}" alt="${esc(title)}">` : ""}
      ${md(p[`body_${lang}`])}
    </article>
    ${cta(lang)}
    <div class="other"><a href="${T[lang].blog}">${esc(t.allPosts)}</a><a href="${postUrl(p, other)}" hreflang="${other}">${esc(t.other)}</a></div>`;
  return page({
    lang, title: `${title} | Foamies`, description, canonical: url,
    alternates: { en: postUrl(p, "en"), fr: postUrl(p, "fr") },
    ogImage: image, ogType: "article", jsonLd, body,
  });
}

function listPage(posts, lang) {
  const t = T[lang];
  const items = posts.map((p) => `      <a class="item" href="${postUrl(p, lang)}">
        ${p.cover_url ? `<img src="${esc(p.cover_url)}" alt="" loading="lazy">` : '<div class="ph"></div>'}
        <div>
          <div class="meta">${date(when(p), lang)}</div>
          <h2>${esc(p[`title_${lang}`])}</h2>
          <p>${esc(p[`excerpt_${lang}`] || p[`meta_description_${lang}`] || "")}</p>
        </div>
      </a>`).join("\n");
  const body = `    <div class="eyebrow">${t.eyebrow}</div>
    <h1>${esc(t.blogTitle)}</h1>
    <p class="lead">${esc(t.blogIntro)}</p>
    ${posts.length ? `<div class="list">\n${items}\n    </div>` : `<p>${esc(t.empty)}</p>`}
    ${cta(lang)}`;
  return page({
    lang, title: `${t.blogTitle} | Foamies`, description: t.blogIntro,
    canonical: `${SITE}${t.blog}`,
    alternates: { en: `${SITE}/blog/`, fr: `${SITE}/fr/blog/` },
    ogImage: `${SITE}/assets/share-${lang}.png`, ogType: "website",
    jsonLd: { "@context": "https://schema.org", "@type": "Blog", name: t.blogTitle, url: `${SITE}${t.blog}`, inLanguage: lang },
    body,
    // An empty blog is not worth indexing yet.
    noindex: posts.length === 0,
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
  return [...lists, ...articles].join("\n");
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
  write(`${dir}/rss.xml`, rss(posts, lang));
  for (const p of posts) write(`${dir}/${p[`slug_${lang}`]}/index.html`, articlePage(p, lang));
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
write("sitemap.xml", sm);

console.log(`blog: ${posts.length} article(s) → ${OUT}`);
