# Nhà Của Land — Autonomous AI Agent Company (`D:\Facebook`)

Hệ thống công ty AI Agent độc lập 100% chỉ duy nhất tại **`D:\Facebook`**, tự động hóa hoàn toàn từ khâu lên kế hoạch, viết nội dung, tạo Ảnh AI 4K, dựng Video Room Tour 9:16 đến xuất bản trực tiếp không cần duyệt tay trên **Meta Facebook Fanpage**, **Instagram** và **Threads** cho **Nhà Của Land** ([nhacualand.com](https://nhacualand.com)).

## 🏢 Kiến trúc 6 Phòng Ban AI Agent (`config/agent_company.json`)
1. **`CEO_ORCHESTRATOR`** (`scripts/company_orchestrator.js`): Điều phối chu trình tự động hóa 100% theo lịch tuần/tháng.
2. **`CREATIVE_COPYWRITER`** (`services/ai_pipeline.js`): Sáng tạo copy chuyên biệt cho Fanpage, Instagram và Threads bằng `gemini-3.8-flash`.
3. **`VISUAL_IMAGE_STUDIO`** (`services/image_engine.js`): Tạo ảnh nội thất/phòng thuê 4K qua `gemini-nano-banana-2.1`, **Google Flow Image Studio** (`flow.google.com`) và Brand Card Renderer (`data/images/`).
4. **`CINEMATIC_VIDEO_VEO`** (`services/video-engine.js`, `services/veo_video_engine.js`, `services/google_flow_agent.js`): Tạo video Room Tour 9:16 qua **Google Flow PRO / Veo**, `gemini-omni-1.1-flash` và 20 Hyperframes Skills (`data/videos/`).
5. **`COMPLIANCE_GOVERNANCE`** (`lib/governance.js`): Tự kiểm duyệt & tự phê duyệt 100% (`REQUIRE_HUMAN_APPROVAL=false`), kiểm soát tần suất độc lập theo từng kênh và khóa bảo vệ `STRICT_BRAND_ASSET_GUARD=true`.
6. **`OMNICHANNEL_PUBLISHER`** (`services/publish-executor.js`): Xuất bản Dual-Engine (Graph API + Playwright `Profile 38`) lên **Facebook Fanpage + Instagram + Threads**.

---

## 🚀 Các lệnh điều hành công ty AI Agent

### 1. Chạy chu trình tự động hóa toàn diện 100% (Viết bài + Tạo Ảnh/Video + Đăng cả 3 kênh)
```bash
npm run orchestrate
# Hoặc chỉ định tạo Video Room Tour 9:16 & đăng cả 3 kênh:
npm run orchestrate:video
# Hoặc tạo Ảnh AI 4K & đăng cả 3 kênh:
npm run orchestrate:image
```

### 2. Tạo Ảnh AI 4K hoặc Video Room Tour Veo & tự động đăng
```bash
# Tạo ảnh 4K và tự động đăng lên Fanpage + Instagram + Threads
npm run image:generate -- --prompt "Căn hộ studio ban công ngập nắng ấm cúng" --publish

# Tạo video Room Tour 9:16 trên Google Flow / Veo và tự động đăng lên cả 3 kênh
npm run video:veo -- --prompt "Room tour phòng trọ cao cấp có gác lửng và bếp riêng" --publish
```

### 3. Đăng bài tức thì đa kênh
```bash
# Đăng đồng loạt lên cả 3 kênh (Fanpage + Instagram + Threads)
npm run publish:all -- --message "Quỹ phòng studio mới nhất tuần này tại nhacualand.com" --auto-image

# Đăng riêng từng kênh nếu muốn
npm run publish:fb -- --message "Cập nhật phòng trống mới tại nhacualand.com"
npm run publish:ig -- --message "Không gian sống ngập nắng sớm tại nhacualand.com" --auto-image
npm run publish:threads -- --message "Mẹo kiểm tra hợp đồng thuê phòng minh bạch"
```

### 4. Kiểm tra phiên đăng nhập, tiến độ & kiểm toán cô lập `D:\Facebook`
```bash
npm run check:isolation
npm run social:check
npm run progress
```

### 5. Đồng bộ phiên trình duyệt 1 lần (khi đổi tài khoản Fanpage/IG/Threads)
```bash
npm run social:session
```
