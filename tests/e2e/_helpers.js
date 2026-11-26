'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const { execFileSync, execFile, spawn } = require('child_process');
const { promisify } = require('util');
const { chromium } = require('playwright');

const execFileAsync = promisify(execFile);

const WORKSPACE_ROOT = path.resolve(__dirname, '../..');
const PROD_DATA_DIR = path.join(WORKSPACE_ROOT, 'data');
const PROD_OUTPUTS_DIR = path.join(PROD_DATA_DIR, 'outputs');
const PROD_HISTORY_FILE = path.join(PROD_DATA_DIR, 'publish_history.json');
const PROD_CALENDAR_FILE = path.join(PROD_DATA_DIR, 'scheduled_calendar.json');
const PROD_IMAGES_DIR = path.join(PROD_DATA_DIR, 'images');
const PROD_VIDEOS_DIR = path.join(PROD_DATA_DIR, 'videos');
const PROD_KNOWLEDGE_DIR = path.join(PROD_DATA_DIR, 'knowledge');
const PROD_MEETINGS_DIR = path.join(PROD_DATA_DIR, 'meetings');
const PROD_SCREENSHOTS_DIR = path.join(PROD_DATA_DIR, 'screenshots');
const PROD_BROWSER_PROFILE_DIR = path.join(PROD_DATA_DIR, 'browser_profile');
const PROD_DAILY_LOG_FILE = path.join(PROD_DATA_DIR, 'daily_run.log');
const PROD_LOCK_FILE = path.join(PROD_DATA_DIR, 'orchestrator.lock');

// Isolated temp workspace root inside D:\Facebook (strictly outside D:\Facebook\data\)
const E2E_TMP_ROOT = path.join(WORKSPACE_ROOT, 'tests', '.e2e_tmp');

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  return {
    hash: crypto.createHash('sha256').update(buf).digest('hex'),
    size: buf.length
  };
}

function safeStatOrHash(filePath) {
  let exists = false;
  try {
    fs.lstatSync(filePath);
    exists = true;
  } catch {
    return { exists: false };
  }
  if (!exists) return { exists: false };
  try {
    const hashed = sha256File(filePath);
    if (hashed) return { exists: true, ...hashed };
  } catch (err) {
    if (!err || (err.code !== 'EBUSY' && err.code !== 'EPERM' && err.code !== 'EACCES' && err.code !== 'ENOENT')) {
      throw err;
    }
  }
  try {
    const st = fs.lstatSync(filePath);
    return { exists: true, size: st.size, mtimeMs: st.mtimeMs, lockedFallback: true };
  } catch {
    return { exists: false };
  }
}

function snapshotDirEntries(dirPath, { recursive = true } = {}) {
  if (!fs.existsSync(dirPath)) return null;
  const results = [];
  const walk = (currentDir, prefix) => {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relName = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(currentDir, entry.name);
      const type = entry.isDirectory() ? 'dir' : (entry.isFile() ? 'file' : 'other');
      let size = 0;
      if (type === 'file') {
        try {
          size = fs.statSync(full).size;
        } catch {
          size = -1;
        }
      }
      results.push({ name: relName, type, size });
      if (recursive && type === 'dir') {
        walk(full, relName);
      }
    }
  };
  walk(dirPath, '');
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

function snapshotBrowserProfileAnchors() {
  if (!fs.existsSync(PROD_BROWSER_PROFILE_DIR)) return null;
  const anchorNames = [
    'Local State',
    'Last Version',
    'Last Browser',
    'SingletonLock',
    'lockfile',
    'Profile 38/Preferences',
    'Profile 38/History'
  ];
  const anchors = {};
  for (const rel of anchorNames) {
    anchors[rel] = safeStatOrHash(path.join(PROD_BROWSER_PROFILE_DIR, ...rel.split('/')));
  }
  return {
    topLevel: snapshotDirEntries(PROD_BROWSER_PROFILE_DIR, { recursive: false }),
    profile38TopLevel: snapshotDirEntries(path.join(PROD_BROWSER_PROFILE_DIR, 'Profile 38'), { recursive: false }),
    anchors
  };
}

function getIctDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function snapshotProductionData() {
  return {
    publishHistory: sha256File(PROD_HISTORY_FILE),
    scheduledCalendar: sha256File(PROD_CALENDAR_FILE),
    dailyRunLog: sha256File(PROD_DAILY_LOG_FILE),
    orchestratorLock: sha256File(PROD_LOCK_FILE),
    orchestratorLockExists: fs.existsSync(PROD_LOCK_FILE),
    imagesEntries: snapshotDirEntries(PROD_IMAGES_DIR, { recursive: true }),
    videosEntries: snapshotDirEntries(PROD_VIDEOS_DIR, { recursive: true }),
    knowledgeEntries: snapshotDirEntries(PROD_KNOWLEDGE_DIR, { recursive: true }),
    meetingsEntries: snapshotDirEntries(PROD_MEETINGS_DIR, { recursive: true }),
    screenshotsEntries: snapshotDirEntries(PROD_SCREENSHOTS_DIR, { recursive: true }),
    outputsEntries: snapshotDirEntries(PROD_OUTPUTS_DIR, { recursive: true }),
    browserProfileAnchors: snapshotBrowserProfileAnchors()
  };
}

function assertProductionDataUnchanged(snap, contextLabel = 'test') {
  assert.ok(snap, `[${contextLabel}] Production snapshot is required`);

  assert.deepEqual(
    sha256File(PROD_HISTORY_FILE),
    snap.publishHistory,
    `[${contextLabel}] Production D:\\Facebook\\data\\publish_history.json was mutated!`
  );
  assert.deepEqual(
    sha256File(PROD_CALENDAR_FILE),
    snap.scheduledCalendar,
    `[${contextLabel}] Production D:\\Facebook\\data\\scheduled_calendar.json was mutated!`
  );
  assert.deepEqual(
    sha256File(PROD_DAILY_LOG_FILE),
    snap.dailyRunLog,
    `[${contextLabel}] Production D:\\Facebook\\data\\daily_run.log was mutated!`
  );
  assert.equal(
    fs.existsSync(PROD_LOCK_FILE),
    snap.orchestratorLockExists,
    `[${contextLabel}] Production D:\\Facebook\\data\\orchestrator.lock existence changed!`
  );
  assert.deepEqual(
    sha256File(PROD_LOCK_FILE),
    snap.orchestratorLock,
    `[${contextLabel}] Production D:\\Facebook\\data\\orchestrator.lock was mutated!`
  );
  assert.deepEqual(
    snapshotDirEntries(PROD_IMAGES_DIR, { recursive: true }),
    snap.imagesEntries,
    `[${contextLabel}] Production D:\\Facebook\\data\\images/ entries changed!`
  );
  assert.deepEqual(
    snapshotDirEntries(PROD_VIDEOS_DIR, { recursive: true }),
    snap.videosEntries,
    `[${contextLabel}] Production D:\\Facebook\\data\\videos/ entries changed!`
  );
  assert.deepEqual(
    snapshotDirEntries(PROD_KNOWLEDGE_DIR, { recursive: true }),
    snap.knowledgeEntries,
    `[${contextLabel}] Production D:\\Facebook\\data\\knowledge/ entries changed!`
  );
  assert.deepEqual(
    snapshotDirEntries(PROD_MEETINGS_DIR, { recursive: true }),
    snap.meetingsEntries,
    `[${contextLabel}] Production D:\\Facebook\\data\\meetings/ entries changed!`
  );
  assert.deepEqual(
    snapshotDirEntries(PROD_SCREENSHOTS_DIR, { recursive: true }),
    snap.screenshotsEntries,
    `[${contextLabel}] Production D:\\Facebook\\data\\screenshots/ entries changed!`
  );
  assert.deepEqual(
    snapshotDirEntries(PROD_OUTPUTS_DIR, { recursive: true }),
    snap.outputsEntries,
    `[${contextLabel}] Production D:\\Facebook\\data\\outputs/ entries changed!`
  );
  assert.deepEqual(
    snapshotBrowserProfileAnchors(),
    snap.browserProfileAnchors,
    `[${contextLabel}] Production D:\\Facebook\\data\\browser_profile/ anchors changed!`
  );
}

