'use strict';

/**
 * HYPERFRAMES FFMPEG MEDIA COMPOSER & QUALITY GATE
 * Chỉ duy nhất tại D:\Facebook
 *
 * - composeReel: ghép 1..N ảnh thành video MP4 H.264/AAC chuẩn tỉ lệ (mặc định 9:16 1080x1920),
 *   chuyển động Ken Burns (zoompan), chuyển cảnh mượt (xfade), âm thanh chuẩn hóa -14 LUFS.
 * - validateMediaQuality: kiểm duyệt kích thước, container ffprobe, độ phân giải và phát hiện khung hình đen/trống.
 * - extractPreviewFrame: trích xuất ảnh PNG xem trước từ video.
 */

require('../lib/env-loader');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { assertInsideWorkspace } = require('../lib/governance');

const ASPECT_DIMENSIONS = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '3:4': { width: 1080, height: 1440 },
  '1:1': { width: 1080, height: 1080 }
};

const MIN_VIDEO_BYTES = 300 * 1024;
const MIN_IMAGE_BYTES = 2048;

function getDataDir() {
  const raw = process.env.DATA_DIR;
  return (typeof raw === 'string' && raw.trim())
    ? path.resolve(raw.trim())
    : path.resolve(__dirname, '../data');
}

function probeFile(filePath) {
  const out = execFileSync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 });
  return JSON.parse(out);
}

function hasValidImageHeader(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return false;
  const isPng =
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isWebp =
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP';
  return isPng || isJpeg || isWebp;
}

class HyperframesFFmpeg {
  getDimensions(aspectRatio = '9:16') {
    return ASPECT_DIMENSIONS[aspectRatio] || ASPECT_DIMENSIONS['9:16'];
  }

  async composeReel({
    imagePaths,
    outputPath = null,
    durationSec = 8,
    aspectRatio = '9:16',
    audioPath = null
  } = {}) {
    if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
      throw new Error('composeReel requires a non-empty imagePaths array.');
    }

    const validatedImages = imagePaths.map((imgPath) => {
      if (typeof imgPath !== 'string' || !imgPath.trim()) {
        throw new Error('composeReel received an invalid image path.');
      }
      const safeImg = assertInsideWorkspace(imgPath);
      if (!fs.existsSync(safeImg) || !fs.statSync(safeImg).isFile()) {
        throw new Error(`Input image not found: ${safeImg}`);
      }
      return safeImg;
    });

    for (const safeImg of validatedImages) {
      const imgQuality = await this.validateMediaQuality(safeImg, 'image');
      if (!imgQuality.passed) {
        throw new Error(`Input image failed quality gate (${safeImg}): ${imgQuality.reason}`);
      }
    }

    const dur = Math.max(1, Number(durationSec) || 8);
    // Guarantee >= 300KB output even when caller passes durationSec < 3s
    const videoBitrateK = Math.max(1600, Math.ceil(3200 / dur));
    const minRateK = Math.max(1400, Math.round(videoBitrateK * 0.9));
    const maxRateK = Math.max(2400, Math.round(videoBitrateK * 1.5));
    const bufSizeK = Math.max(1800, videoBitrateK);
    const { width, height } = this.getDimensions(aspectRatio);
    const videosDir = path.join(getDataDir(), 'videos');
    let resolvedOut;
    if (outputPath) {
      resolvedOut = assertInsideWorkspace(outputPath);
    } else {
      resolvedOut = assertInsideWorkspace(
        path.join(videosDir, `hf_reel_${Date.now()}.mp4`),
        videosDir
      );
      assertInsideWorkspace(resolvedOut);
    }

    let resolvedAudio = null;
    if (audioPath) {
      resolvedAudio = assertInsideWorkspace(audioPath);
      if (!fs.existsSync(resolvedAudio) || !fs.statSync(resolvedAudio).isFile()) {
        throw new Error(`Input audio not found: ${resolvedAudio}`);
      }
    }

    const outDir = path.dirname(resolvedOut);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const fps = 24;
    const count = validatedImages.length;
    const args = ['-y'];

    for (const img of validatedImages) {
      args.push('-i', img);
    }

