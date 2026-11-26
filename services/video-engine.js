'use strict';

/**
 * SHORTVIDEO & GOOGLE FLOW / VEO / HYPERFRAMES ROOM TOUR ENGINE
 * Chỉ duy nhất tại D:\Facebook
 *
 * Sản xuất video ngắn Room Tour chuẩn 9:16 (1080x1920) cho cả 3 kênh:
 * Facebook Reels + Instagram Reels + Threads Video.
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const veoEngine = require('./veo_video_engine');
const googleFlowAgent = require('./google_flow_agent');
const promptArchitect = require('./prompt_architect');
const imageEngine = require('./image_engine');
const hyperframesFFmpeg = require('./hyperframes_ffmpeg');
const { assertInsideWorkspace } = require('../lib/governance');

function getDataDir() {
  const raw = process.env.DATA_DIR;
  return (typeof raw === 'string' && raw.trim())
    ? path.resolve(raw.trim())
    : path.resolve(__dirname, '../data');
}

function validateOutputBasename(name, label = 'outputFilename') {
  if (name === null || name === undefined) return null;
  const str = String(name);
  if (str.includes('\0') || /[\\/]/.test(str) || /^[a-zA-Z]:/.test(str)) {
    throw new Error(`Workspace isolation violation: ${label} must be a plain filename without path separators or drive prefixes.`);
  }
  return str;
}

class VideoEngine {
  get outputDir() {
    return path.join(getDataDir(), 'videos');
  }

  async renderReel({
    title = 'Góc phòng sáng thoáng',
    hook = 'Ánh nắng nhẹ bên khung cửa sổ',
    scenes = null,
    callToAction = '',
    duration = parseInt(process.env.VIDEO_DEFAULT_DURATION_SECONDS || '8', 10),
    aspectRatio = process.env.VIDEO_DEFAULT_ASPECT_RATIO || '9:16',
    outputFilename = null,
    mode = 'AUTO',
    dryRun = false,
    imagePaths = null
  } = {}) {
    const videosDir = this.outputDir;
    const dur = Math.max(1, Number(duration) || 8);
    const safeCustomName = validateOutputBasename(outputFilename, 'outputFilename');
    const rawFilename = safeCustomName ? `${safeCustomName.replace(/\.mp4$/i, '')}.mp4` : `reel_roomtour_${Date.now()}.mp4`;
    const safeOutputPath = assertInsideWorkspace(path.join(videosDir, rawFilename), videosDir);
    assertInsideWorkspace(safeOutputPath);
    const safeFilename = path.basename(safeOutputPath);

    const sceneHints = Array.isArray(scenes) && scenes.length > 0
      ? scenes.map(s => (typeof s === 'string' ? s : (s && (s.visual || s.description || s.caption)) || '')).filter(Boolean).join(' ')
      : '';
    const prompt = promptArchitect.buildVeoVideoPrompt({
      topic: `${title} ${hook} ${sceneHints}`.trim(),
      title,
      hook,
      aspectRatio
    });

    console.log(`🎬 BẮT ĐẦU DỰNG VIDEO ROOM TOUR (FB REELS + IG REELS + THREADS): "${title}" (${dur}s)...`);

    let result = null;
    let initialQualityError = null;
    try {
      if (dryRun === true && Array.isArray(imagePaths) && imagePaths.length > 0) {
        const composed = await hyperframesFFmpeg.composeReel({
          imagePaths,
          outputPath: safeOutputPath,
          durationSec: dur,
          aspectRatio
        });
        result = {
          success: true,
          dryRun: true,
          engine: 'HYPERFRAMES_FFMPEG_DRY_RUN',
          source: 'HYPERFRAMES_FFMPEG_DRY_RUN',
          source_engine: 'HYPERFRAMES_FFMPEG_DRY_RUN',
          filePath: composed.filePath,
          file_path: composed.filePath,
          file_name: path.basename(composed.filePath),
          fileSizeBytes: composed.fileSizeBytes,
          size_bytes: composed.fileSizeBytes,
          durationSec: composed.durationSec,
          duration_seconds: composed.durationSec
        };
      } else {
        result = await veoEngine.createRealisticVideo({
          prompt,
          aspectRatio,
          duration: dur,
          mode,
          customName: safeFilename.replace(/\.mp4$/i, ''),
          dryRun,
          imagePaths
        });
      }
    } catch (err) {
      if (Array.isArray(imagePaths) && imagePaths.length > 0 && mode !== 'FLOW_WEB' && /quality gate/i.test(err.message)) {
        initialQualityError = err.message;
      } else {
        throw err;
      }
    }

    let filePath = (result && (result.filePath || result.file_path)) || safeOutputPath;
    let engine = (result && (result.engine || result.source_engine || result.source)) || 'HYPERFRAMES_FFMPEG';

    let quality = initialQualityError
      ? { passed: false, reason: initialQualityError, metrics: {} }
      : await hyperframesFFmpeg.validateMediaQuality(filePath, 'video');
    if (!quality.passed) {
      console.warn(`⚠️ Video output chưa đạt Media Quality Gate (${quality.reason}). Kết xuất lại qua HyperframesFFmpeg với khung hình kiến trúc sạch...`);
      const f1 = await imageEngine.generateImage({
        prompt,
        aspectRatio,
        mode: 'AUTO',
        customName: `hf_qgate_1_${Date.now()}`,
        dryRun: true
      });
      const f2 = await imageEngine.generateImage({
        prompt: `${prompt} natural daylight`,
        aspectRatio,
        mode: 'AUTO',
        customName: `hf_qgate_2_${Date.now() + 1}`,
        dryRun: true
      });
      const fallbackFrames = [f1.filePath || f1.file_path, f2.filePath || f2.file_path];
      const composed = await hyperframesFFmpeg.composeReel({
        imagePaths: fallbackFrames,
        outputPath: safeOutputPath,
        durationSec: dur,
        aspectRatio
      });
      filePath = composed.filePath;
      engine = 'HYPERFRAMES_FFMPEG_QUALITY_FALLBACK';
      result = null;
      quality = await hyperframesFFmpeg.validateMediaQuality(filePath, 'video');
      if (!quality.passed) {
        throw new Error(`Video quality gate failed after fallback recovery: ${quality.reason}`);
      }
    }

    let previewPath = (result && (result.previewPath || result.preview_snapshot || result.preview_path)) || null;
    if (!previewPath || !fs.existsSync(previewPath)) {
      const base = path.basename(filePath, path.extname(filePath));
      const targetPreview = assertInsideWorkspace(path.join(videosDir, `${base}_preview.png`), videosDir);
      assertInsideWorkspace(targetPreview);
      previewPath = await hyperframesFFmpeg.extractPreviewFrame(filePath, targetPreview);
    }

    const stats = fs.statSync(filePath);
    const finalSize = stats.size;
    const finalDuration = (quality.metrics && quality.metrics.durationSec) || result.durationSec || result.duration_seconds || dur;

    return {
      success: true,
      dryRun: Boolean(dryRun),
      filePath,
      file_path: filePath,
      file_name: path.basename(filePath),
      previewPath,
      preview_snapshot: previewPath,
      engine,
      source: engine,
      source_engine: engine,
      fileSizeBytes: finalSize,
      size_bytes: finalSize,
      durationSec: finalDuration,
      duration_seconds: finalDuration,
      aspectRatio,
      aspect_ratio: aspectRatio,
      title,
      hook,
      call_to_action: String(callToAction || ''),
      qualityPassed: Boolean(quality.passed),
      ready_for_publish: Boolean(quality.passed)
    };
  }

  async checkGoogleFlowSession() {
    return await googleFlowAgent.checkSession();
  }
}

module.exports = new VideoEngine();