/**
 * CRITICAL R4 SAFETY PRE-FLIGHT GUARD:
 * Verifies lib/env-loader.js does NOT clobber caller-provided DRY_RUN=true / AUTO_PUBLISH=false /
 * GOOGLE_FLOW_ENABLED=false / GOOGLE_VEO_ENABLED=false / GOOGLE_IMAGE_ENABLED=false /
 * GEMINI_API_KEY='' / DATA_DIR overrides. Fails immediately BEFORE any live-capable CLI
 * (company_orchestrator.js, publish_now.js) or media/AI singleton is spawned.
 */
function assertEnvLoaderSafeForDryRun() {
  const probeDataDir = path.join(E2E_TMP_ROOT, '_env_probe');
  const probeScript = [
    "process.env.DRY_RUN = 'true';",
    "process.env.AUTO_PUBLISH = 'false';",
    "process.env.GOOGLE_FLOW_ENABLED = 'false';",
    "process.env.GOOGLE_VEO_ENABLED = 'false';",
    "process.env.GOOGLE_IMAGE_ENABLED = 'false';",
    "process.env.GEMINI_API_KEY = '';",
    "process.env.GOOGLE_FLOW_URL = 'http://127.0.0.1:9/';",
    "process.env.BRAND_WEBSITE = 'http://127.0.0.1:9/';",
    "process.env.NHACUALAND_URL = 'http://127.0.0.1:9/';",
    `process.env.DATA_DIR = ${JSON.stringify(probeDataDir)};`,
    "require('./lib/env-loader');",
    "console.log(JSON.stringify({",
    "  DRY_RUN: process.env.DRY_RUN,",
    "  AUTO_PUBLISH: process.env.AUTO_PUBLISH,",
    "  GOOGLE_FLOW_ENABLED: process.env.GOOGLE_FLOW_ENABLED,",
    "  GOOGLE_VEO_ENABLED: process.env.GOOGLE_VEO_ENABLED,",
    "  GOOGLE_IMAGE_ENABLED: process.env.GOOGLE_IMAGE_ENABLED,",
    "  GEMINI_API_KEY: process.env.GEMINI_API_KEY,",
    "  GOOGLE_FLOW_URL: process.env.GOOGLE_FLOW_URL,",
    "  BRAND_WEBSITE: process.env.BRAND_WEBSITE,",
    "  NHACUALAND_URL: process.env.NHACUALAND_URL,",
    "  DATA_DIR: process.env.DATA_DIR",
    "}));"
  ].join(' ');

  const stdout = execFileSync(process.execPath, ['-e', probeScript], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    timeout: 10000
  }).trim();

  const parsed = JSON.parse(stdout);
  assert.equal(
    parsed.DRY_RUN,
    'true',
    `R4 SAFETY GATE BLOCKED: lib/env-loader.js clobbered pre-set DRY_RUN='true' back to '${parsed.DRY_RUN}'.`
  );
  assert.equal(
    parsed.AUTO_PUBLISH,
    'false',
    `R4 SAFETY GATE BLOCKED: lib/env-loader.js clobbered pre-set AUTO_PUBLISH='false' back to '${parsed.AUTO_PUBLISH}'.`
  );
  assert.equal(
    parsed.GOOGLE_FLOW_ENABLED,
    'false',
    `R4 SAFETY GATE BLOCKED: lib/env-loader.js clobbered pre-set GOOGLE_FLOW_ENABLED='false' back to '${parsed.GOOGLE_FLOW_ENABLED}'.`
  );
  assert.equal(
    parsed.GOOGLE_VEO_ENABLED,
    'false',
    `R4 SAFETY GATE BLOCKED: lib/env-loader.js clobbered pre-set GOOGLE_VEO_ENABLED='false' back to '${parsed.GOOGLE_VEO_ENABLED}'.`
  );
  assert.equal(
    parsed.GOOGLE_IMAGE_ENABLED,
    'false',
    `R4 SAFETY GATE BLOCKED: lib/env-loader.js clobbered pre-set GOOGLE_IMAGE_ENABLED='false' back to '${parsed.GOOGLE_IMAGE_ENABLED}'.`
  );
  assert.equal(
    parsed.GEMINI_API_KEY,
    '',
    `R4 SAFETY GATE BLOCKED: lib/env-loader.js clobbered pre-set GEMINI_API_KEY='' back to non-empty.`
  );
  assert.equal(
    parsed.GOOGLE_FLOW_URL,
    'http://127.0.0.1:9/',
    `R4 SAFETY GATE BLOCKED: lib/env-loader.js clobbered pre-set GOOGLE_FLOW_URL back to '${parsed.GOOGLE_FLOW_URL}'.`
  );
  assert.equal(
    parsed.BRAND_WEBSITE,
    'http://127.0.0.1:9/',
    `R4 SAFETY GATE BLOCKED: lib/env-loader.js clobbered pre-set BRAND_WEBSITE back to '${parsed.BRAND_WEBSITE}'.`
  );
  assert.equal(
    parsed.NHACUALAND_URL,
    'http://127.0.0.1:9/',
    `R4 SAFETY GATE BLOCKED: lib/env-loader.js clobbered pre-set NHACUALAND_URL back to '${parsed.NHACUALAND_URL}'.`
  );
  assert.equal(
    parsed.DATA_DIR,
    probeDataDir,
    `R4 SAFETY GATE BLOCKED: lib/env-loader.js clobbered pre-set DATA_DIR='${probeDataDir}' back to '${parsed.DATA_DIR}'.`
  );
  return parsed;
}

