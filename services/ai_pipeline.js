'use strict';

/**
 * OMNICHANNEL AI COPYWRITING & SCRIPT PIPELINE FOR NHÀ CỦA LAND (nhacualand.com)
 * Powered by Official @google/genai SDK (Interactions API — gemini-3.8-flash)
 * Phạm vi: Chỉ duy nhất tại D:\Facebook (Fanpage Meta + Instagram + Threads)
 */

require('../lib/env-loader');
const { GoogleGenAI } = require('@google/genai');
const brand = require('../config/brand.json');
const promptArchitect = require('./prompt_architect');

function getCandidateModels() {
  const primary = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const fast = process.env.GEMINI_FAST_MODEL || 'gemini-3.5-flash-lite';
  return Array.from(new Set([primary, fast]));
}

async function callGemini(prompt, systemInstruction = '') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ Chưa cấu hình GEMINI_API_KEY trong .env. Kích hoạt bộ sinh nội dung chuẩn thương hiệu Nhà Của Land...');
    return generateLocalFallback(prompt);
  }

  const client = new GoogleGenAI({ apiKey });
  let lastError = null;

  for (const model of getCandidateModels()) {
    try {
      const params = {
        model,
        input: prompt,
        generation_config: {
          temperature: 0.7,
          max_output_tokens: 2048
        }
      };
      if (systemInstruction) {
        params.system_instruction = systemInstruction;
      }

      const interaction = await Promise.race([
        client.interactions.create(params),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini Interactions timeout (20s)')), 20000))
      ]);

      if (interaction && interaction.output_text) {
        return interaction.output_text;
      }
    } catch (err) {
      lastError = err;
    }
  }

  console.warn(`⚠️ Google Gemini Interactions API tạm bận (${lastError?.message}). Kích hoạt Template Generator Nhà Của Land...`);
  return generateLocalFallback(prompt);
}

function generateLocalFallback(prompt = '') {
  const isVideo = prompt.includes('kịch bản') || prompt.includes('video ngắn Room Tour') || prompt.includes('ShortVideo');
  const archPrompt = promptArchitect.buildArchitecturalPrompt({ topic: prompt });
  const veoPrompt = promptArchitect.buildVeoVideoPrompt({ topic: prompt });

  if (isVideo) {
    return JSON.stringify({
      title: 'Khoảnh Khắc Bước Vào Căn Phòng Mới',
      total_seconds: 20,
      hook_3s: 'Cảm giác sau một ngày dài kiệt sức, mở cửa ra là không gian thoáng đãng và làn gió mát...',
      timeline: [
        {
          start_sec: 0,
          end_sec: 5,
          visual_action: 'Góc quay gimbal mượt mà bước vào căn phòng ngập tràn ánh sáng tự nhiên',
          voiceover: 'Điều người đi thuê mong nhất đôi khi chỉ là một căn phòng có chiếc cửa sổ thật sáng, để mỗi sáng thức dậy thấy nhẹ nhõm hơn.',
          onscreen_text: ''
        },
        {
          start_sec: 6,
          end_sec: 11,
          visual_action: 'Cận cảnh góc nhỏ sạch sẽ tinh tươm, ánh nắng rọi mộc mạc',
          voiceover: 'Có một góc nhỏ gọn gàng để tự tay nấu ăn hay pha tách trà sau giờ làm việc vất vả.',
          onscreen_text: ''
        },
        {
          start_sec: 12,
          end_sec: 16,
          visual_action: 'Cận cảnh chiếc giường nệm êm ái thơm tho và khung cửa nhìn ra khoảng trời xanh',
          voiceover: 'Đêm về được ngả lưng ngủ một giấc thật sâu, không phải bận tâm tiếng ồn hay cảm giác ngột ngạt bí bách.',
          onscreen_text: ''
        },
        {
          start_sec: 17,
          end_sec: 20,
          visual_action: 'Góc máy lùi dần ra ngoài, khép lại khung cảnh thanh bình',
          voiceover: 'Tìm một chốn dung thân ấm cúng ở thành phố, để mỗi ngày trôi qua đều là cảm giác được an lòng.',
          onscreen_text: ''
        }
      ],
      soundtrack_style: 'Acoustic / Lo-fi êm dịu, mộc mạc, bình yên',
      veo_prompt: veoPrompt,
      space_archetype_id: archPrompt.archetypeId,
      space_archetype_name: archPrompt.archetypeName,
      call_to_action: ''
    });
  }

  const fbBody = `Tan làm mệt nhoài lại phải dắt xe đi tìm phòng trọ, ngõ ngách vừa tối vừa xa.\nChỉ mong tìm được cái phòng sáng sủa, sạch sẽ, tối về ngủ một giấc cho đã đời ngày mai còn đi cày tiếp.`;
  const igCaption = `Đi thuê phòng chỉ mong có cái cửa sổ thoáng mát với chiếc giường êm, tối về ngả lưng là thấy nhẹ cả người.`;
  const threadsCaption = `Đi thuê phòng sợ nhất là lúc vào ở tiền điện nước, tiền rác, tiền xe cộng lại đắt hơn cả tiền phòng. Cứ rõ ràng từng đồng từ đầu cho người ta nhờ.`;

  return JSON.stringify({
    title: 'Nỗi Lòng Người Đi Thuê Phòng',
    hook: 'Tan làm mệt nhoài lại phải dắt xe đi tìm phòng trọ...',
    body: fbBody,
    facebook_caption: fbBody,
    instagram_caption: igCaption,
    threads_caption: threadsCaption,
    call_to_action: '',
    hashtags: ['#phongtro', '#chothuephong', '#phongstudio'],
    visual_prompt: archPrompt.prompt,
    space_archetype_id: archPrompt.archetypeId,
    space_archetype_name: archPrompt.archetypeName,
    video_prompt: veoPrompt
  });
}