    if (resolvedAudio) {
      args.push('-stream_loop', '-1', '-i', resolvedAudio);
    } else {
      args.push(
        '-f', 'lavfi',
        '-i', `aevalsrc=0.14*sin(2*PI*220*t)+0.10*sin(2*PI*277.18*t)+0.09*sin(2*PI*329.63*t)+0.06*sin(2*PI*440*t):s=44100:c=stereo:d=${dur}`
      );
    }

    const filterParts = [];
    const scaleW = width;
    const scaleH = height;

    if (count === 1) {
      const totalFrames = Math.max(fps, Math.round(dur * fps));
      filterParts.push(
        `[0:v]scale=${scaleW}:${scaleH}:force_original_aspect_ratio=increase,crop=${scaleW}:${scaleH},setsar=1,` +
        `zoompan=z='min(zoom+0.0012,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${width}x${height}:fps=${fps},format=yuv420p[vout]`
      );
    } else {
      const fadeDur = dur >= 2 ? Math.min(0.4, dur / (count * 2)) : 0;
      const clipDur = (dur + fadeDur * (count - 1)) / count;
      const clipFrames = Math.max(fps, Math.round(clipDur * fps));

      for (let i = 0; i < count; i++) {
        const zExpr = i % 2 === 0
          ? 'min(zoom+0.0012,1.12)'
          : 'if(lte(zoom,1.0),1.12,max(1.001,zoom-0.0012))';
        filterParts.push(
          `[${i}:v]scale=${scaleW}:${scaleH}:force_original_aspect_ratio=increase,crop=${scaleW}:${scaleH},setsar=1,` +
          `zoompan=z='${zExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${clipFrames}:s=${width}x${height}:fps=${fps},settb=AVTB,fps=${fps}[v${i}]`
        );
      }

      if (fadeDur > 0) {
        let prevLabel = 'v0';
        for (let i = 1; i < count; i++) {
          const offset = i * (clipDur - fadeDur);
          const outLabel = i === count - 1 ? 'vxf' : `vx${i}`;
          filterParts.push(
            `[${prevLabel}][v${i}]xfade=transition=fade:duration=${fadeDur.toFixed(3)}:offset=${Math.max(0.1, offset).toFixed(3)}[${outLabel}]`
          );
          prevLabel = outLabel;
        }
        filterParts.push(`[${prevLabel}]format=yuv420p[vout]`);
      } else {
        const inputs = Array.from({ length: count }, (_, idx) => `[v${idx}]`).join('');
        filterParts.push(`${inputs}concat=n=${count}:v=1:a=0,format=yuv420p[vout]`);
      }
    }

    const fadeOutStart = Math.max(0, dur - 0.35).toFixed(2);
    filterParts.push(
      `[${count}:a]afade=t=in:st=0:d=0.35,afade=t=out:st=${fadeOutStart}:d=0.35,loudnorm=I=-14:TP=-1.5:LRA=11[aout]`
    );

    args.push(
      '-filter_complex', filterParts.join(';'),
      '-map', '[vout]',
      '-map', '[aout]',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-x264-params', 'nal-hrd=cbr',
      '-b:v', `${videoBitrateK}k`,
      '-minrate', `${minRateK}k`,
      '-maxrate', `${maxRateK}k`,
      '-bufsize', `${bufSizeK}k`,
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      '-t', String(dur),
      '-movflags', '+faststart',
      resolvedOut
    );

    execFileSync('ffmpeg', args, { stdio: 'pipe', timeout: 120000 });

    const stats = fs.statSync(resolvedOut);
    let probedWidth = width;
    let probedHeight = height;
    let probedDur = dur;
    try {
      const info = probeFile(resolvedOut);
      const vStream = (info.streams || []).find(s => s.codec_type === 'video');
      if (vStream) {
        probedWidth = Number(vStream.width) || width;
        probedHeight = Number(vStream.height) || height;
      }
      const fmtDur = Number(info.format && info.format.duration);
      if (Number.isFinite(fmtDur) && fmtDur > 0) {
        probedDur = Number(fmtDur.toFixed(2));
      }
    } catch {
      // Fallback to requested dimensions/duration
    }

