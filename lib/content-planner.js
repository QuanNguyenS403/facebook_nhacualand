'use strict';

/**
 * RENTER-EMPATHY & TRANSPARENT-HOUSING CONTENT PLANNER (D:\Facebook)
 * Chuẩn hóa theo AGENTS.md Rule 5 và múi giờ Asia/Ho_Chi_Minh (ICT, UTC+7).
 *
 * 3 KHUNG GIỜ VÀNG MỖI NGÀY (ICT):
 * - 08:30 (Sáng): Ánh sáng tự nhiên, phòng thoáng mát, góc ở dễ chịu
 * - 11:30 (Trưa): Minh bạch chi phí điện nước, kinh nghiệm xem phòng thực tế
 * - 19:45 (Tối): Tan làm về phòng nghỉ ngơi, yên tĩnh, giấc ngủ trọn vẹn
 */

const fs = require('fs');
const path = require('path');
const { SPACE_ARCHETYPES } = require('../services/prompt_architect');

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DEFAULT_CALENDAR_FILE = path.resolve(__dirname, '../data/scheduled_calendar.json');

function getDataDir() {
  const raw = process.env.DATA_DIR;
  return (typeof raw === 'string' && raw.trim())
    ? path.resolve(raw.trim())
    : path.resolve(__dirname, '../data');
}

function getDefaultCalendarFile() {
  return path.join(getDataDir(), 'scheduled_calendar.json');
}

function loadCalendar(calendarPath = getDefaultCalendarFile()) {
  const targetPath = (typeof calendarPath === 'string' && calendarPath.trim())
    ? calendarPath.trim()
    : getDefaultCalendarFile();

  const emptyCalendar = {
    domain: 'nhacualand.com',
    brand: 'Nhà Của Land',
    total_slots: 0,
    plan: []
  };

  if (!fs.existsSync(targetPath)) {
    return emptyCalendar;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    if (Array.isArray(parsed)) {
      return {
        domain: 'nhacualand.com',
        brand: 'Nhà Của Land',
        total_slots: parsed.length,
        plan: parsed
      };
    }
    if (parsed && typeof parsed === 'object') {
      const plan = Array.isArray(parsed.plan) ? parsed.plan : [];
      return {
        domain: 'nhacualand.com',
        brand: 'Nhà Của Land',
        ...parsed,
        plan,
        total_slots: typeof parsed.total_slots === 'number' ? parsed.total_slots : plan.length
      };
    }
    return emptyCalendar;
  } catch (err) {
    console.warn(`[content-planner] Failed to read/parse calendar (${targetPath}): ${err.message}`);
    return emptyCalendar;
  }
}

function saveCalendar(calendarData, calendarPath = getDefaultCalendarFile()) {
  const targetPath = (typeof calendarPath === 'string' && calendarPath.trim())
    ? calendarPath.trim()
    : getDefaultCalendarFile();
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let payload;
  if (Array.isArray(calendarData)) {
    payload = {
      domain: 'nhacualand.com',
      brand: 'Nhà Của Land',
      updated_at: new Date().toISOString(),
      total_slots: calendarData.length,
      plan: calendarData
    };
  } else {
    const meta = (calendarData && typeof calendarData === 'object') ? calendarData : {};
    const plan = Array.isArray(meta.plan) ? meta.plan : [];
    payload = {
      domain: 'nhacualand.com',
      brand: 'Nhà Của Land',
      ...meta,
      updated_at: new Date().toISOString(),
      total_slots: plan.length,
      plan
    };
  }

  fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf8');
  return targetPath;
}

const WEEKDAY_MAP = {
  Sun: { index: 0, name: 'Chủ Nhật' },
  Mon: { index: 1, name: 'Thứ Hai' },
  Tue: { index: 2, name: 'Thứ Ba' },
  Wed: { index: 3, name: 'Thứ Tư' },
  Thu: { index: 4, name: 'Thứ Năm' },
  Fri: { index: 5, name: 'Thứ Sáu' },
  Sat: { index: 6, name: 'Thứ Bảy' }
};