const SYSTEM_PERSONA = `Bạn là người bạn thân tình, nói chuyện mộc mạc như chính những người đang đi thuê trọ tại thành phố lớn.

QUY TẮC BẮT BUỘC TUYỆT ĐỐI (STRICT EDITORIAL MANDATES):
1. ĐỘ DÀI CỰC KỲ NGẮN GỌN & SÚC TÍCH:
   - Caption Facebook / Threads / Instagram CHỈ ĐƯỢC PHÉP DÀI TỪ 2 ĐẾN 4 CÂU NGẮN (tối đa 40 - 70 từ).
   - Tuyệt đối KHÔNG viết bài dài dòng, không viết văn tràng giang đại hải, không lý thuyết triết lý.
2. NGÔN TỪ THÔNG DỤNG, BÌNH DÂN, DỄ HIỂU & DỄ TIẾP CẬN:
   - Đối tượng người đọc là sinh viên, người đi làm, công nhân xa quê — những người không mấy khá giả, không cần văn hoa chữ nghĩa.
   - Dùng lời ăn tiếng nói mộc mạc, bình dân hằng ngày (như: "đi cày", "ngủ một giấc cho đã đời", "rõ ràng từng đồng", "ngõ ngách tối om", "ảnh một đằng phòng một nẻo").
   - Tuyệt đối KHÔNG dùng từ hoa mỹ, hàn lâm hay trau chuốt sáo rỗng.
3. TUYỆT ĐỐI KHÔNG QUẢNG CÁO, KHÔNG KÊU GỌI:
   - Không viết bài dạng rao vặt, không kêu gọi sale/cọc, không "liên hệ ngay", không văn phong cò mồi.
4. TUYỆT ĐỐI KHÔNG DÙNG CÂU KHẲNG ĐỊNH TỰ TÂNG BỐC:
   - Cấm mọi từ ngữ tự khen như "hàng đầu", "số 1", "chuyên nghiệp nhất", "khẳng định uy tín", "hoàn hảo nhất".
5. TUYỆT ĐỐI KHÔNG VIẾT RÕ TÊN RIÊNG:
   - CẤM TUYỆT ĐỐI nhắc đến các từ "nhacualand", "Nhà Cửa Land", "Nhà Của Land", "nhacualand.com", số hotline hay bất kỳ tên riêng nào trong caption và bài viết.
6. ĐÁNH TRÚNG NỖI ĐAU THỰC TẾ:
   - Ảnh ảo trên mạng vs phòng thực tế ẩm mốc, tối tăm.
   - Sợ phát sinh phụ phí mập mờ, điện nước giá cắt cổ.
   - Phòng bí bách không có cửa sổ, tường mỏng ồn ào không ngủ nổi.
   - Chung chủ gò bó giờ giấc, bất an chuyện an ninh mất cắp xe cộ.
   - Ước mong chỉ là phòng sạch, có ánh nắng sáng, tối ngủ yên giấc.`;

/**
 * Tạo gói bài đăng đa kênh hoàn chỉnh (Facebook Fanpage + Instagram + Threads + Image/Video Prompts)
 */
