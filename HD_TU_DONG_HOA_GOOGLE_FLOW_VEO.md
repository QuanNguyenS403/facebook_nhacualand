# CẨM NANG VẬN HÀNH AI AGENT TỰ ĐỘNG HÓA GOOGLE FLOW & VEO — ROOM TOUR NHÀ CỦA LAND

> **Thương hiệu:** Nhà Của Land (nhacualand.com) — Phạm vi độc lập duy nhất: `D:\Facebook`  
> **Ứng dụng:** Tự động tạo **Video Room Tour 9:16** và **Ảnh Kiến Trúc Phòng 4K** trực tiếp trên nền tảng **Google Flow / Veo / Nano Banana 2.1 / Omni 1.1 Flash** (`flow.google.com`) và phân phối tự động 100% lên cả 3 kênh: **Meta Facebook Fanpage, Instagram & Threads**.  
> **Tiêu chí vận hành:** Tự động hóa 100% ngầm không qua người dùng duyệt tay (`REQUIRE_HUMAN_APPROVAL=false`).

---

## 1. TỔNG QUAN KIẾN TRÚC TỰ ĐỘNG HÓA ROOM TOUR

Hệ thống được thiết kế theo mô hình **Autonomous Dual-Engine**, đáp ứng nghiêm ngặt yêu cầu không làm phiền người dùng:

```
                          ┌───────────────────────────┐
                          │   NGƯỜI DÙNG RA LỆNH      │
                          │   (Chat / Lệnh Terminal)  │
                          └─────────────┬─────────────┘
                                        │
                                        ▼
                      ┌──────────────────────────────────────┐
                      │    AI AGENT & PROMPT SYNTHESIZER     │
                      │   (Biên dịch sang Room Tour 4K)      │
                      └──────────────────┬───────────────────┘
                                        │
              ┌──────────────────────────┴──────────────────────────┐
              │                                                     │
              ▼                                                     ▼
┌───────────────────────────┐                         ┌───────────────────────────┐
│ ENGINE 1: GOOGLE FLOW WEB │                         │ ENGINE 2: GOOGLE VEO API  │
│ (flow.google.com via RPA) │                         │ (Google GenAI Veo SDK)    │
│ - Chrome Profile kiên định│                         │ - Gọi qua GEMINI_API_KEY  │
│ - Tự động chọn tỉ lệ 9:16 │                         │ - Dự phòng không trễ nhịp │
│ - Giám sát render & tải   │                         │ - Không phụ thuộc DOM web │
└────────────┬──────────────┘                         └────────────┬──────────────┘
              │                                                     │
              └──────────────────────────┬──────────────────────────┘
                                        │
                                        ▼
                      ┌──────────────────────────────────────┐
                      │   DATA/VIDEOS/ (THÀNH PHẨM MP4)      │
                      │  - Chuẩn 9:16 Reels 1080x1920        │
                      │  - Ảnh snapshot preview frame        │
                      └──────────────────┬───────────────────┘
                                        │
                                        ▼
                      ┌──────────────────────────────────────┐
                      │    TỰ ĐỘNG XUẤT BẢN ĐA KÊNH          │
                      │     (Facebook Fanpage & Threads)     │
                      └──────────────────────────────────────┘
```

---

## 2. DANH MỤC THÀNH PHẦN

| Tệp / Thư mục | Chức năng chính |
| :--- | :--- |
| `services/playwright_manager.js` | **Động cơ cốt lõi Playwright**: Persistent Context, chống chặn bot (Stealth) và auto-waiting chống lỗi. |
| `services/google_flow_agent.js` | Tự động nhập prompt vào ProseMirror, chọn tỉ lệ 9:16, kích hoạt render và tải video. |
| `services/veo_video_engine.js` | Động cơ điều phối Dual-Engine kết hợp Playwright Web RPA và Google GenAI SDK Veo API. |
| `services/video-engine.js` | Điểm kết nối trung tâm cho Room Tour video ngắn của Nhà Của Land. |
| `services/threads_playwright_publisher.js` | Tự động xuất bản video và bài viết lên **Threads** qua Playwright. |
| `services/meta_playwright_publisher.js` | Tự động xuất bản video và bài viết lên **Facebook Fanpage** qua Playwright. |
| `data/videos/` | Kho lưu trữ các file video MP4 và ảnh preview kết quả để người dùng kiểm tra. |

---

## 3. HƯỚNG DẪN RA LỆNH VÀ THỰC THI

### Cách 1: Ra lệnh trực tiếp cho AI Agent (Khuyên Dùng)
Bạn chỉ cần nhắn tin cho AI Agent với nội dung bạn muốn, ví dụ:
- *"Tạo cho tôi một video Room Tour căn hộ mini studio ban công hoàng hôn trên Google Flow"*
- *"Tạo video Veo 9:16 về phòng trọ cao cấp có gác lửng và tự động đăng lên Fanpage & Threads"*

AI Agent sẽ tự động chạy ngầm toàn bộ quy trình và gửi lại bạn đường dẫn file video cùng ảnh bằng chứng để bạn kiểm tra ngay trong cuộc trò chuyện!

---

### Cách 2: Chạy trực tiếp từ dòng lệnh (Terminal / PowerShell)

#### A. Tạo video chuẩn 9:16 Room Tour cho Reels & Threads (Mặc định):
```bash
npm run video:veo -- --prompt "Căn hộ studio full nội thất Nhà Của Land ngập tràn ánh nắng"
```

#### B. Tạo video và tự động xuất bản ngay lên Fanpage & Threads:
```bash
npm run video:veo -- --prompt "Phòng trọ cao cấp khép kín có bếp riêng và ban công thoáng" --publish
```

#### C. Kiểm tra trạng thái phiên Google Flow:
```bash
npm run video:veo -- --check-session
```
