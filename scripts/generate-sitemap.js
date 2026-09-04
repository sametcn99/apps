const appsJsonUrl = new URL("../apps.json", import.meta.url);
const sitemapUrl = new URL("../sitemap.xml", import.meta.url);

function normalizeBaseUrl(url) {
    return String(url || "https://apps.sametcc.me").replace(/\/+$/, "");
}

function escapeXml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function readPreviousLastmods(sitemap) {
    const lastmods = new Map();
    const urlBlocks = sitemap.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/g);

    for (const [, block] of urlBlocks) {
        const loc = block.match(/<loc>([\s\S]*?)<\/loc>/)?.[1];
        const lastmod = block.match(/<lastmod>([\s\S]*?)<\/lastmod>/)?.[1];
        if (loc && lastmod) lastmods.set(loc.trim(), lastmod.trim());
    }

    return lastmods;
}

function toIsoDate(value = new Date()) {
    return value.toISOString().slice(0, 10);
}

function buildUrlSet(data, previousLastmods, updateAllLastmods) {
    const baseUrl = normalizeBaseUrl(data.store?.url);
    const today = toIsoDate();
    const urls = [];
    const seen = new Set();

    function addUrl(loc, changefreq, priority) {
        if (!loc || seen.has(loc)) return;
        seen.add(loc);
        urls.push({
            loc,
            lastmod: updateAllLastmods ? today : previousLastmods.get(loc) || today,
            changefreq,
            priority,
        });
    }

    addUrl(`${baseUrl}/`, "daily", "1.0");
    addUrl(`${baseUrl}/#/discover`, "weekly", "0.9");

    for (const category of data.categories || []) {
        if (!category?.id) continue;
        addUrl(`${baseUrl}/#/${category.id}`, "weekly", "0.7");
    }

    for (const app of data.apps || []) {
        if (!app?.id) continue;
        const firstCategory = Array.isArray(app.category) ? app.category.find(Boolean) : undefined;
        const view = firstCategory || "discover";
        addUrl(`${baseUrl}/#/${view}/${app.id}`, "monthly", "0.6");
    }

    return urls;
}

function buildSitemapXml(entries) {
    const body = entries
        .map(
            (entry) => `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`
        )
        .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

async function main() {
    const raw = await Bun.file(appsJsonUrl).text();
    const data = JSON.parse(raw);
    const previousSitemap = await Bun.file(sitemapUrl).text().catch(() => "");
    const updateAllLastmods = Bun.env.SITEMAP_UPDATE_LASTMOD === "true";
    const entries = buildUrlSet(data, readPreviousLastmods(previousSitemap), updateAllLastmods);
    const xml = buildSitemapXml(entries);
    if (xml !== previousSitemap) await Bun.write(sitemapUrl, xml);
    console.log(`Wrote ${entries.length} sitemap entries to ${sitemapUrl.pathname}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
