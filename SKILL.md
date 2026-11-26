---
name: nhacualand-ai-agent-company
description: Hệ thống công ty AI Agent tự động hóa 100% không qua duyệt tay (Meta Fanpage + Instagram + Threads + Google Flow/Veo Video & Nano Banana Image + SQLite WAL + Research & 6-Role Council) cô lập duy nhất tại D:\Facebook cho Nhà Của Land (nhacualand.com).
---

# Nhà Của Land — Autonomous AI Agent Company v3.1 (`D:\Facebook`)

Hệ thống công ty AI Agent độc lập 100% chỉ duy nhất tại `D:\Facebook`, vận hành tự động hóa hoàn toàn không cần duyệt thủ công cho thương hiệu **Nhà Của Land** ([nhacualand.com](https://nhacualand.com)) — nền tảng chuyên cho thuê bất động sản và các loại phòng ở (Studio, CHDV, Chung cư mini, Phòng trọ cao cấp).

## Kiến trúc vận hành nâng cấp (Master Plan)
1. **Cơ sở dữ liệu SQLite WAL (`lib/db.js`, `scripts/migrate_json_to_sqlite.js`)**:
   - Lưu trữ bền vững toàn bộ vòng đời: `campaigns`, `work_orders`, `jobs`, `listings`, `assets`, `asset_rights`, `briefs`, `publications`, `publication_attempts`, `web_events`, `viewing_events`, `attribution`, `budget_ledger`, `incidents`.
   - Hỗ trợ sao lưu nóng (`npm run db:backup`) và đối soát trạng thái từng kênh (`QUEUED → SUBMITTING → VERIFIED / UNKNOWN / FAILED / PARTIAL`).
2. **Xác minh nguồn phòng & bản quyền theo từng tài sản (`lib/source-truth.js`, `config/product-truth-status.json`)**:
   - Không khẳng định toàn cục; chỉ `ROOM_TOUR_REAL` khi `listing_id` còn trống, không phải `is_demo`, còn hạn kiểm chứng và `asset_rights` hợp lệ. Thiếu nguồn thật → chuyển nhánh `renter_education`.
3. **Nghiên cứu & Hội đồng 6 vai trò (`services/research_agent.js`, `services/agent_council.js`)**:
   - Tuần tự 6 pha: `Researcher → Strategist → Copywriter → Rule5Critic → MediaDirector → PublisherCoordinator`.
   - Mọi caption bắt buộc vượt qua `evaluateOmnichannelCaptions` (Rule 5: ngắn 2–4 câu, bình dân, 0 quảng cáo, 0 tên thương hiệu/giá/URL/CTA).
4. **Xuất bản đa kênh có đối soát & tách Chrome khỏi API (`services/publish-executor.js`, `lib/facebook-api.js`)**:
   - Parse kênh nghiêm ngặt, ghim target Page ID, tách đường Graph API khỏi Playwright (chỉ mở Chrome khi cần fallback), xử lý lỗi mạng mơ hồ thành `UNKNOWN` để đối soát chống đăng trùng.
5. **Đo lường chuyển đổi & Ngân sách 0đ (`lib/attribution.js`, `scripts/weekly_report.js`)**:
   - Theo dõi `visit → viewing.requested → viewing.confirmed → viewing.attended`, phân tầng nguồn `post_exact / channel_campaign / channel_only / unknown`, và khóa chi tiêu tăng thêm ở mức `0đ` trong pilot (`npm run report:weekly`).
