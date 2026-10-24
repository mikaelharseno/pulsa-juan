#!/usr/bin/env node
// Android release: EAS build (profile release-apk) → R2 upload → releases.json → git tag → landing deploy.
//
//   npm run release:android                       # build a new release from the committed tree
//   npm run release:android -- --build-id <id>    # publish an already-finished EAS build instead
//   npm run release:android -- --no-deploy        # skip `wrangler deploy` of the landing page
//
// Version comes from app.json (expo.version + expo.android.versionCode); release notes from the
// matching `## <version>` section of CHANGELOG.md. Each release is stored twice in R2 bucket
// pulsa-juan-downloads: pulsa-juan-<version>.apk (kept forever) and pulsa-juan.apk (latest).
// Needs Node >= 22 for wrangler, plus `eas login` and `wrangler login`.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_DIR = join(APP_DIR, '..');
const LANDING_DIR = join(REPO_DIR, 'pulsa-juan-landing');
const RELEASES_JSON = join(LANDING_DIR, 'public', 'releases.json');
const BUCKET = 'pulsa-juan-downloads';
const PROFILE = 'release-apk';

const args = process.argv.slice(2);
const buildIdArg = args.includes('--build-id') ? args[args.indexOf('--build-id') + 1] : null;
const deploy = !args.includes('--no-deploy');

const run = (cmd, cmdArgs, cwd, opts = {}) =>
  execFileSync(cmd, cmdArgs, { cwd, encoding: 'utf8', stdio: opts.inherit ? 'inherit' : ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 });
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

// ---- version + notes ----
const app = JSON.parse(readFileSync(join(APP_DIR, 'app.json'), 'utf8')).expo;
const version = app.version;
const versionCode = app.android?.versionCode;
if (!version || !Number.isInteger(versionCode)) fail('app.json needs expo.version and an integer expo.android.versionCode');

const changelog = readFileSync(join(APP_DIR, 'CHANGELOG.md'), 'utf8');
const section = changelog.split(/^## /m).find((s) => s.startsWith(`${version} `));
if (!section) fail(`CHANGELOG.md has no "## ${version} …" section — add the release notes first`);
const notes = section.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim());
if (notes.length === 0) fail(`CHANGELOG.md section ${version} has no "- " bullet points`);

const releases = JSON.parse(readFileSync(RELEASES_JSON, 'utf8'));
if (releases.releases.some((r) => r.version === version)) fail(`releases.json already has ${version} — bump expo.version in app.json`);
const prev = releases.releases[0];
if (prev && versionCode <= prev.versionCode) fail(`versionCode ${versionCode} must be greater than the last release's (${prev.versionCode})`);

console.log(`Releasing Pulsa Juan ${version} (versionCode ${versionCode})`);

// ---- build ----
let build;
if (buildIdArg) {
  build = JSON.parse(run('npx', ['-y', 'eas-cli@latest', 'build:view', buildIdArg, '--json'], APP_DIR));
} else {
  if (run('git', ['status', '--porcelain', '--untracked-files=no'], REPO_DIR).trim()) {
    fail('commit your changes first — the release is tagged with the commit EAS builds');
  }
  console.log('Building on EAS (10–20 min)…');
  const out = JSON.parse(run('npx', ['-y', 'eas-cli@latest', 'build', '-p', 'android', '--profile', PROFILE, '--non-interactive', '--wait', '--json'], APP_DIR));
  build = Array.isArray(out) ? out[0] : out;
}
if (build.status !== 'FINISHED') fail(`EAS build ${build.id} is ${build.status}`);
if (build.buildProfile !== PROFILE) fail(`EAS build ${build.id} used profile ${build.buildProfile}, expected ${PROFILE}`);
if (build.appVersion !== version || String(build.appBuildVersion) !== String(versionCode)) {
  fail(`EAS build is ${build.appVersion} (${build.appBuildVersion}) but app.json says ${version} (${versionCode})`);
}
const artifactUrl = build.artifacts?.buildUrl ?? build.artifacts?.applicationArchiveUrl;
if (!artifactUrl) fail(`EAS build ${build.id} has no artifact URL`);

// ---- download + checksum ----
const dir = mkdtempSync(join(tmpdir(), 'pulsa-juan-release-'));
const apk = join(dir, `pulsa-juan-${version}.apk`);
console.log('Downloading the build…');
run('curl', ['-fsSL', '-o', apk, artifactUrl], dir);
const sizeBytes = statSync(apk).size;
const sha256 = createHash('sha256').update(readFileSync(apk)).digest('hex');

// ---- upload: versioned + latest ----
for (const key of [`pulsa-juan-${version}.apk`, 'pulsa-juan.apk']) {
  console.log(`Uploading ${key}…`);
  run('npx', ['-y', 'wrangler@4', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', apk, '--content-type', 'application/vnd.android.package-archive', '--remote'], LANDING_DIR);
}

// ---- record ----
const release = {
  version,
  versionCode,
  date: (build.completedAt ?? new Date().toISOString()).slice(0, 10),
  file: `/download/pulsa-juan-${version}.apk`,
  sizeBytes,
  sha256,
  gitCommit: build.gitCommitHash ?? null,
  easBuildId: build.id,
  notes,
};
releases.latest = version;
releases.releases.unshift(release);
writeFileSync(RELEASES_JSON, JSON.stringify(releases, null, 2) + '\n');
console.log(`Recorded in ${RELEASES_JSON}`);

const tag = `android-v${version}`;
if (release.gitCommit) {
  try {
    run('git', ['tag', '-a', tag, release.gitCommit, '-m', `Pulsa Juan Android ${version} (versionCode ${versionCode})\n\n${notes.map((n) => `- ${n}`).join('\n')}`], REPO_DIR);
    console.log(`Tagged ${tag} → ${release.gitCommit.slice(0, 7)}`);
  } catch {
    console.warn(`! could not create tag ${tag} (already exists?)`);
  }
}

if (deploy) {
  console.log('Deploying the landing page…');
  run('npx', ['-y', 'wrangler@4', 'deploy'], LANDING_DIR, { inherit: true });
}

console.log(`\n✔ Pulsa Juan ${version} released (${(sizeBytes / 1024 / 1024).toFixed(1)} MB, sha256 ${sha256.slice(0, 12)}…)`);
console.log('Next: commit pulsa-juan-landing/public/releases.json, then `git push origin main --follow-tags`.');
