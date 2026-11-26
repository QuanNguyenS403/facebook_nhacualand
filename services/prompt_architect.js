'use strict';

/**
 * MASTER ARCHITECTURAL PROMPT ARCHITECT FOR NHÀ CỦA LAND (nhacualand.com)
 * Phạm vi: D:\Facebook — Độc lập 100%
 *
 * Chức năng:
 * 1. Chấm dứt triệt để tình trạng "ảnh nào cũng giống nhau / na ná nhau" bằng hệ sinh thái 15+ không gian độc bản.
 * 2. Phân tích ngữ nghĩa topic (Tiếng Việt & Tiếng Anh) để tự động chọn bối cảnh kiến trúc phù hợp nhất.
 * 3. Tự động xoay vòng không gian (Anti-Repetition Mechanism) tránh lặp lại cùng một góc chụp trong các bài liên tiếp.
 * 4. Đảm bảo 100% ảnh tạo ra chân thực chuẩn nhiếp ảnh kiến trúc thực tế (Photorealistic Real Estate Photography),
 *    tuyệt đối không chữ, không logo, không hiệu ứng 3D CGI hoạt hình giả tạo.
 */

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.resolve(__dirname, '../data/publish_history.json');

const SPACE_ARCHETYPES = [
  {
    id: 'mezzanine_duplex',
    name: 'Căn hộ Duplex Gác Lửng Thông Minh',
    keywords: ['gác lửng', 'duplex', 'thang gỗ', 'trần cao', 'gác xép', 'tối ưu diện tích', 'mezzanine', 'loft'],
    corePrompt: 'A modern bright Vietnamese duplex apartment with a smart mezzanine sleeping loft. Sleek wooden floating staircase with built-in storage cabinets underneath, crisp white walls with warm oak accents. High ceilings, expansive vertical window casting long morning shadows, lower level has a minimalist sofa, small work desk, and clean wood-plank flooring. Extremely spacious, tidy, and thoughtfully designed for young urban professionals.'
  },
  {
    id: 'studio_balcony_sunset',
    name: 'Phòng Studio Ban Công Kính Hoàng Hôn',
    keywords: ['ban công', 'hoàng hôn', 'chiều tà', 'sunset', 'view phố', 'lộng gió', 'hóng gió', 'thư giãn'],
    corePrompt: 'Cozy Vietnamese studio apartment with large sliding glass balcony doors opened to a breathtaking golden hour sunset over the city skyline. Soft sheer curtains blowing gently in the evening breeze, a small balcony with a woven rattan chair and potted green plants. Inside is warm 2700K ambient lighting, a plush minimalist bed with linen sheets, and a calm tranquil evening sanctuary mood.'
  },
  {
    id: 'one_bedroom_cozy',
    name: 'Căn Hộ 1 Phòng Ngủ Khép Kín',
    keywords: ['1pn', '1 phòng ngủ', 'sofa', 'phòng khách', 'ngăn phòng', 'riêng tư', 'căn hộ dịch vụ', 'apartment'],
    corePrompt: 'A stylish 1-bedroom rental apartment in an urban Vietnamese building. An airy partition with light oak wooden slats separates the cozy bedroom from a modern compact living room. Light grey fabric sofa with mustard throw pillows, round Scandinavian coffee table, a framed minimalist botanical art print on the wall, and soft diffused natural daylight filling the entire room.'
  },
  {
    id: 'chef_compact_kitchen',
    name: 'Góc Bếp Xinh Xắn & Tiện Nghi',
    keywords: ['bếp', 'nấu ăn', 'tủ bếp', 'bếp từ', 'tủ lạnh', 'bữa tối', 'pha trà', 'kitchen', 'nấu nướng'],
    corePrompt: 'A spotless, compact modern kitchen corner in a Vietnamese rental apartment. Matte white and light sage green upper and lower cabinets, gleaming white subway tile backsplash, built-in black induction cooktop, compact stainless steel sink, modern slim refrigerator, neat wooden spice rack, and warm under-cabinet LED strip lighting. Super clean, organized, welcoming and practical.'
  },
  {
    id: 'japandi_minimalist_bedroom',
    name: 'Phòng Ngủ Japandi / Wabi-sabi Tĩnh Lặng',
    keywords: ['tối giản', 'japandi', 'wabi-sabi', 'ngủ', 'tĩnh lặng', 'chữa lành', 'an yên', 'nệm bệt', 'giường êm'],
    corePrompt: 'Serene Japandi style rental bedroom in Vietnam. Low-profile platform wooden bed frame resting on light oak flooring, neutral beige linen bedding with wrinkled organic texture. A delicate rice paper lantern pendant light softly glowing, subtle lime-wash textured plaster wall, single ceramic vase with dried pampas grass on the nightstand. Deeply calming, clutter-free zen atmosphere.'
  },
  {
    id: 'sunlit_wfh_corner',
    name: 'Góc Làm Việc Bên Cửa Sổ Ngập Nắng',
    keywords: ['làm việc', 'wfh', 'deadline', 'bàn làm việc', 'cửa sổ', 'đón nắng', 'ánh sáng tự nhiên', 'freelancer'],
    corePrompt: 'A dedicated work-from-home corner inside a bright Vietnamese rental apartment. Clean solid oak writing desk positioned right beside a floor-to-ceiling sunny window with sheer white curtains. Ergonomic modern chair, open laptop, warm ceramic coffee mug with soft rising steam, small thriving potted monstera deliciosa plant on a wooden plant stand, bathed in golden morning sunbeams.'
  },
  {
    id: 'spotless_glass_bathroom',
    name: 'Phòng Tắm Khép Kín Vách Kính Hiện Đại',
    keywords: ['phòng tắm', 'vệ sinh', 'nhà tắm', 'wc', 'vách kính', 'sạch sẽ', 'sen cây', 'khép kín', 'gương led'],
    corePrompt: 'Pristine, gleaming clean private en-suite bathroom in a modern Vietnamese rental apartment. Frameless tempered glass walk-in rain shower enclosure with matte black fixtures, crisp white marble pattern porcelain wall tiles, floating wooden vanity with modern vessel sink, round LED backlit mirror, dry-wet separation, spotless, fresh and hygienic.'
  },
  {
    id: 'green_sanctuary_balcony',
    name: 'Ban Công Xanh Mát Rợp Cây Thư Giãn',
    keywords: ['cây xanh', 'tiểu cảnh', 'mát mẻ', 'không khí trong lành', 'thoáng mát', 'trồng cây', 'góc chill'],
    corePrompt: 'A delightful private balcony retreat attached to a rental room in Vietnam. Lush collection of healthy potted tropical plants including snake plants, hanging devil’s ivy, and ferns along a black iron railing. Small foldable wooden bistro table and chair with a cold drink, gentle natural daylight, fresh breeze, overlooking a peaceful tree-lined neighborhood.'
  },
  {
    id: 'student_young_pro_room',
    name: 'Phòng Trọ Trẻ Trung, Gọn Gàng & Sáng Sủa',
    keywords: ['sinh viên', 'người mới đi làm', 'tiết kiệm', 'ngăn nắp', 'sáng sủa', 'gọn gàng', 'vừa túi tiền', 'bình dân'],
    corePrompt: 'An affordable yet impeccably tidy and bright compact rental room for a young professional or student in Vietnam. Single comfortable bed with fresh striped cotton sheets, neat floating wall bookshelves with study books, full-length mirror reflecting daylight, spacious window with white Venetian blinds letting in cheerful sunlight. Clean, organized, peaceful and comfortable.'
  },
  {
    id: 'scandinavian_airy_studio',
    name: 'Studio Phong Cách Bắc Âu Hiện Đại',
    keywords: ['bắc âu', 'scandinavian', 'trắng sáng', 'gỗ sồi', 'rộng rãi', 'thoáng đãng', 'tươi sáng'],
    corePrompt: 'Airy Scandinavian inspired studio apartment for rent in Vietnam. Bright white interior palette with blonde wood flooring and soft pastel mint accents. Queen bed with fluffy white duvet, cozy reading nook with a cushioned armchair and standing brass arc floor lamp, neatly arranged clothes rack, clean lines and cheerful natural morning light.'
  },
  {
    id: 'rainy_day_warm_retreat',
    name: 'Không Gian Ấm Cúng Ngày Mưa',
    keywords: ['ngày mưa', 'mưa', 'ấm áp', 'trú mưa', 'ấm cúng', 'nghỉ ngơi', 'sau giờ làm', 'lạnh'],
    corePrompt: 'Intimate and peaceful view inside a cozy Vietnamese rental studio while it gently rains outside. Droplets of rain glistening on the large glass window pane, warm ambient indoor lamps casting a soft golden glow across the wooden floor and made bed. A resident’s perspective of staying safe, warm and relaxed indoors away from the bustling wet streets.'
  },
  {
    id: 'secure_building_lobby',
    name: 'Sảnh Đón & Cửa Khóa Vân Tay An Ninh',
    keywords: ['an ninh', 'khóa vân tay', 'thẻ từ', 'để xe', 'hầm xe', 'camera', 'văn minh', 'an toàn', 'giờ giấc tự do'],
    corePrompt: 'Well-lit, secure and modern ground-floor entrance lobby of a high-standard mini apartment building in Vietnam. High-security digital smart door lock with biometric fingerprint keypad, clean polished ceramic floor, CCTV surveillance camera discreetly mounted, neat indoor motorcycle parking zone, civilized, safe, and professional environment.'
  },
  {
    id: 'lofi_evening_chill',
    name: 'Phòng Buổi Tối Đèn Vàng Ấm Cúng',
    keywords: ['buổi tối', 'đèn vàng', 'ngủ một giấc', 'tan làm', 'về phòng', 'kiệt sức', 'nghỉ ngơi', 'đêm'],
    corePrompt: 'Moody and peaceful evening ambiance inside a cozy Vietnamese studio apartment. Main lights dimmed, illuminated only by a warm 2200K amber bedside lamp and soft under-bed LED glow. City night lights shimmering softly outside the sheer window, soft blankets, relaxing lo-fi evening vibe after a long exhausting workday.'
  },
  {
    id: 'attic_loft_skylight',
    name: 'Phòng Áp Mái Có Cửa Sổ Trời Đón Nắng',
    keywords: ['áp mái', 'cửa sổ trời', 'skylight', 'độc lạ', 'ngắm trời', 'ngắm mây', 'chill'],
    corePrompt: 'Charming top-floor studio room in a boutique Vietnamese rental house featuring an angled ceiling with a clean glass skylight. Natural sunlight and blue sky visible overhead, white painted exposed wooden rafters, minimalist cozy bedding, wooden desk bathed in top-down natural light, unique, artistic and peaceful.'
  },
  {
    id: 'modern_wardrobe_dressing',
    name: 'Góc Tủ Quần Áo & Gương Soi Toàn Thân',
    keywords: ['tủ đồ', 'quần áo', 'gương soi', 'tủ âm tường', 'gọn gàng', 'chuẩn bị đi làm', 'sắp xếp'],
    corePrompt: 'A neat dressing and storage corner in a modern Vietnamese rental apartment. Floor-to-ceiling built-in wooden wardrobe with sleek minimalist handles, arched full-length LED standing mirror reflecting the clean room, organized shoe cabinet near the entryway, spotless and thoughtfully laid out for daily living.'
  }
];