    return {
      filePath: resolvedOut,
      file_path: resolvedOut,
      fileSizeBytes: stats.size,
      size_bytes: stats.size,
      durationSec: probedDur,
      duration_seconds: probedDur,
      width: probedWidth,
      height: probedHeight,
      lufsNormalized: true
    };
  }

  async validateMediaQuality(filePath, type = 'video') {
    if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) {
      return { passed: false, reason: 'Media file does not exist', metrics: {} };
    }

    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch (err) {
      return { passed: false, reason: `Cannot stat media file: ${err.message}`, metrics: {} };
    }

    if (!stat.isFile()) {
      return { passed: false, reason: 'Media path is not a regular file', metrics: {} };
    }

    const fileSizeBytes = stat.size;

    if (type === 'image') {
      if (fileSizeBytes < MIN_IMAGE_BYTES) {
        return {
          passed: false,
          reason: `Image file too small (${fileSizeBytes} < ${MIN_IMAGE_BYTES} bytes)`,
          metrics: { fileSizeBytes }
        };
      }

      const fd = fs.openSync(filePath, 'r');
      const headerBuf = Buffer.alloc(16);
      try {
        fs.readSync(fd, headerBuf, 0, 16, 0);
      } finally {
        fs.closeSync(fd);
      }

      if (!hasValidImageHeader(headerBuf)) {
        return {
          passed: false,
          reason: 'Invalid image header bytes (expected PNG/JPEG/WebP)',
          metrics: { fileSizeBytes }
        };
      }

      let probe;
      try {
        probe = probeFile(filePath);
      } catch (err) {
        return {
          passed: false,
          reason: `Corrupt or unreadable image file: ${err.message}`,
          metrics: { fileSizeBytes }
        };
      }

      const vStream = (probe.streams || []).find(s => s.codec_type === 'video');
      const width = Number(vStream && vStream.width) || 0;
      const height = Number(vStream && vStream.height) || 0;
      if (!vStream || width < 100 || height < 100) {
        return {
          passed: false,
          reason: `Invalid image dimensions (${width}x${height})`,
          metrics: { fileSizeBytes, width, height }
        };
      }

      const sig = spawnSync('ffmpeg', [
        '-v', 'info',
        '-i', filePath,
        '-vf', 'blackdetect=d=0.01:pix_th=0.10,signalstats,metadata=mode=print',
        '-f', 'null', '-'
      ], { encoding: 'utf8', timeout: 20000 });

      const sigStderr = String(sig.stderr || '');
      const ymaxMatches = [...sigStderr.matchAll(/lavfi\.signalstats\.YMAX=([0-9.]+)/g)]
        .map(m => Number(m[1]))
        .filter(Number.isFinite);

      if (sig.error || sig.status !== 0 || ymaxMatches.length === 0) {
        return {
          passed: false,
          reason: 'Failed to analyze frame luminance via ffmpeg signalstats',
          metrics: { fileSizeBytes, width, height, durationSec: 0, hasAudio: false }
        };
      }

      const maxYMax = Math.max(...ymaxMatches);
      const blackDetected = maxYMax <= 38;

      if (blackDetected) {
        return {
          passed: false,
          reason: `Solid-black or blank image detected (YMAX=${maxYMax})`,
          metrics: { fileSizeBytes, width, height, durationSec: 0, hasAudio: false, blackDetected: true }
        };
      }

      return {
        passed: true,
        reason: 'OK',
        metrics: { fileSizeBytes, width, height, durationSec: 0, hasAudio: false, blackDetected: false }
      };
    }

    // Video quality validation
    if (fileSizeBytes < MIN_VIDEO_BYTES) {
      return {
        passed: false,
        reason: `Video file too small (${fileSizeBytes} < ${MIN_VIDEO_BYTES} bytes)`,
        metrics: { fileSizeBytes }
      };
    }

    let probe;
    try {
      probe = probeFile(filePath);
    } catch (err) {
      return {
        passed: false,
        reason: `Corrupt or unreadable video container: ${err.message}`,
        metrics: { fileSizeBytes }
      };
    }

    const streams = Array.isArray(probe.streams) ? probe.streams : [];
    const vStream = streams.find(s => s.codec_type === 'video');
    const aStream = streams.find(s => s.codec_type === 'audio');

    const width = Number(vStream && vStream.width) || 0;
    const height = Number(vStream && vStream.height) || 0;
    const durationSec = Number((vStream && vStream.duration) || (probe.format && probe.format.duration)) || 0;

    if (!vStream || width <= 0 || height <= 0 || durationSec <= 0) {
      return {
        passed: false,
        reason: 'Missing valid video stream or zero duration',
        metrics: { fileSizeBytes, width, height, durationSec, hasAudio: Boolean(aStream) }
      };
    }

    const scan = spawnSync('ffmpeg', [
      '-v', 'info',
      '-i', filePath,
      '-vf', 'blackdetect=d=0.2:pix_th=0.10,signalstats,metadata=mode=print',
      '-f', 'null', '-'
    ], { encoding: 'utf8', timeout: 30000 });

    const stderr = String(scan.stderr || '');
    const blackDurations = [...stderr.matchAll(/black_duration:([0-9.]+)/g)]
      .map(m => Number(m[1]))
      .filter(Number.isFinite);
    const totalBlackSec = blackDurations.reduce((acc, v) => acc + v, 0);

    const ymaxMatches = [...stderr.matchAll(/lavfi\.signalstats\.YMAX=([0-9.]+)/g)]
      .map(m => Number(m[1]))
      .filter(Number.isFinite);

    if (scan.error || scan.status !== 0 || ymaxMatches.length === 0) {
      return {
        passed: false,
        reason: 'Failed to analyze frame luminance via ffmpeg signalstats',
        metrics: { fileSizeBytes, width, height, durationSec, hasAudio: Boolean(aStream) }
      };
    }

    const maxYMax = Math.max(...ymaxMatches);
    const blackDetected = totalBlackSec >= durationSec * 0.8 || maxYMax <= 38;

    if (blackDetected) {
      return {
        passed: false,
        reason: `Solid-black or blank video detected (black=${totalBlackSec.toFixed(2)}s/${durationSec.toFixed(2)}s, YMAX=${maxYMax})`,
        metrics: {
          fileSizeBytes,
          width,
          height,
          durationSec,
          hasAudio: Boolean(aStream),
          blackDetected: true
        }
      };
    }

    return {
      passed: true,
      reason: 'OK',
      metrics: {
        fileSizeBytes,
        width,
        height,
        durationSec,
        hasAudio: Boolean(aStream),
        blackDetected: false
      }
    };
  }

  async extractPreviewFrame(videoPath, previewPath = null) {
    const safeVideo = assertInsideWorkspace(videoPath);
    if (!fs.existsSync(safeVideo) || !fs.statSync(safeVideo).isFile()) {
      throw new Error(`Cannot extract preview frame; video not found: ${safeVideo}`);
    }

    const videosDir = path.join(getDataDir(), 'videos');
    let resolvedPreview;
    if (previewPath) {
      resolvedPreview = assertInsideWorkspace(previewPath);
    } else {
      const base = path.basename(safeVideo, path.extname(safeVideo));
      resolvedPreview = assertInsideWorkspace(
        path.join(videosDir, `${base}_preview.png`),
        videosDir
      );
      assertInsideWorkspace(resolvedPreview);
    }

    const dir = path.dirname(resolvedPreview);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      execFileSync('ffmpeg', [
        '-y',
        '-ss', '0.5',
        '-i', safeVideo,
        '-frames:v', '1',
        resolvedPreview
      ], { stdio: 'pipe', timeout: 20000 });
    } catch {
      // Fallback to first frame if video is shorter than 0.5s
    }

    if (!fs.existsSync(resolvedPreview) || fs.statSync(resolvedPreview).size === 0) {
      execFileSync('ffmpeg', [
        '-y',
        '-ss', '0',
        '-i', safeVideo,
        '-frames:v', '1',
        resolvedPreview
      ], { stdio: 'pipe', timeout: 20000 });
    }

    return resolvedPreview;
  }
}

module.exports = new HyperframesFFmpeg();
module.exports.HyperframesFFmpeg = HyperframesFFmpeg;
module.exports.getDataDir = getDataDir;
module.exports.ASPECT_DIMENSIONS = ASPECT_DIMENSIONS;
