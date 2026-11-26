'use strict';

/**
 * MASTER VEO & GEMINI OMNI FLASH VIDEO ENGINE
 * Chỉ duy nhất tại D:\Facebook
 *
 * Động cơ sản xuất video Room Tour 9:16 chân thực cho Facebook Reels, Instagram Reels & Threads:
 * 1. Engine 1: Google Flow Web Automation (`flow.google.com` qua Playwright Persistent Profile 38).
 * 2. Engine 2: Google GenAI SDK (`gemini-omni-1.1-flash`) qua Interactions API chuẩn mới nhất.
 * 3. Engine 3: HyperframesFFmpeg Ken Burns Composer (`-14 LUFS`, `>= 300KB`).
 */

require('../lib/env-loader');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { GoogleGenAI } = require('@google/genai');
const googleFlowAgent = require('./google_flow_agent');
const imageEngine = require('./image_engine');
const hyperframesFFmpeg = require('./hyperframes_ffmpeg');
const { assertInsideWorkspace } = require('../lib/governance');

function getDataDir() {
  const raw = process.env.DATA_DIR;
  return (typeof raw === 'string' && raw.trim())
    ? path.resolve(raw.trim())
    : path.resolve(__dirname, '../data');
}

function validateOutputBasename(name, label = 'customName') {
  if (name === null || name === undefined) return null;
  const str = String(name);
  if (str.includes('\0') || /[\\/]/.test(str) || /^[a-zA-Z]:/.test(str)) {
    throw new Error(`Workspace isolation violation: ${label} must be a plain filename without path separators or drive prefixes.`);
  }
  return str;
}

function hasValidVideoContainerHeader(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 1024) return false;
  const isMp4Ftyp = buf.subarray(4, 8).toString('ascii') === 'ftyp';
  const isEbml = buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
  return isMp4Ftyp || isEbml;
}

function probeVideoStream(filePath) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
    const parsed = JSON.parse(out);
    const vStream = (parsed.streams || []).find(s => s.codec_type === 'video');
    if (vStream && vStream.width > 0 && vStream.height > 0) {
      return {
        width: Number(vStream.width),
        height: Number(vStream.height),
        durationSec: Number((vStream && vStream.duration) || (parsed.format && parsed.format.duration)) || 0
      };
    }
  } catch {
    // Caller handles null
  }
  return null;
}

class VeoVideoEngine {
  get outputDir() {
    return path.join(getDataDir(), 'videos');
  }

  extractVideoBase64FromInteraction(interaction) {
    if (!interaction || typeof interaction !== 'object') return null;
    let raw = null;

    if (interaction.output_video && typeof interaction.output_video.data === 'string') {
      raw = interaction.output_video.data;
    } else if (Array.isArray(interaction.steps)) {
      for (let i = interaction.steps.length - 1; i >= 0; i--) {
        const step = interaction.steps[i];
        if (step && step.type === 'model_output' && Array.isArray(step.content)) {
          for (const block of step.content) {
            if (block && block.type === 'video' && typeof block.data === 'string' && block.data.trim()) {
              raw = block.data;
              break;
            }
          }
        }
        if (raw) break;
      }
    }

    if (!raw || typeof raw !== 'string') return null;
    const cleaned = raw.replace(/^data:video\/[a-z0-9.+-]+;base64,/i, '').replace(/\s+/g, '').trim();
    return cleaned.length > 0 ? cleaned : null;
  }