function assertDataDirHonored(resolvedPath, tempDir, label = 'output path') {
  assert.ok(resolvedPath && typeof resolvedPath === 'string', `R4 ISOLATION GATE: ${label} must be a non-empty string`);
  const normResolved = path.resolve(resolvedPath).toLowerCase();
  const normTemp = path.resolve(tempDir).toLowerCase();
  assert.ok(
    normResolved === normTemp || normResolved.startsWith(normTemp + path.sep),
    `R4 ISOLATION GATE: ${label} (${resolvedPath}) escaped isolated DATA_DIR (${tempDir})!`
  );
}

function createSeededCalendar(dateStr = getIctDateString()) {
  const plan = [
    {
      slot_id: `slot_${dateStr}_0830`,
      day: 'Hôm Nay',
      date: dateStr,
      slot_time: '08:30',
      slot_label: 'Ca Sáng (Ánh Sáng & Không Gian Ở)',
      segment: 'Phòng Studio',
      pillar_id: 'P1_STUDIO_LIGHT_LIVING',
      pillar_name: 'Phòng Studio Thoáng Sáng & Góc Ở Dễ Chịu',
      format: 'OMNICHANNEL_POST',
      target_platforms: ['facebook_fanpage', 'instagram', 'threads'],
      concept_hook: 'Đi làm cả ngày mệt mỏi, chỉ mong về căn phòng sáng sủa có cửa sổ đón nắng sớm',
      space_archetype_id: 'scandinavian_airy_studio',
      goal: 'RENTER_EMPATHY_AND_TRANSPARENCY',
      target_url: 'https://nhacualand.com',
      status: 'SCHEDULED'
    },
    {
      slot_id: `slot_${dateStr}_1130`,
      day: 'Hôm Nay',
      date: dateStr,
      slot_time: '11:30',
      slot_label: 'Ca Trưa (Minh Bạch Chi Phí & Kinh Nghiệm)',
      segment: 'Căn hộ dịch vụ',
      pillar_id: 'P2_CHDV_TRANSPARENT_COST',
      pillar_name: 'Căn Hộ Dịch Vụ Minh Bạch Chi Phí & Tiện Nghi',
      format: 'OMNICHANNEL_POST',
      target_platforms: ['facebook_fanpage', 'instagram', 'threads'],
      concept_hook: 'Nỗi sợ lớn nhất lúc đi thuê phòng là tiền điện nước và phụ phí mập mờ cuối tháng',
      space_archetype_id: 'chef_compact_kitchen',
      goal: 'RENTER_EMPATHY_AND_TRANSPARENCY',
      target_url: 'https://nhacualand.com',
      status: 'SCHEDULED'
    },
    {
      slot_id: `slot_${dateStr}_1945`,
      day: 'Hôm Nay',
      date: dateStr,
      slot_time: '19:45',
      slot_label: 'Ca Tối (Tan Làm Về Phòng & Nghỉ Ngơi)',
      segment: 'Chung cư mini',
      pillar_id: 'P3_CCM_QUIET_SECURITY',
      pillar_name: 'Chung Cư Mini Yên Tĩnh & Giấc Ngủ Sau Giờ Làm',
      format: 'REELS_CINEMATIC_ROOM_TOUR',
      target_platforms: ['threads', 'facebook_fanpage', 'instagram'],
      concept_hook: 'Tan làm dắt xe về phòng trọ chỉ mong mở cửa thấy chỗ nghỉ ngơi yên tĩnh sạch sẽ',
      space_archetype_id: 'lofi_evening_chill',
      goal: 'RENTER_EMPATHY_AND_TRANSPARENCY',
      target_url: 'https://nhacualand.com',
      status: 'SCHEDULED'
    }
  ];

  return {
    domain: 'nhacualand.com',
    brand: 'Nhà Của Land',
    updated_at: new Date().toISOString(),
    total_slots: plan.length,
    plan
  };
}

