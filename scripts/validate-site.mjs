import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requiredFiles = [
  'index.html',
  'privacy/index.html',
  'terms/index.html',
  'support/index.html',
  'privacy-choices/index.html',
  'delete-account/index.html',
  '404.html',
  'robots.txt',
  'sitemap.xml',
  '.nojekyll',
  'assets/styles.css',
  'assets/favicon.svg',
  'public-legal-config.json',
];
const placeholderPattern = /(?:\bREPLACE_(?:WITH_)?[A-Z0-9_]+\b|\bTODO(?:\b|:)|\bTBD\b|\bEXAMPLE_[A-Z0-9_]+\b|\bINSERT HERE\b|\bCOMING SOON\b|\bDRAFT COPY\b)/i;
const failures = [];
const fail = (message) => failures.push(message);

for (const file of requiredFiles) if (!existsSync(join(root, file))) fail(`Missing required file: ${file}`);

const config = JSON.parse(readFileSync(join(root, 'public-legal-config.json'), 'utf8'));
for (const field of ['appName', 'tagline', 'legalOperatorName', 'publicSupportEmail', 'governingJurisdiction', 'effectiveDate', 'websiteOrigin', 'siteBasePath']) {
  const value = config[field];
  if (typeof value !== 'string' || !value.trim() || placeholderPattern.test(value)) fail(`Invalid legal configuration field: ${field}`);
}
if (!Number.isInteger(config.minimumAge) || config.minimumAge < 13) fail('minimumAge must be an explicit integer of at least 13.');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.publicSupportEmail ?? '')) fail('Public support email is invalid.');
if (!/^https:\/\//.test(config.websiteOrigin ?? '')) fail('Production website origin must use HTTPS.');
if (!/^\/[A-Za-z0-9/_-]*\/$/.test(config.siteBasePath ?? '')) fail('siteBasePath must start and end with a slash.');

function collectFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? collectFiles(path) : [path];
  });
}

const htmlFiles = collectFiles(root).filter((path) => path.endsWith('.html'));
const productionBase = `${config.websiteOrigin.replace(/\/$/, '')}${config.siteBasePath}`;
const canonicalByFile = new Map([
  ['index.html', productionBase],
  ['privacy/index.html', `${productionBase}privacy/`],
  ['terms/index.html', `${productionBase}terms/`],
  ['support/index.html', `${productionBase}support/`],
  ['privacy-choices/index.html', `${productionBase}privacy-choices/`],
  ['delete-account/index.html', `${productionBase}delete-account/`],
]);

