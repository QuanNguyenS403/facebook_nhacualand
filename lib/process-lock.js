'use strict';

/**
 * SINGLETON PROCESS LOCK FOR NHÀ CỦA LAND (D:\Facebook)
 * Ngăn tuyệt đối việc 2 tiến trình (ví dụ Windows Task Scheduler chạy trùng)
 * cùng mở Persistent Chrome Profile 38 gây xung đột và treo trình duyệt.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_LOCK_FILE = path.resolve(__dirname, '../data/orchestrator.lock');
const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000; // 30 phút (khớp Task Scheduler PT30M)
const MAX_ATTEMPTS = 5;
const FUTURE_SKEW_TOLERANCE_MS = 5000;
const RECOVERY_GUARD_MAX_AGE_MS = 10000;

function getDefaultDataDir() {
  const raw = process.env.DATA_DIR;
  return (typeof raw === 'string' && raw.trim())
    ? path.resolve(raw.trim())
    : path.resolve(__dirname, '../data');
}

function getDefaultLockFile() {
  return path.join(getDefaultDataDir(), 'orchestrator.lock');
}

function noopRelease() {
  return { released: false, reason: 'NOT_OWNER' };
}

function isPidAlive(pid) {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === 'EPERM');
  }
}

function generateLockToken() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${process.pid}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

function readLockMetadata(lockFile) {
  try {
    const raw = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    return {
      holderPid: Number(raw && raw.pid) || null,
      startedAt: (raw && typeof raw.startedAt === 'string') ? raw.startedAt : null
    };
  } catch {
    return { holderPid: null, startedAt: null };
  }
}

function inspectLockRecord(rawStr, maxAgeMs) {
  let raw = null;
  try {
    raw = JSON.parse(rawStr);
  } catch {
    return { status: 'CORRUPT', holderPid: null, startedAt: null, token: null };
  }

  if (!raw || typeof raw !== 'object') {
    return { status: 'CORRUPT', holderPid: null, startedAt: null, token: null };
  }

  const holderPid = Number(raw.pid);
  const startedAt = (typeof raw.startedAt === 'string' && raw.startedAt.trim()) ? raw.startedAt : null;
  const startedMs = startedAt ? Date.parse(startedAt) : NaN;
  const ageMs = Number.isFinite(startedMs) ? (Date.now() - startedMs) : NaN;
  const isValidPid = Number.isInteger(holderPid) && holderPid > 0;
  const isFresh = Number.isFinite(ageMs) && ageMs >= -FUTURE_SKEW_TOLERANCE_MS && ageMs < maxAgeMs;

  if (isValidPid && isFresh && isPidAlive(holderPid)) {
    return {
      status: 'LIVE',
      holderPid,
      startedAt,
      token: typeof raw.token === 'string' ? raw.token : null
    };
  }

  return {
    status: 'STALE',
    holderPid: isValidPid ? holderPid : null,
    startedAt,
    token: typeof raw.token === 'string' ? raw.token : null
  };
}

function acquireRecoveryGuard(guardFile) {
  for (let guardAttempt = 0; guardAttempt < 2; guardAttempt++) {
    const guardToken = generateLockToken();
    const guardPayload = JSON.stringify({
      pid: process.pid,
      token: guardToken,
      startedAt: new Date().toISOString()
    }, null, 2);

    try {
      fs.writeFileSync(guardFile, guardPayload, { flag: 'wx', encoding: 'utf8' });
      return { acquired: true, guardToken };
    } catch (err) {
      if (!err || err.code !== 'EEXIST') {
        throw err;
      }

      let existingGuardRaw;
      try {
        existingGuardRaw = fs.readFileSync(guardFile, 'utf8');
      } catch (readErr) {
        if (readErr && readErr.code === 'ENOENT') {
          continue;
        }
        throw readErr;
      }

      const guardState = inspectLockRecord(existingGuardRaw, RECOVERY_GUARD_MAX_AGE_MS);
      if (guardState.status === 'LIVE') {
        return { acquired: false, reason: 'RECOVERY_IN_PROGRESS' };
      }

      const staleGuardPath = `${guardFile}.stale.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}`;
      try {
        fs.renameSync(guardFile, staleGuardPath);
        try {
          fs.unlinkSync(staleGuardPath);
        } catch (unlinkErr) {
          if (unlinkErr && unlinkErr.code !== 'ENOENT') {
            console.warn(`[process-lock] Failed to unlink stale guard "${staleGuardPath}": ${unlinkErr.message}`);
          }
        }
      } catch (renameErr) {
        if (renameErr && renameErr.code !== 'ENOENT') {
          if (renameErr.code === 'EPERM' || renameErr.code === 'EACCES') {
            try {
              fs.unlinkSync(guardFile);
            } catch {
              // ignore
            }
          } else {
            return { acquired: false, reason: 'RECOVERY_IN_PROGRESS' };
          }
        }
      }
    }
  }
  return { acquired: false, reason: 'RECOVERY_IN_PROGRESS' };
}

function releaseRecoveryGuard(guardFile, guardToken) {
  try {
    const rawStr = fs.readFileSync(guardFile, 'utf8');
    const parsed = JSON.parse(rawStr);
    if (parsed && Number(parsed.pid) === process.pid && parsed.token === guardToken) {
      fs.unlinkSync(guardFile);
    }
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.warn(`[process-lock] Failed to clean recovery guard "${guardFile}": ${err.message}`);
    }
  }
}

function recoverStaleLock(lockFile, attempt, { maxAgeMs = DEFAULT_MAX_AGE_MS, expectedRawStr = null } = {}) {
  const guardFile = `${lockFile}.recovering`;
  const guard = acquireRecoveryGuard(guardFile);
  if (!guard.acquired) {
    return { recovered: false, reason: guard.reason || 'RECOVERY_IN_PROGRESS' };
  }

  try {
    let currentRawStr;
    try {
      currentRawStr = fs.readFileSync(lockFile, 'utf8');
    } catch (readErr) {
      if (readErr && readErr.code === 'ENOENT') {
        return { recovered: false, reason: 'ALREADY_ABSENT' };
      }
      throw readErr;
    }

    const currentState = inspectLockRecord(currentRawStr, maxAgeMs);
    if (currentState.status === 'LIVE') {
      return { recovered: false, reason: 'PREEMPTED_BY_LIVE_LOCK' };
    }
    if (expectedRawStr !== null && currentRawStr !== expectedRawStr) {
      return { recovered: false, reason: 'LOCK_CHANGED' };
    }

    const stalePath = `${lockFile}.stale.${process.pid}.${attempt}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}`;
    try {
      fs.renameSync(lockFile, stalePath);
      try {
        fs.unlinkSync(stalePath);
      } catch (unlinkErr) {
        if (unlinkErr && unlinkErr.code !== 'ENOENT') {
          console.warn(`[process-lock] Failed to unlink stale temp lock "${stalePath}": ${unlinkErr.message}`);
        }
      }
      return { recovered: true, reason: 'RECOVERED' };
    } catch (renameErr) {
      if (renameErr && renameErr.code === 'ENOENT') {
        return { recovered: false, reason: 'ALREADY_ABSENT' };
      }
      if (renameErr && (renameErr.code === 'EPERM' || renameErr.code === 'EACCES')) {
        try {
          const recheckRaw = fs.readFileSync(lockFile, 'utf8');
          if (inspectLockRecord(recheckRaw, maxAgeMs).status === 'LIVE') {
            return { recovered: false, reason: 'PREEMPTED_BY_LIVE_LOCK' };
          }
          if (expectedRawStr !== null && recheckRaw !== expectedRawStr) {
            return { recovered: false, reason: 'LOCK_CHANGED' };
          }
          fs.unlinkSync(lockFile);
          return { recovered: true, reason: 'RECOVERED_UNLINK' };
        } catch (unlinkErr) {
          if (unlinkErr && unlinkErr.code !== 'ENOENT') {
            console.warn(`[process-lock] Failed to unlink stale lock "${lockFile}": ${unlinkErr.message}`);
          }
          return { recovered: false, reason: 'UNLINK_FAILED' };
        }
      }
      throw renameErr;
    }
  } finally {
    releaseRecoveryGuard(guardFile, guard.guardToken);
  }
}

function acquireProcessLock({
  lockFile,
  maxAgeMs = DEFAULT_MAX_AGE_MS
} = {}) {
  if (typeof maxAgeMs !== 'number' || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    throw new TypeError('maxAgeMs must be a positive finite number.');
  }
  if (lockFile !== undefined && lockFile !== null && (typeof lockFile !== 'string' || !lockFile.trim())) {
    throw new TypeError('lockFile must be a non-empty string.');
  }

  const resolvedLockFile = (typeof lockFile === 'string' && lockFile.trim())
    ? lockFile
    : getDefaultLockFile();

  const dir = path.dirname(resolvedLockFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const token = generateLockToken();
    const startedAt = new Date().toISOString();
    const payload = JSON.stringify({
      pid: process.pid,
      token,
      startedAt
    }, null, 2);

    try {
      fs.writeFileSync(resolvedLockFile, payload, { flag: 'wx', encoding: 'utf8' });

      let released = false;
      let onExit = null;
      let onSigInt = null;
      let onSigTerm = null;

      const detachListeners = () => {
        if (onExit) process.removeListener('exit', onExit);
        if (onSigInt) process.removeListener('SIGINT', onSigInt);
        if (onSigTerm) process.removeListener('SIGTERM', onSigTerm);
      };

      const release = ({ fromSignal = null } = {}) => {
        detachListeners();
        if (released) {
          return { released: true, reason: 'ALREADY_RELEASED', alreadyReleased: true };
        }
        released = true;

        try {
          const rawStr = fs.readFileSync(resolvedLockFile, 'utf8');
          let cur;
          try {
            cur = JSON.parse(rawStr);
          } catch {
            return { released: false, reason: 'CORRUPT_LOCK_NOT_REMOVED' };
          }

          const curPid = Number(cur && cur.pid);
          const curToken = cur && cur.token;
          if (curPid !== process.pid || curToken !== token) {
            return {
              released: false,
              reason: 'OWNED_BY_OTHER',
              holderPid: Number.isInteger(curPid) ? curPid : null
            };
          }

          fs.unlinkSync(resolvedLockFile);
          return { released: true, reason: 'RELEASED' };
        } catch (err) {
          if (err && err.code === 'ENOENT') {
            return { released: true, reason: 'ALREADY_ABSENT' };
          }
          if (fromSignal !== 'exit') {
            console.warn(`[process-lock] Failed to release lock "${resolvedLockFile}": ${err.message}`);
          }
          return { released: false, reason: (err && err.code) || 'ERROR', error: err };
        }
      };

      const handleSignal = (signal, exitCode) => {
        release({ fromSignal: signal });
        if (process.listenerCount(signal) === 0) {
          process.exit(exitCode);
        }
      };

      onExit = () => release({ fromSignal: 'exit' });
      onSigInt = () => handleSignal('SIGINT', 130);
      onSigTerm = () => handleSignal('SIGTERM', 143);

      process.once('exit', onExit);
      process.once('SIGINT', onSigInt);
      process.once('SIGTERM', onSigTerm);

      return {
        acquired: true,
        lockFile: resolvedLockFile,
        pid: process.pid,
        token,
        startedAt,
        release
      };
    } catch (err) {
      if (!err || err.code !== 'EEXIST') {
        throw err;
      }

      let rawStr;
      try {
        rawStr = fs.readFileSync(resolvedLockFile, 'utf8');
      } catch (readErr) {
        if (readErr && readErr.code === 'ENOENT') {
          continue;
        }
        throw readErr;
      }

      const state = inspectLockRecord(rawStr, maxAgeMs);
      if (state.status === 'LIVE') {
        return {
          acquired: false,
          lockFile: resolvedLockFile,
          holderPid: state.holderPid,
          startedAt: state.startedAt,
          reason: 'LOCK_HELD',
          release: noopRelease
        };
      }

      recoverStaleLock(resolvedLockFile, attempt, {
        maxAgeMs,
        expectedRawStr: rawStr
      });
    }
  }

  const meta = readLockMetadata(resolvedLockFile);
  return {
    acquired: false,
    lockFile: resolvedLockFile,
    holderPid: meta.holderPid,
    startedAt: meta.startedAt,
    reason: 'CONTENTION',
    release: noopRelease
  };
}

module.exports = {
  DEFAULT_LOCK_FILE,
  DEFAULT_MAX_AGE_MS,
  getDefaultDataDir,
  getDefaultLockFile,
  acquireProcessLock,
  isPidAlive
};