async function generatePost({ topic, pillar = 'Nỗi Lòng Người Đi Thuê & Đời Sống Thực Tế', format = 'OMNICHANNEL_POST' }) {
  const prompt = `Hãy viết một caption cực kỳ NGẮN GỌN, BÌNH DÂN (2 đến 4 câu ngắn, tối đa 50 từ) về tâm tư đời thường của người đi thuê phòng trọ:
Chủ đề: "${topic}"
Góc nhìn: "${pillar}"

YÊU CẦU BẮT BUỘC CHO CAPTION:
- Dài đúng 2 - 4 câu ngắn, súc tích, đọc trong 5 giây là hiểu ngay.
- Ngôn từ thông dụng, bình dân, dễ hiểu, gần gũi cho sinh viên và người đi làm bình thường, không văn hoa chữ nghĩa.
- Tuyệt đối KHÔNG quảng cáo, KHÔNG khẳng định tâng bốc.
- Tuyệt đối KHÔNG nhắc tên riêng (KHÔNG viết nhacualand, Nhà Cửa Land, nhacualand.com...).

YÊU CẦU ĐẶC BIỆT CHO VISUAL PROMPT (HÌNH ẢNH):
- "visual_prompt" PHẢI là một câu mô tả tiếng Anh chi tiết, sống động và ĐỘC NHẤT cho bối cảnh phòng cho thuê thực tế tại Việt Nam liên quan trực tiếp đến chủ đề "${topic}".
- Chọn 1 trong các không gian: Căn hộ Duplex gác lửng thông minh, ban công kính hoàng hôn, căn 1PN có sofa nhỏ, góc bếp nhỏ xinh sạch sẽ, phòng ngủ Japandi tối giản, góc làm việc đón nắng sớm bên cửa sổ, hoặc nhà tắm khép kín vách kính hiện đại.
- KHÔNG dùng lại các câu mẫu chung chung. Chỉ định rõ góc máy, ánh sáng và chi tiết nội thất thực tế.

Yêu cầu xuất ra đúng JSON hợp lệ:
{
  "title": "Tiêu đề ngắn 1 câu",
  "hook": "Câu mở đầu 1 dòng ngắn",
  "body": "Đoạn văn ngắn đúng 2-3 câu bình dân",
  "facebook_caption": "Caption Facebook ngắn gọn 2-4 câu từ ngữ bình dân",
  "instagram_caption": "Caption Instagram ngắn 1-2 câu",
  "threads_caption": "Caption Threads ngắn gọn 1-2 câu",
  "call_to_action": "",
  "hashtags": ["#phongtro", "#chothuephong"],
  "visual_prompt": "Unique English architectural interior prompt describing this specific rental space, natural lighting, clean composition, no text, no watermark",
  "video_prompt": "Continuous smooth gimbal room tour video prompt, warm daylight, peaceful mood, no text, no watermark"
}`;

  const raw = await callGemini(prompt, SYSTEM_PERSONA);
  const cleanJson = (raw || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(cleanJson);
    const archPrompt = promptArchitect.buildArchitecturalPrompt({
      prompt: parsed.visual_prompt,
      topic: `${topic} ${parsed.title || ''}`,
      title: parsed.title || topic
    });
    const veoPrompt = promptArchitect.buildVeoVideoPrompt({
      topic: `${topic} ${parsed.title || ''}`,
      title: parsed.title,
      hook: parsed.hook
    });

    return {
      ...parsed,
      facebook_caption: parsed.facebook_caption || `${parsed.hook || ''}\n\n${parsed.body || ''}`.trim(),
      instagram_caption: parsed.instagram_caption || `${parsed.hook || ''}\n\n${parsed.body || ''}`.trim(),
      threads_caption: parsed.threads_caption || parsed.facebook_caption || `${parsed.hook || ''}\n\n${parsed.body || ''}`.trim(),
      visual_prompt: archPrompt.prompt,
      space_archetype_id: archPrompt.archetypeId,
      space_archetype_name: archPrompt.archetypeName,
      video_prompt: parsed.video_prompt && !promptArchitect.isLegacyPlaceholder(parsed.video_prompt) ? parsed.video_prompt : veoPrompt
    };
  } catch (e) {
    const fallback = JSON.parse(generateLocalFallback(topic));
    return fallback;
  }
}

/**
 * Tạo kịch bản ShortVideo Room Tour (9:16) cho Facebook Reels, Instagram Reels & Threads
 */
async function generateVideoScript({ concept, durationSeconds = 20 }) {
  const prompt = `Hãy tạo kịch bản chi tiết cho video ngắn Room Tour thời lượng ${durationSeconds} giây định dạng Reels 9:16 (Facebook Reels, Instagram Reels, Threads) cho ${brand.name} (${brand.website}).
Ý tưởng: "${concept}"
QUY TẮC CỐT LÕI: Tuyệt đối hạn chế tối đa việc thêm chữ và ký hiệu vào video tránh che khuất không gian căn phòng và gây rối mắt người xem. Ưu tiên khung hình sạch sẽ, chuyển động máy quay và âm thanh lofi/acoustic.

Yêu cầu xuất ra JSON hợp lệ:
{
  "title": "Tiêu đề video Room Tour",
  "total_seconds": ${durationSeconds},
  "hook_3s": "Khung hình hoặc góc máy ấn tượng trong 3s đầu",
  "timeline": [
    {
      "start_sec": 0,
      "end_sec": 4,
      "visual_action": "Mô tả chuyển động máy quay trong phòng",
      "voiceover": "Lời thuyết minh ngắn gọn",
      "onscreen_text": ""
    }
  ],
  "soundtrack_style": "Nhạc nền lo-fi / acoustic ấm áp không lời",
  "veo_prompt": "Detailed English continuous gimbal room tour prompt for Google Veo / Omni Flash 9:16 vertical video, photorealistic, clean composition, no text, no watermark, no overlays",
  "call_to_action": "Truy cập nhacualand.com đặt lịch xem phòng ngay!"
}`;

  const raw = await callGemini(prompt, SYSTEM_PERSONA);
  const cleanJson = (raw || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleanJson);
  } catch (e) {
    return JSON.parse(generateLocalFallback('video ngắn Room Tour ' + concept));
  }
}

module.exports = {
  callGemini,
  generatePost,
  generateVideoScript
};