for (const filePath of htmlFiles) {
  const file = relative(root, filePath).replaceAll('\\', '/');
  const source = readFileSync(filePath, 'utf8');
  if (placeholderPattern.test(source)) fail(`${file} contains placeholder text.`);
  if (/\b(?:unlimited|unrestricted)\s+AI\b/i.test(source)) fail(`${file} claims unlimited AI.`);
  if (/\bcomplimentary (?:AI )?(?:use|uses|analysis|analyses)\b[^.!?]{0,60}\b(?:is|are|constitutes?|counts? as)(?!\s+not\b)[^.!?]{0,40}\b(?:Apple|App Store|subscription|RevenueCat)?\s*(?:free )?trial\b/i.test(source)) {
    fail(`${file} describes complimentary use as a store trial.`);
  }
  if (/href=["']http:\/\//i.test(source) || /src=["']http:\/\//i.test(source)) fail(`${file} contains an insecure production URL.`);
  if (/apps\.apple\.com\/(?:app|us\/app)\/[^"']*(?:id0|placeholder|example)/i.test(source)) fail(`${file} contains a fake App Store URL.`);
  if (/<script\b/i.test(source) || /google-analytics|googletagmanager|facebook\.net|connect\.facebook|segment|mixpanel|amplitude|fullstory|hotjar/i.test(source)) fail(`${file} contains JavaScript or tracking code.`);
  if (/<form\b/i.test(source) || /document\.cookie|set-cookie/i.test(source)) fail(`${file} contains a form or cookie behavior.`);
  if (/\b\d{1,6}\s+[A-Za-z0-9.' -]+\s+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Court|Ct\.?)\b/i.test(source)) fail(`${file} may contain an unapproved street address.`);
  if (!/<html\s+lang=["']en["']/i.test(source)) fail(`${file} must declare English document language.`);
  if (!/<meta\s+name=["']viewport["']/i.test(source)) fail(`${file} is missing responsive viewport metadata.`);
  if (!/href=["']#main-content["'][^>]*>\s*Skip to content\s*</i.test(source)) fail(`${file} is missing a keyboard skip link.`);
  if (!/<main\b[^>]*id=["']main-content["']/i.test(source)) fail(`${file} is missing the main content landmark.`);
  if (!/<nav\b/i.test(source) || !/<footer\b/i.test(source)) fail(`${file} is missing navigation or footer landmarks.`);
  if ((source.match(/<h1\b/gi) ?? []).length !== 1) fail(`${file} must contain exactly one h1.`);
  for (const image of source.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt=["'][^"']*["']/i.test(image[0])) fail(`${file} contains an image without an alt attribute.`);
  }

  const expectedCanonical = canonicalByFile.get(file);
  if (expectedCanonical) {
    if (!source.includes(`<link rel="canonical" href="${expectedCanonical}">`)) fail(`${file} has a missing or incorrect canonical URL.`);
    if (!source.includes(`<meta property="og:url" content="${expectedCanonical}">`)) fail(`${file} has a missing or incorrect Open Graph URL.`);
  }

  const attributes = [...source.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const target of attributes) {
    if (/^(?:https:|mailto:|#|data:)/i.test(target)) continue;
    if (target.startsWith('/')) {
      fail(`${file} uses root-relative internal path ${target}; GitHub project links must be relative.`);
      continue;
    }
    const pathPart = target.split(/[?#]/)[0];
    if (!pathPart) continue;
    let resolved = normalize(join(dirname(filePath), pathPart));
    if (pathPart.endsWith('/')) resolved = join(resolved, 'index.html');
    if (existsSync(resolved) && statSync(resolved).isDirectory()) resolved = join(resolved, 'index.html');
    if ((!resolved.startsWith(`${root}${sep}`) && resolved !== root) || !existsSync(resolved)) fail(`${file} has broken internal link: ${target}`);
  }
}

const privacy = readFileSync(join(root, 'privacy/index.html'), 'utf8');
for (const required of ['OpenAI', 'Supabase', 'RevenueCat', 'AI data sharing', 'account deletion', 'cross-app tracking']) {
  if (!privacy.includes(required)) fail(`Privacy Policy omits required topic: ${required}`);
}
const terms = readFileSync(join(root, 'terms/index.html'), 'utf8');
for (const required of ['auto-renewing', 'Restore Purchases', 'two complimentary AI analyses', 'Standard EULA', 'no cash value']) {
  if (!terms.includes(required)) fail(`Terms omit required topic: ${required}`);
}
for (const page of ['index.html', 'privacy/index.html', 'terms/index.html', 'support/index.html', 'privacy-choices/index.html', 'delete-account/index.html']) {
  const source = readFileSync(join(root, page), 'utf8');
  if (!source.includes(config.publicSupportEmail)) fail(`${page} omits the public support email.`);
}

const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
for (const url of canonicalByFile.values()) if (!sitemap.includes(`<loc>${url}</loc>`)) fail(`Sitemap omits ${url}`);
if (placeholderPattern.test(sitemap) || /<loc>http:\/\//i.test(sitemap)) fail('Sitemap contains a placeholder or insecure URL.');

if (failures.length) {
  console.error(`FinDex site validation failed with ${failures.length} finding(s):`);
  for (const finding of failures) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`FinDex site validation passed: ${htmlFiles.length} HTML files and all public routes checked.`);
}