const LIGHTING_VARIATIONS = [
  'Bathed in gentle golden morning sunlight streaming through sheer curtains with warm sunbeams',
  'Illuminated by crisp, clear diffused natural afternoon daylight, airy and realistic',
  'Lit by warm amber 2700K ambient bedside lamps and soft indirect ceiling cove lighting at dusk',
  'Soft golden hour twilight tones blending with warm cozy interior lighting',
  'Bright morning illumination casting crisp clean shadows across smooth wooden flooring'
];

const CAMERA_ANGLES = [
  'Wide-angle 24mm architectural interior perspective showcasing room openness and depth',
  'Eye-level straight-on candid viewpoint as if standing right inside the doorway',
  'Elevated corner perspective displaying the functional layout, furniture arrangement and ceiling height',
  'Medium lifestyle composition highlighting the cozy bedding and sunlit window nook',
  'First-person point-of-view looking toward the spacious sun-drenched living space'
];

class PromptArchitect {
  constructor() {
    this.archetypes = SPACE_ARCHETYPES;
  }

  getRecentArchetypeIds(limit = 3) {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    try {
      const history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
      const recent = history
        .slice(-limit * 3)
        .map(h => h.spaceArchetype)
        .filter(Boolean);
      return [...new Set(recent)].slice(-limit);
    } catch {
      return [];
    }
  }