  /**
   * Tạo video Room Tour bằng Google Flow / Veo / Gemini Omni 1.1 Flash / HyperframesFFmpeg
   */
  async createRealisticVideo({
    prompt,
    aspectRatio = process.env.VIDEO_DEFAULT_ASPECT_RATIO || '9:16',
    resolution = process.env.VIDEO_DEFAULT_RESOLUTION || '1080p',
    duration = parseInt(process.env.VIDEO_DEFAULT_DURATION_SECONDS || '8', 10),
    mode = 'AUTO',
    customName = null,
    dryRun = false,
    imagePaths = null
  } = {}) {
    const videosDir = this.outputDir;
    const dur = Math.max(1, Number(duration) || 8);
    const safeCustomName = validateOutputBasename(customName, 'customName');
    const rawFilename = safeCustomName ? `${safeCustomName.replace(/\.mp4$/i, '')}.mp4` : `reel_${Date.now()}.mp4`;
    const outputPath = assertInsideWorkspace(path.join(videosDir, rawFilename), videosDir);
    assertInsideWorkspace(outputPath);

    const flowBlocked =
      dryRun === true ||
      process.env.DRY_RUN === 'true' ||
      process.env.GOOGLE_FLOW_ENABLED === 'false';

    if (mode === 'FLOW_WEB' && flowBlocked) {
      throw new Error('Google Flow Web RPA is disabled (dryRun/DRY_RUN/GOOGLE_FLOW_ENABLED=false).');
    }

    console.log('\n================================================================');
    console.log('🌟 KHỞI ĐỘNG ĐỘNG CƠ VIDEO ROOM TOUR (GOOGLE FLOW / VEO / OMNI)');
    console.log('================================================================');
    console.log(`📌 Yêu cầu: "${String(prompt || '').slice(0, 120)}"`);
    console.log(`📱 Chế độ: ${mode} | Tỉ lệ: ${aspectRatio} | Độ phân giải: ${resolution} (${dur}s) | DryRun: ${Boolean(dryRun)}\n`);

    const apiKey = process.env.GEMINI_API_KEY;
    const videoModel = process.env.GEMINI_VIDEO_MODEL || 'gemini-omni-1.1-flash';
    const apiAllowed = dryRun !== true && Boolean(apiKey);

    // 1. Chế độ API: gọi trực tiếp Gemini Omni Flash qua Interactions API
    if (mode === 'API' && apiAllowed) {
      const apiRes = await this.tryGenerateViaOmniApi({
        prompt,
        aspectRatio,
        resolution,
        duration: dur,
        customName: path.basename(outputPath, '.mp4'),
        apiKey,
        videoModel
      });
      if (apiRes) return apiRes;
    }

    // 2. Chế độ FLOW_WEB hoặc AUTO (chỉ chạy khi không bị chặn bởi dryRun/DRY_RUN/GOOGLE_FLOW_ENABLED)
    if ((mode === 'FLOW_WEB' || mode === 'AUTO') && !flowBlocked) {
      try {
        console.log('🌐 [Engine 1] Kết nối Agent tới Google Flow PRO (flow.google.com)...');
        const webResult = await googleFlowAgent.generateVideo({
          prompt,
          aspectRatio,
          duration: dur,
          customName: path.basename(outputPath, '.mp4'),
          headless: process.env.PLAYWRIGHT_HEADLESS !== 'false'
        });

        const webPath = webResult && (webResult.filePath || webResult.file_path);
        if (webResult && webResult.success && webResult.source === 'GOOGLE_FLOW_VEO_PLAYWRIGHT' && webPath && fs.existsSync(webPath)) {
          const stats = fs.statSync(webPath);
          const dims = probeVideoStream(webPath) || hyperframesFFmpeg.getDimensions(aspectRatio);
          console.log('✨ Video Room Tour đã được kết xuất thành công từ Google Flow Veo!');
          return {
            ...webResult,
            dryRun: false,
            filePath: webPath,
            file_path: webPath,
            file_name: path.basename(webPath),
            fileSizeBytes: stats.size,
            size_bytes: stats.size,
            durationSec: dims.durationSec || dur,
            duration_seconds: dims.durationSec || dur,
            duration: dur,
            width: dims.width,
            height: dims.height,
            engine: webResult.source,
            source_engine: webResult.source
          };
        }

        if (mode === 'AUTO' && apiAllowed) {
          const apiRes = await this.tryGenerateViaOmniApi({
            prompt,
            aspectRatio,
            resolution,
            duration: dur,
            customName: path.basename(outputPath, '.mp4'),
            apiKey,
            videoModel
          });
          if (apiRes) return apiRes;
        }

        if (webResult && webResult.success && webPath && fs.existsSync(webPath)) {
          const stats = fs.statSync(webPath);
          const engine = webResult.source || 'GOOGLE_FLOW_HYBRID_CINEMATIC';
          return {
            ...webResult,
            dryRun: false,
            filePath: webPath,
            file_path: webPath,
            file_name: path.basename(webPath),
            fileSizeBytes: stats.size,
            size_bytes: stats.size,
            durationSec: dur,
            duration_seconds: dur,
            engine,
            source: engine,
            source_engine: engine
          };
        }
      } catch (err) {
        console.warn(`⚠️ Google Flow Web RPA gặp trở ngại (${err.message}). Chuyển sang Gemini Omni Flash API...`);
        if (mode === 'FLOW_WEB') throw err;
      }
    }

    // 3. Fallback qua Gemini Omni 1.1 Flash API (khi AUTO và Flow bị tắt hoặc skipped)
    if (mode === 'AUTO' && apiAllowed) {
      const apiRes = await this.tryGenerateViaOmniApi({
        prompt,
        aspectRatio,
        resolution,
        duration: dur,
        customName: path.basename(outputPath, '.mp4'),
        apiKey,
        videoModel
      });
      if (apiRes) return apiRes;
    }

    // 4. Dự phòng chuẩn Hyperframes FFmpeg (Ken Burns + -14 LUFS + >= 300KB)
    let frames = Array.isArray(imagePaths) && imagePaths.length > 0 ? imagePaths : null;
    if (!frames) {
      const f1 = await imageEngine.generateImage({
        prompt: prompt || 'Sunlit studio interior room with wooden floor',
        aspectRatio,
        mode: 'AUTO',
        customName: `hf_frame1_${Date.now()}`,
        dryRun: true
      });
      const f2 = await imageEngine.generateImage({
        prompt: `${prompt || 'Cozy studio room'} afternoon daylight window view`,
        aspectRatio,
        mode: 'AUTO',
        customName: `hf_frame2_${Date.now() + 1}`,
        dryRun: true
      });
      frames = [f1.filePath || f1.file_path, f2.filePath || f2.file_path];
    }

    const composed = await hyperframesFFmpeg.composeReel({
      imagePaths: frames,
      outputPath,
      durationSec: dur,
      aspectRatio
    });

    const fallbackEngine = dryRun === true ? 'HYPERFRAMES_FFMPEG_DRY_RUN' : 'HYPERFRAMES_FFMPEG_FALLBACK';
    return {
      success: true,
      dryRun: Boolean(dryRun),
      engine: fallbackEngine,
      source: fallbackEngine,
      source_engine: fallbackEngine,
      filePath: composed.filePath,
      file_path: composed.filePath,
      file_name: path.basename(composed.filePath),
      fileSizeBytes: composed.fileSizeBytes,
      size_bytes: composed.fileSizeBytes,
      durationSec: composed.durationSec,
      duration_seconds: composed.durationSec,
      duration: composed.durationSec,
      width: composed.width,
      height: composed.height,
      aspectRatio,
      aspect_ratio: aspectRatio,
      lufsNormalized: composed.lufsNormalized,
      ready_for_publish: true
    };
  }

