import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const repositoryRoot = resolve('.');
const metadataPath = join(repositoryRoot, 'src', 'marketing', 'seo', 'routeMetadata.json');
const publicDirectory = join(repositoryRoot, 'public');
const distDirectory = join(repositoryRoot, 'dist');
const siteOrigin = (process.env.VITE_PUBLIC_SITE_URL || 'https://my-desck-pro.vercel.app').replace(/\/$/, '');
const locales = ['en', 'ar', 'he'];
const localePrefix = { en: '', ar: '/ar', he: '/he' };
const directions = { en: 'ltr', ar: 'rtl', he: 'rtl' };

const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
const indexableRoutes = metadata.filter((route) => route.indexable);

function localizedPath(path, locale) {
  const prefix = localePrefix[locale];
  if (!prefix) return path;
  return path === '/' ? prefix : `${prefix}${path}`;
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function buildSitemap() {
  const entries = [];
  for (const route of indexableRoutes) {
    for (const locale of locales) {
      const path = localizedPath(route.path, locale);
      const alternates = locales.map((alternateLocale) => {
        const href = `${siteOrigin}${localizedPath(route.path, alternateLocale)}`;
        return `    <xhtml:link rel="alternate" hreflang="${alternateLocale}" href="${escapeXml(href)}" />`;
      });
      alternates.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(`${siteOrigin}${route.path}`)}" />`);
      entries.push([
        '  <url>',
        `    <loc>${escapeXml(`${siteOrigin}${path}`)}</loc>`,
        ...alternates,
        '    <changefreq>weekly</changefreq>',
        `    <priority>${route.path === '/' ? '1.0' : '0.8'}</priority>`,
        '  </url>',
      ].join('\n'));
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
}

function replaceMeta(html, route, locale, path) {
  const title = `${route.title[locale]} | MyDesck PRO`;
  const description = route.description[locale];
  const canonical = `${siteOrigin}${path}`;
  const alternates = locales.map((alternateLocale) => `<link rel="alternate" hreflang="${alternateLocale}" href="${siteOrigin}${localizedPath(route.path, alternateLocale)}" />`).join('\n    ');
  const xDefault = `<link rel="alternate" hreflang="x-default" href="${siteOrigin}${route.path}" />`;
  const staticContent = `<main id="main-content" data-prerendered="true" style="min-height:70vh;padding:5rem max(1.25rem,calc((100vw - 76rem)/2));font-family:Inter,Arial,sans-serif;background:#f8fafc;color:#0f172a"><p style="font-size:.875rem;font-weight:700;color:#075985">MyDesck PRO</p><h1 style="max-width:900px;font-size:clamp(2.5rem,6vw,4.5rem);line-height:1.08;margin:1rem 0">${escapeXml(route.title[locale])}</h1><p style="max-width:760px;font-size:1.125rem;line-height:1.75;color:#475569">${escapeXml(description)}</p><p style="margin-top:2rem"><a href="${localizedPath('/contact', locale)}" style="display:inline-block;padding:.9rem 1.2rem;border-radius:.7rem;background:#075985;color:white;text-decoration:none;font-weight:700">MyDesck PRO</a></p></main>`;

  let result = html
    .replace(/<html[^>]*>/i, `<html lang="${locale}" dir="${directions[locale]}">`)
    .replace(/<title>.*?<\/title>/is, `<title>${escapeXml(title)}</title>`)
    .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?\s*>/i, `<meta name="description" content="${escapeXml(description)}" />`)
    .replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?\s*>/i, `<meta property="og:title" content="${escapeXml(title)}" />`)
    .replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?\s*>/i, `<meta property="og:description" content="${escapeXml(description)}" />`)
    .replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?\s*>/i, `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?\s*>/i, `<meta name="twitter:title" content="${escapeXml(title)}" />`)
    .replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?\s*>/i, `<meta name="twitter:description" content="${escapeXml(description)}" />`)
    .replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?\s*>/i, `<link rel="canonical" href="${canonical}" />`)
    .replace(/\s*<link\s+rel="alternate"\s+hrefLang?="[^"]*"\s+href="[^"]*"\s*\/?\s*>/gi, '')
    .replace('</head>', `    ${alternates}\n    ${xDefault}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${staticContent}</div>`);

  // Clean URLs may be served with or without a trailing slash. Root-relative
  // build assets hydrate correctly in both cases and at every locale depth.
  result = result.replace(/(["'])\.\/(assets\/|manifest\.webmanifest|registerSW\.js|sw\.js|favicon\.ico)/g, '$1/$2');
  return result;
}

function validatePrerenderedHtml(html, path) {
  const required = [
    ['title', /<title>[^<]+<\/title>/i],
    ['description', /<meta\s+name="description"\s+content="[^"]+"/i],
    ['canonical', /<link\s+rel="canonical"\s+href="[^"]+"/i],
    ['H1', /<h1[\s>]/i],
    ['main content', /<main[\s>]/i],
    ['root-relative application asset', /<script[^>]+src="\/assets\//i],
  ];
  for (const [label, pattern] of required) {
    if (!pattern.test(html)) throw new Error(`Prerender validation failed for ${path}: missing ${label}`);
  }
}

async function writeSitemap(targetDirectory) {
  await mkdir(targetDirectory, { recursive: true });
  await writeFile(join(targetDirectory, 'sitemap.xml'), buildSitemap(), 'utf8');
}

async function prerender() {
  const shell = await readFile(join(distDirectory, 'index.html'), 'utf8');
  for (const route of indexableRoutes) {
    for (const locale of locales) {
      const path = localizedPath(route.path, locale);
      const outputPath = path === '/'
        ? join(distDirectory, 'index.html')
        : join(distDirectory, ...path.split('/').filter(Boolean), 'index.html');
      await mkdir(dirname(outputPath), { recursive: true });
      const rendered = replaceMeta(shell, route, locale, path);
      validatePrerenderedHtml(rendered, path);
      await writeFile(outputPath, rendered, 'utf8');
    }
  }
  await writeSitemap(distDirectory);
}

if (process.argv.includes('--generate')) await writeSitemap(publicDirectory);
if (process.argv.includes('--prerender')) await prerender();
