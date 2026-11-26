'use strict';

const fs = require('fs');
const path = require('path');


const DEFAULT_ENV_PATH = path.resolve(__dirname, '../.env');

function loadEnv(envPath = DEFAULT_ENV_PATH, options = {}) {
  const targetPath = envPath;
  if (typeof targetPath !== 'string' || !targetPath.trim() || !fs.existsSync(targetPath)) {
    return { loaded: false, envPath: targetPath, appliedKeys: [] };
  }

  const override = Boolean(options && options.override === true);
  const content = fs.readFileSync(targetPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/);
  const appliedKeys = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    let key = trimmed.slice(0, eqIdx).trim();
    if (/^export\s+/.test(key)) {
      key = key.replace(/^export\s+/, '').trim();
    }
    if (!key) continue;

    let val = trimmed.slice(eqIdx + 1).trim();
    const quoteChar = (val.startsWith('"') || val.startsWith("'")) ? val[0] : null;
    let parsedQuoted = false;
    if (quoteChar) {
      let closeIdx = -1;
      for (let i = 1; i < val.length; i++) {
        if (quoteChar === '"' && val[i] === '\\' && i + 1 < val.length) {
          i++;
          continue;
        }
        if (val[i] === quoteChar) {
          closeIdx = i;
          break;
        }
      }
      if (closeIdx !== -1) {
        const trailing = val.slice(closeIdx + 1).trim();
        if (trailing === '' || trailing.startsWith('#')) {
          val = val.slice(1, closeIdx);
          parsedQuoted = true;
        }
      }
    }
    if (!parsedQuoted) {
      val = val.replace(/(?:^|\s+)#.*$/, '').trim();
    }

    if (override || process.env[key] === undefined) {
      process.env[key] = val;
      appliedKeys.push(key);
    }
  }

  return { loaded: true, envPath: targetPath, appliedKeys };
}

loadEnv();

module.exports = { loadEnv, DEFAULT_ENV_PATH };