  async tryGenerateViaOmniApi({ prompt, aspectRatio, resolution, duration, customName, apiKey, videoModel }) {
    let timeoutId = null;
    const videosDir = this.outputDir;
    const safeCustomName = validateOutputBasename(customName, 'customName');
    const rawFilename = safeCustomName ? `${safeCustomName.replace(/\.mp4$/i, '')}.mp4` : `veo_omni_${Date.now()}.mp4`;
    const outputPath = assertInsideWorkspace(path.join(videosDir, rawFilename), videosDir);
    assertInsideWorkspace(outputPath);

    try {
      console.log(`🚀 [Engine 2] Đang gọi Google GenAI Interactions API (${videoModel})...`);
      const client = new GoogleGenAI({ apiKey });

      const expandedPrompt = `Continuous unbroken handheld gimbal room tour shot of ${prompt}. Modern bright Vietnamese studio apartment, natural warm daylight streaming through large balcony glass doors, clean oak wooden floor, cozy bed, tidy kitchen corner, photorealistic architectural interior video, calm gentle acoustic background music. No dialogue.`;

      const durNum = Number(duration);
      const responseFormat = {
        type: 'video',
        aspect_ratio: aspectRatio,
        resolution
      };
      if (Number.isFinite(durNum) && durNum >= 3 && durNum <= 15) {
        responseFormat.duration = `${Math.round(durNum)}s`;
      }

      const interaction = await Promise.race([
        client.interactions.create({
          model: videoModel,
          input: expandedPrompt,
          response_format: responseFormat
        }),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Omni Video API timeout (120s)')), 120000);
        })
      ]);

      const b64Video = this.extractVideoBase64FromInteraction(interaction);
      if (b64Video) {
        let buf;
        try {
          buf = Buffer.from(b64Video, 'base64');
        } catch {
          return null;
        }

        if (!hasValidVideoContainerHeader(buf)) {
          console.warn(`   ⚠️ Video buffer từ ${videoModel} không đúng định dạng MP4/WebM hợp lệ.`);
          return null;
        }

        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(outputPath, buf);

        const probed = probeVideoStream(outputPath);
        if (!probed) {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          console.warn(`   ⚠️ File video từ ${videoModel} không giải mã được qua ffprobe.`);
          return null;
        }

        const stats = fs.statSync(outputPath);
        const engine = `GOOGLE_GENAI_${videoModel.toUpperCase()}`;
        const finalDur = probed.durationSec || durNum || 8;
        console.log(`✅ Đã kết xuất video thành công qua ${videoModel}: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`);
        return {
          success: true,
          dryRun: false,
          engine,
          source: engine,
          source_engine: engine,
          filePath: outputPath,
          file_path: outputPath,
          file_name: path.basename(outputPath),
          fileSizeBytes: stats.size,
          size_bytes: stats.size,
          durationSec: finalDur,
          duration_seconds: finalDur,
          duration: finalDur,
          width: probed.width,
          height: probed.height,
          aspectRatio,
          aspect_ratio: aspectRatio,
          interaction_id: interaction.id || null,
          ready_for_publish: true
        };
      }
    } catch (apiErr) {
      console.warn(`   ⚠️ Google GenAI Video API (${videoModel}) phản hồi: ${apiErr.message}`);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
    return null;
  }
}

module.exports = new VeoVideoEngine();