function createTempWorkspace(prefix = 'run', { seedCalendar = null, seedHistory = [] } = {}) {
  if (!fs.existsSync(E2E_TMP_ROOT)) {
    fs.mkdirSync(E2E_TMP_ROOT, { recursive: true });
  }
  const uniqueId = `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const tempDir = path.join(E2E_TMP_ROOT, `_e2e_tmp_${uniqueId}`);
  const dirs = {
    knowledge: path.join(tempDir, 'knowledge'),
    meetings: path.join(tempDir, 'meetings'),
    images: path.join(tempDir, 'images'),
    videos: path.join(tempDir, 'videos'),
    screenshots: path.join(tempDir, 'screenshots'),
    outputs: path.join(tempDir, 'outputs'),
    browserProfile: path.join(tempDir, 'browser_profile')
  };

  fs.mkdirSync(tempDir, { recursive: true });
  Object.values(dirs).forEach(d => fs.mkdirSync(d, { recursive: true }));

  const historyFile = path.join(tempDir, 'publish_history.json');
  const calendarFile = path.join(tempDir, 'scheduled_calendar.json');
  const lockFile = path.join(tempDir, 'orchestrator.lock');

  fs.writeFileSync(historyFile, JSON.stringify(seedHistory, null, 2), 'utf8');
  fs.writeFileSync(
    calendarFile,
    JSON.stringify(seedCalendar || createSeededCalendar(), null, 2),
    'utf8'
  );

  return {
    tempDir,
    paths: {
      ...dirs,
      historyFile,
      calendarFile,
      lockFile
    },
    cleanup() {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
      } catch {
        // Ignore cleanup errors on Windows handle release lag
      }
    }
  };
}

function cleanupEmptyTmpRoot() {
  try {
    if (fs.existsSync(E2E_TMP_ROOT)) {
      const remaining = fs.readdirSync(E2E_TMP_ROOT);
      if (remaining.length === 0) {
        fs.rmdirSync(E2E_TMP_ROOT);
      }
    }
  } catch {
    // ignore
  }
}

function buildSafeIsolatedEnv(tempDir, extraEnv = {}) {
  return {
    ...process.env,
    DRY_RUN: 'true',
    AUTO_PUBLISH: 'false',
    FACEBOOK_AUTO_PUBLISH: 'false',
    INSTAGRAM_AUTO_PUBLISH: 'false',
    THREADS_AUTO_PUBLISH: 'false',
    GOOGLE_FLOW_ENABLED: 'false',
    GOOGLE_VEO_ENABLED: 'false',
    GOOGLE_IMAGE_ENABLED: 'false',
    PLAYWRIGHT_PREFER_CDP: 'false',
    PLAYWRIGHT_HEADLESS: 'true',
    CHROME_USER_DATA_DIR: path.join(tempDir, 'browser_profile'),
    CHROME_PROFILE_DIRECTORY: 'E2E_Isolated_Profile',
    CHROME_EXECUTABLE_PATH: path.join(tempDir, '__no_system_chrome__.exe'),
    DATA_DIR: tempDir,
    META_PAGE_ACCESS_TOKEN: '',
    FB_PAGE_TOKEN: '',
    FB_USER_TOKEN: '',
    FB_USER_ID: '',
    INSTAGRAM_ACCOUNT_ID: '',
    INSTAGRAM_ACCESS_TOKEN: '',
    THREADS_USER_ID: '',
    THREADS_ACCESS_TOKEN: '',
    THREADS_API_BASE_URL: '',
    GOOGLE_FLOW_URL: 'http://127.0.0.1:9/',
    BRAND_WEBSITE: 'http://127.0.0.1:9/',
    NHACUALAND_URL: 'http://127.0.0.1:9/',
    BRAND_FACEBOOK_URL: 'http://127.0.0.1:9/',
    BRAND_INSTAGRAM_URL: 'http://127.0.0.1:9/',
    BRAND_THREADS_URL: 'http://127.0.0.1:9/',
    GEMINI_API_KEY: '',
    STRICT_BRAND_ASSET_GUARD: 'true',
    ...extraEnv
  };
}

async function runNodeCliSafe(scriptRelPath, args = [], {
  tempDir,
  extraEnv = {},
  timeoutMs = 45000,
  nodeArgs = []
} = {}) {
  assert.ok(tempDir, 'tempDir is required for runNodeCliSafe');
  assertEnvLoaderSafeForDryRun();

  const scriptAbs = path.resolve(WORKSPACE_ROOT, scriptRelPath);
  const env = buildSafeIsolatedEnv(tempDir, extraEnv);
  const spawnArgs = [...(Array.isArray(nodeArgs) ? nodeArgs : []), scriptAbs, ...args];

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, spawnArgs, {
      cwd: WORKSPACE_ROOT,
      env,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 4,
      encoding: 'utf8'
    });
    return { status: 0, stdout: stdout || '', stderr: stderr || '', timedOut: false };
  } catch (err) {
    return {
      status: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || '',
      timedOut: Boolean(err.killed && err.signal === 'SIGTERM')
    };
  }
}

async function runNodeSnippetSafe(code, { tempDir, extraEnv = {}, timeoutMs = 45000 } = {}) {
  assert.ok(tempDir, 'tempDir is required for runNodeSnippetSafe');
  assertEnvLoaderSafeForDryRun();

  const env = buildSafeIsolatedEnv(tempDir, extraEnv);
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, ['-e', code], {
      cwd: WORKSPACE_ROOT,
      env,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 4,
      encoding: 'utf8'
    });
    return { status: 0, stdout: stdout || '', stderr: stderr || '' };
  } catch (err) {
    return {
      status: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || ''
    };
  }
}

/**
 * Wraps a child-process snippet so `@google/genai` is stubbed in `require.cache`
 * BEFORE any project service loads it, without touching any production file.
 */
async function runNodeSnippetWithMockGenAi(mockFactorySource, innerCode, {
  tempDir,
  extraEnv = {},
  timeoutMs = 45000
} = {}) {
  const fullSnippet = `
    const resolvedGenAi = require.resolve('@google/genai');
    const mockExports = (${mockFactorySource})();
    require.cache[resolvedGenAi] = {
      id: resolvedGenAi,
      filename: resolvedGenAi,
      loaded: true,
      exports: mockExports
    };
    ${innerCode}
  `;
  return await runNodeSnippetSafe(fullSnippet, { tempDir, extraEnv, timeoutMs });
}

function spawnHoldLockChild(lockFile, maxAgeMs = 30 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const script = `
      const { acquireProcessLock } = require('./lib/process-lock');
      const lock = acquireProcessLock({ lockFile: ${JSON.stringify(lockFile)}, maxAgeMs: ${Number(maxAgeMs)} });
      console.log('CHILD_LOCK:' + JSON.stringify({ acquired: lock.acquired, pid: process.pid }));
      if (!lock.acquired) process.exit(2);
      const keepAlive = setInterval(() => {}, 1000);
      const shutdown = () => { clearInterval(keepAlive); process.exit(0); };
      process.on('message', msg => { if (msg === 'exit') shutdown(); });
      process.on('SIGTERM', shutdown);
    `;
    const child = spawn(process.execPath, ['-e', script], {
      cwd: WORKSPACE_ROOT,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Timeout waiting for child lock acquire. stderr=${stderr}`));
    }, 10000);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      const line = stdout.split(/\r?\n/).find(l => l.startsWith('CHILD_LOCK:'));
      if (line) {
        clearTimeout(timer);
        const info = JSON.parse(line.slice('CHILD_LOCK:'.length));
        resolve({ child, info });
      }
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function gracefulExitChildAsync(child) {
  return new Promise(resolve => {
    if (!child || child.exitCode !== null || child.killed) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    try {
      if (child.connected) {
        child.send('exit');
      } else {
        child.kill();
      }
    } catch {
      resolve();
    }
    setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      resolve();
    }, 3000).unref();
  });
}