function toValidDate(input) {
  if (input === null || input === '' || typeof input === 'boolean') return null;
  const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(d.getTime()) || !Number.isFinite(d.getTime())) return null;
  return d;
}

function getLocalTimeParts(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const d = toValidDate(date);
  if (!d) {
    throw new TypeError('Invalid date supplied to getLocalTimeParts');
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23'
  }).formatToParts(d);

  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  const rawHour = Number(map.hour);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(map.minute);
  const second = Number(map.second);
  const weekdayInfo = WEEKDAY_MAP[map.weekday] || { index: 0, name: 'Chủ Nhật' };

  return {
    dateStr: `${map.year}-${map.month}-${map.day}`,
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute,
    second,
    totalMinutes: hour * 60 + minute,
    weekdayIndex: weekdayInfo.index,
    dayName: weekdayInfo.name
  };
}

function getLocalDateString(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  return getLocalTimeParts(date, timeZone).dateStr;
}

function addDaysToDateString(dateStr, dayOffset = 0, timeZone = DEFAULT_TIMEZONE) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!match) {
    throw new TypeError(`Invalid YYYY-MM-DD date string: "${dateStr}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // 12:00 ICT (05:00 UTC) tránh mọi biên lệch ngày
  const noonIctMs = Date.UTC(year, month - 1, day + Number(dayOffset || 0), 5, 0, 0);
  return getLocalTimeParts(new Date(noonIctMs), timeZone);
}

const BRAND_PILLARS = [
  {
    id: 'P1_STUDIO_LIGHT_LIVING',
    segment: 'Phòng Studio',
    name: 'Phòng Studio Thoáng Sáng & Góc Ở Dễ Chịu',
    weight: 0.30,
    target_platforms: ['facebook_fanpage', 'instagram', 'threads'],
    time_slot: '08:30',
    sample_hooks: [
      {
        hook: 'Phòng Studio có cửa sổ rộng đón nắng sáng, bước chân vào đã thấy thoáng và dễ thở hơn hẳn',
        space_id: 'scandinavian_airy_studio'
      },
      {
        hook: 'Phòng Studio kê vừa chiếc bàn nhỏ cạnh cửa sổ để tối về ngồi làm thêm việc không bị bí bách',
        space_id: 'sunlit_wfh_corner'
      },
      {
        hook: 'Phòng Studio có gác lửng tách riêng chỗ ngủ và chỗ sinh hoạt cho người ở một mình đỡ bừa bộn',
        space_id: 'mezzanine_duplex'
      },
      {
        hook: 'Phòng Studio có khoảng ban công nhỏ hóng gió chiều sau một ngày ngồi máy tính mỏi mắt',
        space_id: 'studio_balcony_sunset'
      },
      {
        hook: 'Phòng Studio tầng trên đón gió tự nhiên, mở cửa ra là thấy sáng sủa chứ không tối om',
        space_id: 'attic_loft_skylight'
      }
    ]
  },
  {
    id: 'P2_CHDV_TRANSPARENT_COST',
    segment: 'Căn hộ dịch vụ',
    name: 'Căn Hộ Dịch Vụ Minh Bạch Chi Phí & Tiện Nghi',
    weight: 0.25,
    target_platforms: ['facebook_fanpage', 'instagram', 'threads'],
    time_slot: '11:30',
    sample_hooks: [
      {
        hook: 'Căn hộ dịch vụ tách bếp và chỗ ngủ giúp tối về nghỉ ngơi không bị ám mùi đồ ăn',
        space_id: 'one_bedroom_cozy'
      },
      {
        hook: 'Căn hộ dịch vụ có góc bếp nhỏ sạch sẽ để tự nấu bữa cơm tối, đỡ tốn tiền ăn ngoài mỗi ngày',
        space_id: 'chef_compact_kitchen'
      },
      {
        hook: 'Căn hộ dịch vụ có nhà vệ sinh khép kín khô ráo, sạch sẽ, không cảnh ẩm mốc khó chịu',
        space_id: 'spotless_glass_bathroom'
      },
      {
        hook: 'Thuê căn hộ dịch vụ điều cần nhất là rõ ràng tiền điện nước ngay từ đầu, cuối tháng khỏi giật mình',
        space_id: 'student_young_pro_room'
      },
      {
        hook: 'Căn hộ dịch vụ sắp xếp tủ đồ gọn gàng giúp sáng đi làm không phải lục tung cả phòng tìm áo',
        space_id: 'modern_wardrobe_dressing'
      }
    ]
  },
  {
    id: 'P3_CCM_QUIET_SECURITY',
    segment: 'Chung cư mini',
    name: 'Chung Cư Mini Yên Tĩnh & Giấc Ngủ Sau Giờ Làm',
    weight: 0.25,
    target_platforms: ['threads', 'facebook_fanpage', 'instagram'],
    time_slot: '19:45',
    sample_hooks: [
      {
        hook: 'Tan làm mệt nhoài dắt xe về chung cư mini, chỉ mong mở cửa thấy phòng sạch mát để ngủ một giấc đã đời',
        space_id: 'lofi_evening_chill'
      },
      {
        hook: 'Chung cư mini có khóa vân tay và chỗ để xe gọn gàng giúp người đi làm ca tối đỡ thấp thỏm lo lắng',
        space_id: 'secure_building_lobby'
      },
      {
        hook: 'Chung cư mini tường cách âm ổn định để tối về ngả lưng ngủ yên, không phải nghe tiếng ồn phòng bên',
        space_id: 'japandi_minimalist_bedroom'
      },
      {
        hook: 'Những chiều mưa tầm tã chạy xe về đến chung cư mini khô ráo, chỉ cần thay đồ rồi nghỉ ngơi là thấy nhẹ người',
        space_id: 'rainy_day_warm_retreat'
      },
      {
        hook: 'Chung cư mini có chút cây xanh ở hành lang hay ban công nhìn cho đỡ ngột ngạt giữa phố đông',
        space_id: 'green_sanctuary_balcony'
      }
    ]
  },
  {
    id: 'P4_PHONG_TRO_REAL_ADVICE',
    segment: 'Phòng trọ cao cấp',
    name: 'Phòng Trọ Cao Cấp & Nỗi Lòng Người Đi Thuê',
    weight: 0.20,
    target_platforms: ['facebook_fanpage', 'instagram', 'threads'],
    time_slot: '11:30',
    sample_hooks: [
      {
        hook: 'Phòng trọ cao cấp xem ảnh trên mạng lung linh lắm, nhưng vẫn phải tới xem ban ngày mới biết có bị bí và tối không',
        space_id: 'scandinavian_airy_studio'
      },
      {
        hook: 'Đi xem phòng trọ cao cấp nhớ kiểm tra kỹ góc tường và đường thoát nước nhà tắm trước khi quyết định thuê',
        space_id: 'spotless_glass_bathroom'
      },
      {
        hook: 'Người đi thuê phòng trọ cao cấp sợ nhất là phụ phí mập mờ, tiền điện nước cộng lại còn nặng hơn tiền nhà',
        space_id: 'student_young_pro_room'
      },
      {
        hook: 'Tìm phòng trọ cao cấp cho sinh viên hay người mới đi làm, chỉ cần phòng sáng sủa, thoáng khí là đỡ mệt mỏi hơn nhiều',
        space_id: 'sunlit_wfh_corner'
      }
    ]
  }
];

// Kiểm chứng toàn bộ space_id khớp với SPACE_ARCHETYPES trong prompt_architect.js
const VALID_SPACE_IDS = new Set((SPACE_ARCHETYPES || []).map(a => a.id));
for (const pillar of BRAND_PILLARS) {
  for (const item of pillar.sample_hooks) {
    if (!VALID_SPACE_IDS.has(item.space_id)) {
      throw new Error(`Invalid space_id "${item.space_id}" in BRAND_PILLARS.${pillar.id}`);
    }
  }
}

const DAILY_SCHEDULE_SLOTS = [
  { time: '08:30', pillar_index: 0, label: 'Ca Sáng (Ánh Sáng & Không Gian Ở)' },
  { time: '11:30', pillar_index: 1, label: 'Ca Trưa (Minh Bạch Chi Phí & Kinh Nghiệm)' },
  { time: '19:45', pillar_index: 2, label: 'Ca Tối (Tan Làm Về Phòng & Nghỉ Ngơi)' }
];

function slotTimeToMinutes(slotTime = '12:00') {
  const [h, m] = String(slotTime || '12:00').split(':').map(Number);
  return (Number.isFinite(h) ? h : 12) * 60 + (Number.isFinite(m) ? m : 0);
}

function generateSlotsForDate(dateOrStr, startGlobalIndex = 0, dayOffset = 0, timeZone = DEFAULT_TIMEZONE) {
  const dateInfo = (typeof dateOrStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOrStr.trim()))
    ? addDaysToDateString(dateOrStr.trim(), 0, timeZone)
    : getLocalTimeParts(dateOrStr, timeZone);

  const slots = [];
  let globalHookIndex = startGlobalIndex;

  for (let slotIdx = 0; slotIdx < DAILY_SCHEDULE_SLOTS.length; slotIdx++) {
    const slotDef = DAILY_SCHEDULE_SLOTS[slotIdx];
    const pillar = BRAND_PILLARS[(slotDef.pillar_index + dayOffset) % BRAND_PILLARS.length];
    const hookObj = pillar.sample_hooks[(globalHookIndex + slotIdx) % pillar.sample_hooks.length];
    globalHookIndex++;

    const isVideoSlot = (slotIdx === 2 && dayOffset % 2 === 0);
    const format = isVideoSlot ? 'REELS_CINEMATIC_ROOM_TOUR' : 'OMNICHANNEL_POST';

    slots.push({
      slot_id: `slot_${dateInfo.dateStr}_${slotDef.time.replace(':', '')}`,
      day: dateInfo.dayName,
      date: dateInfo.dateStr,
      slot_time: slotDef.time,
      slot_label: slotDef.label,
      segment: pillar.segment,
      pillar_id: pillar.id,
      pillar_name: pillar.name,
      format,
      target_platforms: pillar.target_platforms,
      concept_hook: hookObj.hook,
      space_archetype_id: hookObj.space_id,
      goal: 'RENTER_EMPATHY_AND_TRANSPARENCY',
      target_url: 'https://nhacualand.com',
      status: 'SCHEDULED'
    });
  }

  return slots;
}

function generatePlan(startDate = new Date(), totalDays = 30) {
  const daysCount = Number.isInteger(totalDays) && totalDays > 0 ? totalDays : 30;
  const baseDateStr = (typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate.trim()))
    ? startDate.trim()
    : getLocalDateString(startDate, DEFAULT_TIMEZONE);

  const plan = [];
  let globalHookIndex = 0;

  for (let dayOffset = 0; dayOffset < daysCount; dayOffset++) {
    const dayInfo = addDaysToDateString(baseDateStr, dayOffset, DEFAULT_TIMEZONE);
    const daySlots = generateSlotsForDate(dayInfo.dateStr, globalHookIndex, dayOffset, DEFAULT_TIMEZONE);
    globalHookIndex += daySlots.length;
    plan.push(...daySlots);
  }

  return plan;
}

function generateWeeklyPlan(startDate = new Date(), totalDays = 7) {
  return generatePlan(startDate, totalDays);
}

function generateMonthlyPlan(startDate = new Date(), totalDays = 30) {
  return generatePlan(startDate, totalDays);
}

function isSlotPending(slot) {
  return Boolean(slot && slot.status !== 'PUBLISHED' && slot.status !== 'DONE' && slot.status !== 'EXPIRED');
}

function expirePastSlots(plan = [], todayStr = getLocalDateString(new Date(), DEFAULT_TIMEZONE)) {
  if (!Array.isArray(plan)) return [];
  for (const slot of plan) {
    if (slot && typeof slot.date === 'string' && slot.date < todayStr && slot.status === 'SCHEDULED') {
      slot.status = 'EXPIRED';
    }
  }
  return plan;
}

function ensureTodaySlots(plan = [], {
  now = new Date(),
  timeZone = DEFAULT_TIMEZONE,
  extendDays = 7
} = {}) {
  const workingPlan = Array.isArray(plan) ? plan : [];
  const todayStr = getLocalDateString(now, timeZone);
  expirePastSlots(workingPlan, todayStr);

  const hasToday = workingPlan.some(s => s && s.date === todayStr);
  if (hasToday) {
    return { plan: workingPlan, todayStr, extended: false, addedCount: 0 };
  }

  const daysToGenerate = Number.isInteger(extendDays) && extendDays > 0 ? extendDays : 7;
  const existingIds = new Set(workingPlan.map(s => s && s.slot_id).filter(Boolean));
  const generated = generatePlan(todayStr, daysToGenerate);
  let addedCount = 0;

  for (const slot of generated) {
    if (!existingIds.has(slot.slot_id)) {
      workingPlan.push(slot);
      existingIds.add(slot.slot_id);
      addedCount++;
    }
  }

  return { plan: workingPlan, todayStr, extended: addedCount > 0, addedCount };
}

function pickTodaySlot(customTopicOrOptions = null, extraOptions = {}) {
  let opts = {};
  if (typeof customTopicOrOptions === 'string') {
    opts = { ...extraOptions, customTopic: customTopicOrOptions };
  } else if (customTopicOrOptions && typeof customTopicOrOptions === 'object') {
    opts = { ...customTopicOrOptions, ...extraOptions };
  } else {
    opts = { ...extraOptions };
  }

  if (opts.customTopic) {
    return {
      pillar_name: 'Không Gian Sống & Tiện Nghi Phòng Thuê',
      format: 'OMNICHANNEL_POST',
      concept_hook: opts.customTopic,
      space_archetype_id: null
    };
  }

  const timeZone = opts.timeZone || DEFAULT_TIMEZONE;
  const nowDate = opts.now !== undefined ? toValidDate(opts.now) : new Date();
  if (!nowDate) {
    throw new TypeError('Invalid options.now supplied to pickTodaySlot');
  }
  const { dateStr: todayStr, totalMinutes: currentMinutes } = getLocalTimeParts(nowDate, timeZone);
  const autoExtend = opts.autoExtend !== false;
  const extendDays = Number.isInteger(opts.extendDays) && opts.extendDays > 0 ? opts.extendDays : 7;
  const explicitCalendarPath = (typeof opts.calendarPath === 'string' && opts.calendarPath.trim().length > 0)
    ? opts.calendarPath.trim()
    : null;
  const persistPath = opts.persist === true
    ? (explicitCalendarPath || (!Array.isArray(opts.plan) ? getDefaultCalendarFile() : null))
    : null;

  let calendarMeta = { domain: 'nhacualand.com', brand: 'Nhà Của Land' };
  let workingPlan = [];

  if (Array.isArray(opts.plan)) {
    workingPlan = opts.plan.map(s => ({ ...s }));
  } else {
    const readPath = explicitCalendarPath || getDefaultCalendarFile();
    const loaded = loadCalendar(readPath);
    const { plan: loadedPlan, ...loadedMeta } = loaded;
    calendarMeta = { ...calendarMeta, ...loadedMeta };
    workingPlan = Array.isArray(loadedPlan) ? loadedPlan.map(s => ({ ...s })) : [];
  }

  let mutated = false;
  for (const s of workingPlan) {
    if (s && typeof s.date === 'string' && s.date < todayStr && s.status === 'SCHEDULED') {
      s.status = 'EXPIRED';
      mutated = true;
    }
  }

  const sortClosestToNow = (a, b) => {
    const minA = slotTimeToMinutes(a.slot_time);
    const minB = slotTimeToMinutes(b.slot_time);
    const diff = Math.abs(minA - currentMinutes) - Math.abs(minB - currentMinutes);
    return diff !== 0 ? diff : (minA - minB);
  };

  let pendingToday = workingPlan
    .filter(s => s && s.date === todayStr && isSlotPending(s))
    .sort(sortClosestToNow);

  if (pendingToday.length === 0 && !workingPlan.some(s => s && s.date === todayStr) && autoExtend) {
    const ext = ensureTodaySlots(workingPlan, { now: nowDate, timeZone, extendDays });
    if (ext.extended) mutated = true;
    pendingToday = workingPlan
      .filter(s => s && s.date === todayStr && isSlotPending(s))
      .sort(sortClosestToNow);
  }

  let chosenSlot = null;
  if (pendingToday.length > 0) {
    chosenSlot = pendingToday[0];
  } else {
    const futurePending = workingPlan
      .filter(s => s && typeof s.date === 'string' && s.date > todayStr && isSlotPending(s))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return slotTimeToMinutes(a.slot_time) - slotTimeToMinutes(b.slot_time);
      });

    if (futurePending.length > 0) {
      chosenSlot = futurePending[0];
    } else if (autoExtend) {
      const existingIds = new Set(workingPlan.map(s => s && s.slot_id).filter(Boolean));
      const slotsCountByDate = new Map();
      for (const s of workingPlan) {
        if (s && typeof s.date === 'string') {
          slotsCountByDate.set(s.date, (slotsCountByDate.get(s.date) || 0) + 1);
        }
      }

      let startOffset = 1;
      const maxSearchOffset = workingPlan.length + 3650;
      let startFutureDateStr = addDaysToDateString(todayStr, startOffset, timeZone).dateStr;
      while (startOffset <= maxSearchOffset) {
        const candidateStr = addDaysToDateString(todayStr, startOffset, timeZone).dateStr;
        const allStandardSlotsPresent = DAILY_SCHEDULE_SLOTS.every(def =>
          existingIds.has(`slot_${candidateStr}_${def.time.replace(':', '')}`)
        );
        const dateSaturated = (slotsCountByDate.get(candidateStr) || 0) >= DAILY_SCHEDULE_SLOTS.length;
        if (!allStandardSlotsPresent && !dateSaturated) {
          startFutureDateStr = candidateStr;
          break;
        }
        startOffset++;
      }

      const newFutureSlots = generatePlan(startFutureDateStr, extendDays);
      const addedFutureSlots = [];
      for (const slot of newFutureSlots) {
        if (!existingIds.has(slot.slot_id)) {
          workingPlan.push(slot);
          existingIds.add(slot.slot_id);
          addedFutureSlots.push(slot);
          mutated = true;
        }
      }
      chosenSlot = addedFutureSlots[0] || null;
    }
  }

  if (persistPath && mutated) {
    saveCalendar({
      ...calendarMeta,
      plan: workingPlan
    }, persistPath);
  }

  return chosenSlot;
}

module.exports = {
  DEFAULT_TIMEZONE,
  DEFAULT_CALENDAR_FILE,
  PILLARS: BRAND_PILLARS,
  BRAND_PILLARS,
  DAILY_SCHEDULE_SLOTS,
  getDefaultCalendarFile,
  loadCalendar,
  saveCalendar,
  getLocalDateString,
  getLocalTimeParts,
  addDaysToDateString,
  generateSlotsForDate,
  generatePlan,
  generateWeeklyPlan,
  generateMonthlyPlan,
  expirePastSlots,
  ensureTodaySlots,
  pickTodaySlot
};
