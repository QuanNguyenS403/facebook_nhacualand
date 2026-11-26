'use strict';

const { describe, it, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const Module = require('module');
const { execFileSync, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT_DIR = path.resolve(__dirname, '../..');
const UNIT_TMP_BASE = path.join(ROOT_DIR, 'tests', '.m3_tmp');

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function makeTempDataDir(label = 'case') {
  if (!fs.existsSync(UNIT_TMP_BASE)) {
    fs.mkdirSync(UNIT_TMP_BASE, { recursive: true });
  }
  const dir = fs.mkdtempSync(path.join(UNIT_TMP_BASE, `${label}_`));
  fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'videos'), { recursive: true });
  return dir;
}

function probeMedia(filePath) {
  const out = execFileSync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 });
  return JSON.parse(out);
}

function createSyntheticPng(outPath, { width = 1080, height = 1440, color = null } = {}) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const inputSrc = color
    ? `color=c=${color}:s=${width}x${height}:d=1`
    : `testsrc2=size=${width}x${height}:r=1:d=1`;
  execFileSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', inputSrc,
    '-frames:v', '1',
    outPath
  ], { stdio: 'pipe', timeout: 20000 });
  return outPath;
}

function createSyntheticVideo(outPath, { width = 1080, height = 1920, durationSec = 3, solidBlack = false, tiny = false } = {}) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (tiny) {
    execFileSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x568:d=1',
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', '1', '-c:v', 'libx264', '-crf', '45', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
      outPath
    ], { stdio: 'pipe', timeout: 20000 });
    return outPath;
  }
  if (solidBlack) {
    execFileSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=24:d=${durationSec}`,
      '-f', 'lavfi', '-i', `sine=frequency=440:duration=${durationSec}`,
      '-t', String(durationSec), '-c:v', 'libx264', '-x264-params', 'nal-hrd=cbr',
      '-b:v', '1400k', '-minrate', '1400k', '-maxrate', '1400k', '-bufsize', '1400k',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
      outPath
    ], { stdio: 'pipe', timeout: 30000 });
    return outPath;
  }
  execFileSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=24:duration=${durationSec}`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${durationSec}`,
    '-t', String(durationSec), '-c:v', 'libx264',
    '-b:v', '1500k', '-minrate', '1200k', '-maxrate', '2500k', '-bufsize', '2000k',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
    outPath
  ], { stdio: 'pipe', timeout: 30000 });
  return outPath;
}

describe('M3 — Media Studio (ImageEngine, VeoVideoEngine, VideoEngine, GoogleFlowAgent, HyperframesFFmpeg)', () => {
  let tmpDataDir;
  let origEnv;
  const origLoad = Module._load;

  beforeEach(() => {
    origEnv = {
      DATA_DIR: process.env.DATA_DIR,
      DRY_RUN: process.env.DRY_RUN,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GOOGLE_FLOW_ENABLED: process.env.GOOGLE_FLOW_ENABLED,
      GOOGLE_VEO_ENABLED: process.env.GOOGLE_VEO_ENABLED,
      GOOGLE_IMAGE_ENABLED: process.env.GOOGLE_IMAGE_ENABLED
    };
    tmpDataDir = makeTempDataDir('m3');
    process.env.DATA_DIR = tmpDataDir;
    process.env.DRY_RUN = 'true';
    process.env.GEMINI_API_KEY = '';
    process.env.GOOGLE_FLOW_ENABLED = 'false';
    process.env.GOOGLE_VEO_ENABLED = 'false';
    process.env.GOOGLE_IMAGE_ENABLED = 'false';
  });

  afterEach(() => {
    Module._load = origLoad;
    for (const [k, v] of Object.entries(origEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
  });

  after(() => {
    fs.rmSync(UNIT_TMP_BASE, { recursive: true, force: true });
  });

  describe('Dynamic DATA_DIR & Workspace Isolation', () => {
    it('tracks dynamic DATA_DIR across all M3 modules and rejects traversal paths', async () => {
      const imageEngine = require('../../services/image_engine');
      const veoEngine = require('../../services/veo_video_engine');
      const videoEngine = require('../../services/video-engine');
      const googleFlowAgent = require('../../services/google_flow_agent');

      assert.equal(imageEngine.outputDir, path.join(tmpDataDir, 'images'));
      assert.equal(veoEngine.outputDir, path.join(tmpDataDir, 'videos'));
      assert.equal(videoEngine.outputDir, path.join(tmpDataDir, 'videos'));
      assert.equal(googleFlowAgent.outputDir, path.join(tmpDataDir, 'videos'));
      assert.equal(googleFlowAgent.imageDir, path.join(tmpDataDir, 'images'));

      await assert.rejects(
        () => imageEngine.generateImage({ prompt: 'Studio', customName: '../../escape_img', dryRun: true }),
        /Workspace isolation violation/
      );
      await assert.rejects(
        () => imageEngine.generateImage({ prompt: 'Studio', customName: '\\\\host\\share\\x.png', dryRun: true }),
        /Workspace isolation violation/
      );
      await assert.rejects(
        () => imageEngine.generateImage({ prompt: 'Studio', customName: 'sub/nested_img', dryRun: true }),
        /Workspace isolation violation/
      );
      await assert.rejects(
        () => videoEngine.renderReel({ title: 'Room', outputFilename: '../../escape_vid.mp4', dryRun: true }),
        /Workspace isolation violation/
      );
      await assert.rejects(
        () => videoEngine.renderReel({ title: 'Room', outputFilename: 'nested\\vid.mp4', dryRun: true }),
        /Workspace isolation violation/
      );
      await assert.rejects(
        () => veoEngine.createRealisticVideo({ prompt: 'Room', customName: 'sub/veo_vid', dryRun: true }),
        /Workspace isolation violation/
      );
    });
  });

  describe('ImageEngine', () => {
    it('extractBase64FromInteraction handles null, undefined, empty, data-URI, output_image, and steps', () => {
      const imageEngine = require('../../services/image_engine');
      assert.equal(imageEngine.extractBase64FromInteraction(null), null);
      assert.equal(imageEngine.extractBase64FromInteraction(undefined), null);
      assert.equal(imageEngine.extractBase64FromInteraction({}), null);
      assert.equal(imageEngine.extractBase64FromInteraction({ steps: [] }), null);
      assert.equal(imageEngine.extractBase64FromInteraction({ steps: [{ type: 'model_output', content: [] }] }), null);
      assert.equal(
        imageEngine.extractBase64FromInteraction({ output_image: { data: 'data:image/png;base64,QUJDRA==' } }),
        'QUJDRA=='
      );
      assert.equal(
        imageEngine.extractBase64FromInteraction({
          steps: [{ type: 'model_output', content: [{ type: 'image', data: 'WXYZ' }] }]
        }),
        'WXYZ'
      );
    });

    it('generates clean architectural PNGs at exact pixel dimensions for 3:4, 4:5, and 1:1 in dryRun', async () => {
      const imageEngine = require('../../services/image_engine');
      const cases = [
        { aspectRatio: '3:4', width: 1080, height: 1440 },
        { aspectRatio: '4:5', width: 1080, height: 1350 },
        { aspectRatio: '1:1', width: 1080, height: 1080 }
      ];

      for (const c of cases) {
        const res = await imageEngine.generateImage({
          visualPrompt: 'Bright sunlit Vietnamese studio apartment interior',
          aspectRatio: c.aspectRatio,
          mode: 'AUTO',
          dryRun: true
        });
        assert.equal(res.success, true);
        assert.equal(res.dryRun, true);
        assert.equal(res.filePath, res.file_path);
        assert.ok(res.filePath.startsWith(path.join(tmpDataDir, 'images')));
        assert.equal(/BRAND_CARD/i.test(res.engine), false);
        assert.ok(fs.statSync(res.filePath).size > 10 * 1024);

        const header = [...fs.readFileSync(res.filePath).subarray(0, 8)];
        assert.deepEqual(header, PNG_MAGIC);

        const info = probeMedia(res.filePath);
        const vStream = info.streams.find(s => s.codec_type === 'video');
        assert.equal(vStream.width, c.width);
        assert.equal(vStream.height, c.height);
      }
    });

    it('contains zero branded sales poster strings in services/image_engine.js and blocks FLOW_WEB when disabled', async () => {
      const src = fs.readFileSync(path.join(ROOT_DIR, 'services/image_engine.js'), 'utf8');
      assert.equal(/NHÀ CỦA LAND|Đặt lịch xem phòng|nhacualand\.com|BRAND_CARD/i.test(src), false);

      const imageEngine = require('../../services/image_engine');
      await assert.rejects(
        () => imageEngine.generateImage({ prompt: 'Studio room', mode: 'FLOW_WEB', dryRun: false }),
        /disabled/i
      );
    });

    it('calls @google/genai with current response_format and falls back cleanly on corrupt base64 or API errors', async () => {
      const seedPng = createSyntheticPng(path.join(tmpDataDir, 'images', 'seed_api.png'), { width: 128, height: 128 });
      const validB64 = fs.readFileSync(seedPng).toString('base64');

      const captured = [];
      let mockMode = 'VALID';

      Module._load = function patchedLoad(request, parent, isMain) {
        if (request === '@google/genai') {
          return {
            GoogleGenAI: class {
              constructor() {
                this.interactions = {
                  create: async (params) => {
                    captured.push(params);
                    if (mockMode === 'CORRUPT') {
                      return { output_image: { data: 'not_valid_png_base64!!!' } };
                    }
                    if (mockMode === 'ERROR') {
                      throw new Error('Simulated 503 API error');
                    }
                    return { output_image: { data: validB64 } };
                  }
                };
              }
            }
          };
        }
        return origLoad.apply(this, arguments);
      };

      delete require.cache[require.resolve('../../services/image_engine')];
      const imageEngine = require('../../services/image_engine');
      process.env.GEMINI_API_KEY = 'mock-key';

      const okRes = await imageEngine.generateImage({
        prompt: 'Sunlit minimalist studio room',
        aspectRatio: '3:4',
        imageSize: '2K',
        mode: 'API'
      });
      assert.equal(okRes.success, true);
      assert.equal(okRes.dryRun, false);
      assert.ok(captured.length >= 1);
      assert.equal(captured[0].response_modalities, undefined);
      assert.equal(captured[0].response_mime_type, undefined);
      assert.equal(captured[0].generation_config, undefined);
      assert.deepEqual(captured[0].response_format, {
        type: 'image',
        aspect_ratio: '3:4',
        image_size: '2K'
      });

      mockMode = 'CORRUPT';
      const corruptRes = await imageEngine.generateImage({
        prompt: 'Clean room',
        aspectRatio: '3:4',
        mode: 'AUTO'
      });
      assert.equal(corruptRes.success, true);
      assert.equal(/GOOGLE_GENAI/i.test(corruptRes.engine), false);
      assert.deepEqual([...fs.readFileSync(corruptRes.filePath).subarray(0, 8)], PNG_MAGIC);

      mockMode = 'ERROR';
      const errRes = await imageEngine.generateImage({
        prompt: 'Clean room',
        aspectRatio: '4:5',
        mode: 'AUTO'
      });
      assert.equal(errRes.success, true);
      assert.ok(errRes.filePath.startsWith(path.join(tmpDataDir, 'images')));
    });
  });

  describe('HyperframesFFmpeg', () => {
    it('composeReel generates 1080x1920 MP4 >=300KB with -14 LUFS audio for 1 and 2 images, and rejects invalid inputs', async () => {
      const hf = require('../../services/hyperframes_ffmpeg');
      const img1 = createSyntheticPng(path.join(tmpDataDir, 'images', 'hf_1.png'));
      const img2 = createSyntheticPng(path.join(tmpDataDir, 'images', 'hf_2.png'));

      const out1 = path.join(tmpDataDir, 'videos', 'single.mp4');
      const res1 = await hf.composeReel({ imagePaths: [img1], outputPath: out1, durationSec: 3, aspectRatio: '9:16' });
      assert.ok(res1.fileSizeBytes >= 300 * 1024);
      assert.equal(res1.lufsNormalized, true);
      assert.equal(res1.width, 1080);
      assert.equal(res1.height, 1920);

      const out2 = path.join(tmpDataDir, 'videos', 'multi.mp4');
      const res2 = await hf.composeReel({ imagePaths: [img1, img2], outputPath: out2, durationSec: 4, aspectRatio: '9:16' });
      assert.ok(res2.fileSizeBytes >= 300 * 1024);
      assert.equal(res2.lufsNormalized, true);
      const info2 = probeMedia(out2);
      assert.ok(info2.streams.some(s => s.codec_type === 'audio'));

      await assert.rejects(() => hf.composeReel({ imagePaths: [], outputPath: out2 }));
      await assert.rejects(() => hf.composeReel({
        imagePaths: [path.join(tmpDataDir, 'images', 'does_not_exist.png')],
        outputPath: out2
      }));
    });

    it('validateMediaQuality rejects missing, tiny, solid-black, and corrupt files while passing valid videos and images', async () => {
      const hf = require('../../services/hyperframes_ffmpeg');

      const missing = await hf.validateMediaQuality(path.join(tmpDataDir, 'videos', 'none.mp4'), 'video');
      assert.equal(missing.passed, false);

      const tinyVid = createSyntheticVideo(path.join(tmpDataDir, 'videos', 'tiny.mp4'), { tiny: true });
      assert.equal((await hf.validateMediaQuality(tinyVid, 'video')).passed, false);

      const blackVid = createSyntheticVideo(path.join(tmpDataDir, 'videos', 'black.mp4'), { solidBlack: true });
      assert.equal((await hf.validateMediaQuality(blackVid, 'video')).passed, false);

      const corruptVid = path.join(tmpDataDir, 'videos', 'corrupt.mp4');
      fs.writeFileSync(corruptVid, Buffer.alloc(400 * 1024, 0x41));
      assert.equal((await hf.validateMediaQuality(corruptVid, 'video')).passed, false);

      const validVid = createSyntheticVideo(path.join(tmpDataDir, 'videos', 'valid.mp4'));
      assert.equal((await hf.validateMediaQuality(validVid, 'video')).passed, true);

      const validImg = createSyntheticPng(path.join(tmpDataDir, 'images', 'valid.png'));
      assert.equal((await hf.validateMediaQuality(validImg, 'image')).passed, true);

      const corruptImg = path.join(tmpDataDir, 'images', 'corrupt.png');
      fs.writeFileSync(corruptImg, Buffer.alloc(4096, 0x41));
      assert.equal((await hf.validateMediaQuality(corruptImg, 'image')).passed, false);

      const blackImg = createSyntheticPng(path.join(tmpDataDir, 'images', 'solid_black.png'), { color: '0x000000' });
      assert.equal((await hf.validateMediaQuality(blackImg, 'image')).passed, false);

      const nearBlackImg = createSyntheticPng(path.join(tmpDataDir, 'images', 'near_black_101010.png'), { color: '0x101010' });
      assert.equal((await hf.validateMediaQuality(nearBlackImg, 'image')).passed, false);

      await assert.rejects(
        () => hf.composeReel({ imagePaths: [blackImg], outputPath: path.join(tmpDataDir, 'videos', 'black_in.mp4'), durationSec: 3 }),
        /quality gate/i
      );
    });
  });

  describe('VeoVideoEngine & VideoEngine', () => {
    it('veoEngine validates VideoResponseFormat and handles corrupt API video fallback cleanly', async () => {
      const sampleMp4 = createSyntheticVideo(path.join(tmpDataDir, 'videos', 'seed_veo.mp4'), { durationSec: 2 });
      const validB64 = fs.readFileSync(sampleMp4).toString('base64');
      const captured = [];
      let corrupt = false;

      Module._load = function patchedLoad(request, parent, isMain) {
        if (request === '@google/genai') {
          return {
            GoogleGenAI: class {
              constructor() {
                this.interactions = {
                  create: async (params) => {
                    captured.push(params);
                    return {
                      id: 'veo_mock_1',
                      output_video: { data: corrupt ? 'not_valid_mp4_data!!!' : validB64 }
                    };
                  }
                };
              }
            }
          };
        }
        return origLoad.apply(this, arguments);
      };

      delete require.cache[require.resolve('../../services/veo_video_engine')];
      const veoEngine = require('../../services/veo_video_engine');
      process.env.GEMINI_API_KEY = 'mock-key';

      assert.equal(veoEngine.extractVideoBase64FromInteraction(null), null);
      assert.equal(veoEngine.extractVideoBase64FromInteraction({ steps: [] }), null);

      const okRes = await veoEngine.createRealisticVideo({
        prompt: 'Sunlit studio room tour',
        aspectRatio: '9:16',
        resolution: '1080p',
        duration: 4,
        mode: 'API'
      });
      assert.equal(okRes.success, true);
      assert.ok(captured.length >= 1);
      assert.equal(captured[0].response_modalities, undefined);
      assert.deepEqual(captured[0].response_format, {
        type: 'video',
        aspect_ratio: '9:16',
        resolution: '1080p',
        duration: '4s'
      });

      corrupt = true;
      const fallbackRes = await veoEngine.createRealisticVideo({
        prompt: 'Sunlit studio room tour',
        aspectRatio: '9:16',
        resolution: '1080p',
        duration: 3,
        mode: 'AUTO'
      });
      assert.equal(fallbackRes.success, true);
      assert.ok(fallbackRes.filePath.startsWith(path.join(tmpDataDir, 'videos')));
      assert.ok(fallbackRes.fileSizeBytes >= 300 * 1024);
    });

    it('VideoEngine.renderReel produces 9:16 reel >=300KB, preview PNG, audio stream, empty call_to_action, and qualityPassed=true', async () => {
      const videoEngine = require('../../services/video-engine');
      const res = await videoEngine.renderReel({
        title: 'Góc phòng sáng thoáng',
        hook: 'Ánh nắng nhẹ bên khung cửa sổ',
        duration: 3,
        aspectRatio: '9:16',
        mode: 'AUTO',
        dryRun: true
      });

      assert.equal(res.success, true);
      assert.equal(res.dryRun, true);
      assert.equal(res.qualityPassed, true);
      assert.equal(res.call_to_action, '');
      assert.equal(res.filePath, res.file_path);
      assert.equal(res.previewPath, res.preview_snapshot);
      assert.ok(res.filePath.startsWith(path.join(tmpDataDir, 'videos')));
      assert.ok(fs.existsSync(res.previewPath));
      assert.ok(res.fileSizeBytes >= 300 * 1024);

      const info = probeMedia(res.filePath);
      const vStream = info.streams.find(s => s.codec_type === 'video');
      const aStream = info.streams.find(s => s.codec_type === 'audio');
      assert.equal(vStream.width, 1080);
      assert.equal(vStream.height, 1920);
      assert.ok(aStream);

      const sess = await videoEngine.checkGoogleFlowSession();
      assert.equal(sess.ready, false);
      assert.equal(sess.disabled, true);
    });

    it('VideoEngine.renderReel recovers cleanly with fresh architectural frames when caller passes solid-black imagePaths', async () => {
      const videoEngine = require('../../services/video-engine');
      const blackPng = createSyntheticPng(path.join(tmpDataDir, 'images', 'caller_black.png'), { color: '0x000000' });

      const res = await videoEngine.renderReel({
        title: 'Khôi phục khung hình sáng',
        hook: 'Phòng thoáng sáng',
        duration: 3,
        aspectRatio: '9:16',
        mode: 'AUTO',
        dryRun: true,
        imagePaths: [blackPng]
      });

      assert.equal(res.success, true);
      assert.equal(res.qualityPassed, true);
      assert.equal(res.ready_for_publish, true);
      assert.equal(res.engine, 'HYPERFRAMES_FFMPEG_QUALITY_FALLBACK');
      assert.ok(res.fileSizeBytes >= 300 * 1024);
      assert.ok(fs.existsSync(res.previewPath));
    });
  });

  describe('GoogleFlowAgent', () => {
    it('blocks Flow browser calls when DRY_RUN=true or GOOGLE_FLOW_ENABLED=false and renders clean fallback video', async () => {
      const googleFlowAgent = require('../../services/google_flow_agent');

      await assert.rejects(
        () => googleFlowAgent.generateImage({ prompt: 'Studio room' }),
        /disabled/i
      );
      await assert.rejects(
        () => googleFlowAgent.generateVideo({ prompt: 'Studio room' }),
        /disabled/i
      );

      for (let runIdx = 0; runIdx < 3; runIdx++) {
        const fallbackMp4 = path.join(tmpDataDir, 'videos', `flow_fallback_${runIdx}.mp4`);
        googleFlowAgent.renderFallbackCinematic({
          outputPath: fallbackMp4,
          title: 'Phòng sáng thoáng',
          aspectRatio: '9:16',
          duration: 3
        });
        assert.ok(fs.existsSync(fallbackMp4));
        assert.ok(fs.statSync(fallbackMp4).size >= 300 * 1024, `Run ${runIdx} fallback MP4 must be >= 300KB`);
      }

      const src = fs.readFileSync(path.join(ROOT_DIR, 'services/google_flow_agent.js'), 'utf8');
      const fnSlice = src.slice(src.indexOf('renderFallbackCinematic('));
      assert.equal(/nhacualand\.com/i.test(fnSlice), false);
    });

    it('dismissOverlays clears 5 stacked CDK overlays and skips hidden preceding buttons', async () => {
      const googleFlowAgent = require('../../services/google_flow_agent');
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.setContent(`
          <html><body>
            ${Array.from({ length: 5 }, (_, i) => `
              <div id="bd-${i}" class="cdk-overlay-backdrop cdk-overlay-backdrop-showing" style="position:fixed;inset:0;z-index:${990 + i};display:block"></div>
              <div id="ov-${i}" class="cdk-overlay-container" style="position:fixed;inset:0;z-index:${1000 + i};display:flex;align-items:center;justify-content:center">
                <button style="display:none">OK</button>
                <button onclick="document.getElementById('bd-${i}').remove(); document.getElementById('ov-${i}').remove();">Tôi hiểu</button>
              </div>
            `).join('')}
          </body></html>
        `);
        await googleFlowAgent.dismissOverlays(page);
        const remaining = await page.locator('.cdk-overlay-backdrop-showing').count();
        assert.equal(remaining, 0);
      } finally {
        await browser.close().catch(() => {});
      }
    });

    it('exits Node cleanly after mocked @google/genai resolution without hanging on timeout timers', () => {
      const runner = spawnSync(process.execPath, ['-e', `
        const Module = require('module');
        const origLoad = Module._load;
        Module._load = function(req) {
          if (req === '@google/genai') {
            return {
              GoogleGenAI: class {
                constructor() {
                  this.interactions = { create: async () => ({ output_image: { data: 'bad' } }) };
                }
              }
            };
          }
          return origLoad.apply(this, arguments);
        };
        const imageEngine = require('./services/image_engine');
        imageEngine.generateImage({ prompt: 'Clean room', mode: 'AUTO' }).then(() => {
          console.log('DONE_CLEAN');
        });
      `], {
        cwd: ROOT_DIR,
        env: { ...process.env, DATA_DIR: tmpDataDir, GEMINI_API_KEY: 'mock-key', GOOGLE_FLOW_ENABLED: 'false' },
        encoding: 'utf8',
        timeout: 15000
      });
      assert.equal(runner.status, 0, runner.stderr);
      assert.match(runner.stdout, /DONE_CLEAN/);
    });
  });
});