function killChildAsync(child) {
  return new Promise(resolve => {
    if (!child || child.exitCode !== null || child.killed) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    try {
      child.kill();
    } catch {
      resolve();
    }
    setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      resolve();
    }, 2000).unref();
  });
}

function generateSyntheticPng(outputPath, { width = 1080, height = 1440 } = {}) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  execFileSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', `testsrc2=size=${width}x${height}:duration=1`,
    '-frames:v', '1',
    outputPath
  ], { stdio: 'pipe', timeout: 15000 });
  return outputPath;
}

function generateSyntheticVideo(outputPath, {
  width = 1080,
  height = 1920,
  durationSec = 3,
  solidBlack = false,
  tinyFile = false
} = {}) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (tinyFile) {
    execFileSync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'color=c=blue:s=320x568:d=1',
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', '1',
      '-c:v', 'libx264',
      '-crf', '45',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-shortest',
      outputPath
    ], { stdio: 'pipe', timeout: 20000 });
    return outputPath;
  }

  if (solidBlack) {
    execFileSync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=black:s=${width}x${height}:r=24:d=${durationSec}`,
      '-f', 'lavfi',
      '-i', `sine=frequency=440:duration=${durationSec}`,
      '-t', String(durationSec),
      '-c:v', 'libx264',
      '-x264-params', 'nal-hrd=cbr',
      '-b:v', '1400k',
      '-minrate', '1400k',
      '-maxrate', '1400k',
      '-bufsize', '1400k',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-shortest',
      outputPath
    ], { stdio: 'pipe', timeout: 30000 });
    return outputPath;
  }

  execFileSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', `testsrc2=size=${width}x${height}:rate=24:duration=${durationSec}`,
    '-f', 'lavfi',
    '-i', `sine=frequency=440:duration=${durationSec}`,
    '-t', String(durationSec),
    '-c:v', 'libx264',
    '-b:v', '1500k',
    '-minrate', '1200k',
    '-maxrate', '2500k',
    '-bufsize', '2000k',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-shortest',
    outputPath
  ], { stdio: 'pipe', timeout: 30000 });
  return outputPath;
}

function probeMedia(filePath) {
  const out = execFileSync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath
  ], { encoding: 'utf8', timeout: 15000 });
  return JSON.parse(out);
}

async function startLoopbackServer(handlerOrHtml) {
  const server = http.createServer((req, res) => {
    if (typeof handlerOrHtml === 'function') {
      handlerOrHtml(req, res);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(String(handlerOrHtml));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise(resolve => server.close(() => resolve()))
  };
}

async function withHeadlessPage(fn) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    return await fn(page, context);
  } finally {
    await browser.close();
  }
}

module.exports = {
  WORKSPACE_ROOT,
  E2E_TMP_ROOT,
  PROD_DATA_DIR,
  PROD_OUTPUTS_DIR,
  PROD_HISTORY_FILE,
  PROD_CALENDAR_FILE,
  getIctDateString,
  snapshotProductionData,
  assertProductionDataUnchanged,
  assertEnvLoaderSafeForDryRun,
  assertDataDirHonored,
  createSeededCalendar,
  createTempWorkspace,
  cleanupEmptyTmpRoot,
  buildSafeIsolatedEnv,
  runNodeCliSafe,
  runNodeSnippetSafe,
  runNodeSnippetWithMockGenAi,
  spawnHoldLockChild,
  gracefulExitChildAsync,
  killChildAsync,
  generateSyntheticPng,
  generateSyntheticVideo,
  probeMedia,
  startLoopbackServer,
  withHeadlessPage
};
