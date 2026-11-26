'use strict';

/**
 * MASTER AUTONOMOUS AI IMAGE ENGINE (GOOGLE FLOW PRO + NANO BANANA 2.1 + CLEAN FALLBACK)
 * Chỉ duy nhất tại D:\Facebook
 *
 * Động cơ tạo ảnh bất động sản & nội thất phòng cho thuê tự động 100%:
 * 1. Engine 1 (RPA PRO): Google Flow PRO Image Studio (`flow.google.com` qua Playwright Persistent Profile 38).
 * 2. Engine 2 (API): Google GenAI SDK (`gemini-nano-banana-2.1` & `gemini-3-pro-image`) qua Interactions API.
 * 3. Engine 3 (Fallback): Clean Architectural FFmpeg PNG Renderer (không chữ, không logo, chuẩn tỉ lệ).
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { GoogleGenAI } = require('@google/genai');
const googleFlowAgent = require('./google_flow_agent');
const promptArchitect = require('./prompt_architect');
const { assertInsideWorkspace } = require('../lib/governance');

const ASPECT_DIMENSIONS = {
  '1:1': { width: 1080, height: 1080 },
  '3:4': { width: 1080, height: 1440 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 }
};

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

function detectImageFormat(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'png';
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpeg';
  }
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

function probeImageDimensions(filePath) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      filePath
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
    const parsed = JSON.parse(out);
    const vStream = (parsed.streams || []).find(s => s.codec_type === 'video');
    if (vStream && vStream.width > 0 && vStream.height > 0) {
      return { width: Number(vStream.width), height: Number(vStream.height) };
    }
  } catch {
    // Caller checks null return
  }
  return null;
}

class ImageEngine {
  get outputDir() {
    return path.join(getDataDir(), 'images');
  }

  getDimensions(aspectRatio = '3:4') {
    return ASPECT_DIMENSIONS[aspectRatio] || ASPECT_DIMENSIONS['3:4'];
  }

  extractBase64FromInteraction(interaction) {
    if (!interaction || typeof interaction !== 'object') return null;
    let raw = null;

    if (interaction.output_image && typeof interaction.output_image.data === 'string') {
      raw = interaction.output_image.data;
    } else if (Array.isArray(interaction.steps)) {
      for (let i = interaction.steps.length - 1; i >= 0; i--) {
        const step = interaction.steps[i];
        if (step && step.type === 'model_output' && Array.isArray(step.content)) {
          for (const block of step.content) {
            if (block && block.type === 'image' && typeof block.data === 'string' && block.data.trim()) {
              raw = block.data;
              break;
            }
          }
        }
        if (raw) break;
      }
    }

    if (!raw || typeof raw !== 'string') return null;
    const cleaned = raw.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').replace(/\s+/g, '').trim();
    return cleaned.length > 0 ? cleaned : null;
  }

  _writeValidatedApiImage(b64, outputPath) {
    let buf;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch {
      return null;
    }

    if (!Buffer.isBuffer(buf) || buf.length < 64) {
      return null;
    }

    const fmt = detectImageFormat(buf);
    if (!fmt) {
      return null;
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fmt === 'png') {
      fs.writeFileSync(outputPath, buf);
    } else {
      const tmpInput = `${outputPath}.raw.${fmt}`;
      try {
        fs.writeFileSync(tmpInput, buf);
        execFileSync('ffmpeg', ['-y', '-i', tmpInput, outputPath], { stdio: 'pipe', timeout: 20000 });
      } catch {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        return null;
      } finally {
        if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
      }
    }

    const dims = probeImageDimensions(outputPath);
    if (!dims) {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      return null;
    }
    return dims;
  }

  async renderCleanArchitecturalFallback({ outputPath, aspectRatio = '3:4' }) {
    const dims = this.getDimensions(aspectRatio);
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const winX = Math.round(dims.width * 0.11);
    const winY = Math.round(dims.height * 0.10);
    const winW = Math.round(dims.width * 0.78);
    const winH = Math.round(dims.height * 0.56);
    const mullionX = Math.round(dims.width * 0.50);
    const floorY = Math.round(dims.height * 0.73);
    const floorH = dims.height - floorY;

    const vf = [
      `drawbox=x=${winX}:y=${winY}:w=${winW}:h=${winH}:color=white@0.22:t=fill`,
      `drawbox=x=${winX}:y=${winY}:w=${winW}:h=${winH}:color=0xFFFFFF@0.42:t=4`,
      `drawbox=x=${mullionX - 2}:y=${winY}:w=4:h=${winH}:color=0xFFFFFF@0.35:t=fill`,
      `drawbox=x=0:y=${floorY}:w=${dims.width}:h=${floorH}:color=0x8B6F4E@0.26:t=fill`
    ].join(',');

    execFileSync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', `gradients=s=${dims.width}x${dims.height}:n=3:c0=0xF5EFE6:c1=0xDFCBB2:c2=0x9AA9B8:r=1:d=1`,
      '-vf', vf,
      '-frames:v', '1',
      outputPath
    ], { stdio: 'pipe', timeout: 25000 });

    return dims;
  }

  async generateImage({
    prompt,
    visualPrompt = null,
    title = 'Góc phòng sáng thoáng',
    subtitle = null,
    aspectRatio = process.env.IMAGE_DEFAULT_ASPECT_RATIO || '3:4',
    imageSize = process.env.IMAGE_DEFAULT_SIZE || '2K',
    mode = 'AUTO',
    customName = null,
    dryRun = false
  } = {}) {
    const timestamp = Date.now();
    const imagesDir = this.outputDir;
    const safeCustomName = validateOutputBasename(customName, 'customName');
    const rawName = safeCustomName ? `${safeCustomName.replace(/\.png$/i, '')}.png` : `room_img_${timestamp}.png`;
    const outputPath = assertInsideWorkspace(path.join(imagesDir, rawName), imagesDir);
    assertInsideWorkspace(outputPath);
    const finalFilename = path.basename(outputPath);

    const effectivePrompt = prompt || visualPrompt || title || 'Sunlit clean rental studio room interior';
    const promptObj = promptArchitect.buildArchitecturalPrompt({
      prompt: effectivePrompt,
      title,
      aspectRatio
    });
    const architecturalPrompt = promptObj.prompt;

    const flowBlocked =
      dryRun === true ||
      process.env.DRY_RUN === 'true' ||
      process.env.GOOGLE_FLOW_ENABLED === 'false';

    if (mode === 'FLOW_WEB' && flowBlocked) {
      throw new Error('Google Flow Web RPA is disabled (dryRun/DRY_RUN/GOOGLE_FLOW_ENABLED=false).');
    }

    console.log('\n================================================================');
    console.log('🖼️ KHỞI ĐỘNG HỆ THỐNG TẠO ẢNH AI (GOOGLE FLOW + NANO BANANA)');
    console.log('================================================================');
    console.log(`📌 Chủ đề: "${String(effectivePrompt).slice(0, 120)}..."`);
    console.log(`🏛️ Bối cảnh kiến trúc: ${promptObj.archetypeName} [${promptObj.archetypeId}]`);
    console.log(`📐 Tỉ lệ: ${aspectRatio} | Độ phân giải: ${imageSize} | Chế độ: ${mode} | DryRun: ${Boolean(dryRun)}`);

    // 1. Động cơ 1: Google Flow Image Studio (chỉ chạy khi không bị chặn bởi dryRun/DRY_RUN/GOOGLE_FLOW_ENABLED)
    if ((mode === 'FLOW_WEB' || mode === 'AUTO') && !flowBlocked) {
      try {
        console.log('🌐 [Engine 1] Đang tạo ảnh 4K trực tiếp trên Google Flow PRO Studio (flow.google.com)...');
        const flowResult = await googleFlowAgent.generateImage({
          prompt: architecturalPrompt,
          aspectRatio,
          customName: finalFilename.replace(/\.png$/i, ''),
          headless: process.env.PLAYWRIGHT_HEADLESS !== 'false'
        });
        const flowPath = flowResult && (flowResult.filePath || flowResult.file_path);
        if (flowResult && flowResult.success && flowPath && fs.existsSync(flowPath)) {
          const stats = fs.statSync(flowPath);
          const dims = probeImageDimensions(flowPath) || this.getDimensions(aspectRatio);
          const engine = flowResult.engine || flowResult.source || 'GOOGLE_FLOW_IMAGE_PLAYWRIGHT';
          console.log(`✅ Đã kết xuất ảnh AI 4K thành công từ Google Flow PRO: ${flowPath}`);
          return {
            ...flowResult,
            success: true,
            dryRun: false,
            filePath: flowPath,
            file_path: flowPath,
            file_name: path.basename(flowPath),
            engine,
            source: engine,
            width: dims.width,
            height: dims.height,
            fileSizeBytes: stats.size,
            size_bytes: stats.size,
            aspectRatio,
            aspect_ratio: aspectRatio,
            spaceArchetype: promptObj.archetypeId,
            spaceArchetypeName: promptObj.archetypeName,
            ready_for_publish: true
          };
        }
      } catch (err) {
        console.warn(`   ⚠️ Google Flow Image Studio phản hồi (${err.message}). Chuyển sang Nano Banana API...`);
        if (mode === 'FLOW_WEB') throw err;
      }
    }

    // 2. Động cơ 2: Google GenAI Nano Banana 2.1 / Nano Banana Pro qua Interactions API
    const apiKey = process.env.GEMINI_API_KEY;
    if (dryRun !== true && (mode === 'AUTO' || mode === 'API') && apiKey) {
      const models = [
        process.env.GEMINI_IMAGE_MODEL || 'gemini-nano-banana-2.1',
        process.env.GEMINI_IMAGE_PRO_MODEL || 'gemini-3-pro-image'
      ];

      for (const model of models) {
        let timeoutId = null;
        try {
          const client = new GoogleGenAI({ apiKey });
          console.log(`🚀 [Engine 2] Đang tạo ảnh 4K với mô hình Google ${model}...`);
          const interaction = await Promise.race([
            client.interactions.create({
              model,
              input: architecturalPrompt,
              response_format: {
                type: 'image',
                aspect_ratio: aspectRatio,
                image_size: imageSize
              }
            }),
            new Promise((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error('Image API timeout (45s)')), 45000);
            })
          ]);

          const b64 = this.extractBase64FromInteraction(interaction);
          if (b64) {
            const dims = this._writeValidatedApiImage(b64, outputPath);
            if (dims) {
              const stats = fs.statSync(outputPath);
              const engine = `GOOGLE_GENAI_${model.toUpperCase()}`;
              console.log(`✅ Đã kết xuất ảnh AI thành công qua ${model}: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`);
              return {
                success: true,
                dryRun: false,
                filePath: outputPath,
                file_path: outputPath,
                file_name: finalFilename,
                engine,
                source: engine,
                width: dims.width,
                height: dims.height,
                fileSizeBytes: stats.size,
                size_bytes: stats.size,
                aspectRatio,
                aspect_ratio: aspectRatio,
                spaceArchetype: promptObj.archetypeId,
                spaceArchetypeName: promptObj.archetypeName,
                ready_for_publish: true
              };
            }
            console.warn(`   ⚠️ Dữ liệu ảnh từ ${model} không hợp lệ hoặc bị hỏng, chuyển sang phương án dự phòng.`);
          }
        } catch (err) {
          console.warn(`   ⚠️ Mô hình ${model} phản hồi: ${err.message}`);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }
    }

    // 3. Động cơ 3: Clean Unbranded Architectural FFmpeg PNG Fallback (tạo ảnh nội thất tối giản sạch sẽ)
    const fallbackEngine = dryRun === true ? 'DRY_RUN_ARCHITECTURAL_PNG' : 'FFMPEG_ARCHITECTURAL_FALLBACK';
    console.log(`🎨 [Engine 3] Đang kết xuất ảnh kiến trúc sạch không chữ (${fallbackEngine})...`);
    const dims = await this.renderCleanArchitecturalFallback({ outputPath, aspectRatio });
    const stats = fs.statSync(outputPath);
    console.log(`✅ Đã tạo ảnh kiến trúc sạch: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`);

    return {
      success: true,
      dryRun: Boolean(dryRun),
      filePath: outputPath,
      file_path: outputPath,
      file_name: finalFilename,
      engine: fallbackEngine,
      source: fallbackEngine,
      width: dims.width,
      height: dims.height,
      fileSizeBytes: stats.size,
      size_bytes: stats.size,
      aspectRatio,
      aspect_ratio: aspectRatio,
      spaceArchetype: promptObj.archetypeId,
      spaceArchetypeName: promptObj.archetypeName,
      ready_for_publish: true
    };
  }
}

module.exports = new ImageEngine();