  detectArchetypeFromText(text = '') {
    const lower = String(text || '').toLowerCase();
    for (const arch of this.archetypes) {
      if (arch.keywords.some(kw => lower.includes(kw))) {
        return arch;
      }
    }
    return null;
  }

  selectDiverseArchetype({ topic = '', preferredId = null } = {}) {
    if (preferredId) {
      const found = this.archetypes.find(a => a.id === preferredId);
      if (found) return found;
    }

    const detected = this.detectArchetypeFromText(topic);
    if (detected) return detected;

    const recentIds = this.getRecentArchetypeIds(3);
    const available = this.archetypes.filter(a => !recentIds.includes(a.id));
    const pool = available.length > 0 ? available : this.archetypes;

    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex];
  }

  isLegacyPlaceholder(prompt = '') {
    const raw = String(prompt || '').toLowerCase();
    return (
      raw.includes('detailed english architectural interior photography prompt') ||
      raw.includes('modern bright vietnamese studio apartment for rent, natural sunlight through balcony glass doors') ||
      raw.length < 25
    );
  }

  buildArchitecturalPrompt({
    prompt = '',
    title = '',
    topic = '',
    aspectRatio = '3:4',
    preferredId = null
  } = {}) {
    const cleanPrompt = String(prompt || '').trim();
    const hasCustomRichPrompt = cleanPrompt && !this.isLegacyPlaceholder(cleanPrompt) && cleanPrompt.length > 50;

    let baseScene = '';
    let selectedArchetype = null;

    if (hasCustomRichPrompt) {
      baseScene = cleanPrompt.replace(/\b(no text|no watermark|photorealistic)\b/gi, '').trim();
    } else {
      selectedArchetype = this.selectDiverseArchetype({
        topic: topic || title || cleanPrompt,
        preferredId
      });
      baseScene = selectedArchetype.corePrompt;
    }

    const randomLighting = LIGHTING_VARIATIONS[Math.floor(Math.random() * LIGHTING_VARIATIONS.length)];
    const randomAngle = CAMERA_ANGLES[Math.floor(Math.random() * CAMERA_ANGLES.length)];

    const promptParts = [
      baseScene,
      randomLighting,
      randomAngle,
      'Photorealistic real estate architectural photography, real Vietnamese rental room interior, Hasselblad medium format clarity, 8K ultra-detailed texture',
      'absolutely no text, no watermark, no overlays, no graphic icons, no CGI artifacts, no distorted perspective, no unrealistic luxury'
    ];

    return {
      prompt: promptParts.join('. '),
      archetypeId: selectedArchetype ? selectedArchetype.id : (this.detectArchetypeFromText(baseScene)?.id || 'custom'),
      archetypeName: selectedArchetype ? selectedArchetype.name : 'Không Gian Độc Bản Tuỳ Biến',
      aspectRatio
    };
  }

  buildFlowPrompt(inputPrompt, { aspectRatio = '3:4' } = {}) {
    const built = this.buildArchitecturalPrompt({
      prompt: inputPrompt,
      aspectRatio
    });
    return built.prompt;
  }

  buildVeoVideoPrompt({ topic = '', title = '', hook = '', aspectRatio = '9:16' } = {}) {
    const arch = this.selectDiverseArchetype({ topic: `${title} ${hook} ${topic}` });
    const isPortrait = aspectRatio === '9:16';
    const framing = isPortrait
      ? 'vertical 9:16 smartphone framing for Instagram Reels and Facebook Reels'
      : 'cinematic wide 16:9 architectural framing';

    return `Create a photorealistic continuous unbroken room tour video (${framing}): Smooth gimbal camera gently gliding through ${arch.name}. ${arch.corePrompt}. Gentle morning natural sunlight, real life textures, peaceful ambient acoustic atmosphere. Absolutely no text, no logo, no watermark, no CGI distortion.`;
  }
}

module.exports = new PromptArchitect();
module.exports.SPACE_ARCHETYPES = SPACE_ARCHETYPES;
