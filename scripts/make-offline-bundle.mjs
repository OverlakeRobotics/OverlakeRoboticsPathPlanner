import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join, normalize} from "node:path";
import {fileURLToPath} from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");
const htmlPath = join(distDir, "index.html");

let html;
try {
    html = readFileSync(htmlPath, "utf8");
} catch (err) {
    console.error(`Unable to read ${htmlPath}. Did you run "vite build" first?`);
    process.exit(1);
}

const scriptTagMatcher = /<script\s+type="module"[^>]*src="(?<src>[^"]+)"[^>]*>\s*<\/script>/i;
const cssTagMatcher = /<link\s+rel="stylesheet"[^>]*href="(?<href>[^"]+)"[^>]*>/i;

const IMAGE_MIME = new Map([
    ["png", "image/png"],
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["gif", "image/gif"],
    ["svg", "image/svg+xml"],
    ["webp", "image/webp"],
]);

const stripQuery = (value) => value.replace(/[?#].*$/, "");

const candidatePaths = (assetPath) => {
    const cleaned = stripQuery(assetPath.trim()).replace(/^\.\//, "");
    const attempts = new Set();

    attempts.add(join(distDir, cleaned));
    attempts.add(join(distDir, "assets", cleaned));

    const parts = cleaned.split("/");
    const filename = parts[parts.length - 1];
    attempts.add(join(distDir, filename));
    attempts.add(join(distDir, "assets", filename));

    return Array.from(attempts);
};

const toDataUri = (assetPath) => {
    if (!assetPath || assetPath.startsWith("data:") || assetPath.startsWith("http://") || assetPath.startsWith("https://")) {
        return assetPath;
    }

    const extMatch = stripQuery(assetPath).match(/\.([a-z0-9]+)$/i);
    if (!extMatch) return assetPath;

    const ext = extMatch[1].toLowerCase();
    const mime = IMAGE_MIME.get(ext);
    if (!mime) return assetPath;

    for (const attempt of candidatePaths(assetPath)) {
        if (existsSync(attempt)) {
            const fileContent = readFileSync(attempt);
            const encoded = fileContent.toString("base64");
            return `data:${mime};base64,${encoded}`;
        }
    }

    return assetPath;
};

const inlineImageLiterals = (content) =>
    content.replace(/(["'`])(?<path>(?:\.{0,2}\/)?(?:assets\/)?[^"'`]+?\.(?:png|jpe?g|gif|svg|webp))\1/g, (match, quote, path) => {
        const inlined = toDataUri(path);
        return `${quote}${inlined}${quote}`;
    });

const inlineCssUrls = (content) =>
    content.replace(/url\((['"]?)(?<path>(?:\.{0,2}\/)?(?:assets\/)?[^)'"]+?\.(?:png|jpe?g|gif|svg|webp))\1\)/g, (match, quote, path) => {
        const inlined = toDataUri(path);
        return `url(${quote}${inlined}${quote})`;
    });

const scriptMatch = html.match(scriptTagMatcher);
if (!scriptMatch?.groups?.src) {
    console.error("Unable to locate the bundled script tag in dist/index.html.");
    process.exit(1);
}

const cssMatch = html.match(cssTagMatcher);

const resolveAssetPath = (assetPath) => {
    const cleaned = assetPath.replace(/^\.\//, "");
    return join(distDir, normalize(cleaned));
};

const scriptPath = resolveAssetPath(scriptMatch.groups.src);
const scriptContent = inlineImageLiterals(readFileSync(scriptPath, "utf8"));

const inlineScriptTag = `<script type="module">
${scriptContent}
</script>`;

html = html.replace(scriptTagMatcher, () => inlineScriptTag);

if (cssMatch?.groups?.href) {
    const cssPath = resolveAssetPath(cssMatch.groups.href);
    const cssContent = inlineCssUrls(inlineImageLiterals(readFileSync(cssPath, "utf8")));
    const inlineStyleTag = `<style>
${cssContent}
</style>`;
    html = html.replace(cssTagMatcher, () => inlineStyleTag);
}

writeFileSync(htmlPath, html, "utf8");
