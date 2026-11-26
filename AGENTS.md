# HIẾN PHÁP VẬN HÀNH CÔNG TY AI AGENT — NHÀ CỦA LAND (`D:\Facebook`)

## 1. Phạm Vi Cô Lập Tuyệt Đối (`D:\Facebook`)
- Toàn bộ hệ thống công ty AI Agent này hoạt động **100% độc lập và cô lập tuyệt đối** trong phạm vi thư mục duy nhất: `D:\Facebook`.
- Lĩnh vực chuyên biệt: **Nền tảng chuyên cho thuê bất động sản & phòng ở** (Phòng Studio, Căn hộ dịch vụ, Chung cư mini, Phòng trọ cao cấp) với website chính thức **`https://nhacualand.com`**.
- Tài khoản quản trị mặc định: **`quannguyentop1lux@gmail.com`** (hoặc `ducquan16102006@gmail.com` khi được chỉ định).
- **Nghiêm cấm tuyệt đối** việc truy cập, đọc/ghi, đối chiếu hoặc đồng bộ chéo với bất kỳ thư mục hệ thống nào bên ngoài `D:\Facebook`.

## 2. Chế Độ Tự Động Hóa Hoàn Toàn 100% (Zero-Human-Approval Autonomy)
- Hệ thống được cấp quyền **Autonomous Direct Dispatch (`AUTONOMOUS_MODE=FULL_100`, `REQUIRE_HUMAN_APPROVAL=false`, `AUTO_PUBLISH=true`, `DRY_RUN=false`)**.
- Khi thực hiện chu trình sản xuất nội dung và đăng bài, AI Agent **KHÔNG dừng lại hỏi ý kiến hay chờ duyệt tay** từ người dùng:
  1. Tự động lên ý tưởng & viết bài chuẩn đa kênh (`services/ai_pipeline.js` — `gemini-3.8-flash`).
  2. Tự động kiểm duyệt chính sách Meta & tự phê duyệt nội bộ (`lib/governance.js`).
  3. Tự động sản xuất hình ảnh kiến trúc/nội thất 4K (`services/image_engine.js`) và video Room Tour 9:16 (`services/video-engine.js`, `services/veo_video_engine.js`, `services/google_flow_agent.js` + 20 Hyperframes Skills).
  4. Tự động đăng tải trực tiếp lên cả 3 kênh mạng xã hội và lưu ảnh chụp màn hình bằng chứng vào `D:\Facebook\data\screenshots\` cùng lịch sử tại `D:\Facebook\data\publish_history.json`.

## 3. Toàn Quyền Truy Cập Các Nền Tảng Xuất Bản & Công Cụ Sáng Tạo
Hệ thống AI Agent tại `D:\Facebook` có toàn quyền điều khiển Dual-Engine (Official API + Playwright Persistent Browser `Profile 38`) trên:
1. **Meta Facebook Fanpage (`Nhacualand`)**:
   - Meta Graph API v21.0 (`lib/facebook-api.js`) & Meta Business Suite / Fanpage Playwright RPA (`services/meta_playwright_publisher.js`).
   - Hỗ trợ Feed Post, Photo, Carousel, Facebook Reels.
2. **Instagram (`@nhacualand`)**:
   - Instagram Graph API (`lib/facebook-api.js`) & Instagram Web Playwright RPA (`services/instagram_playwright_publisher.js`).
   - Hỗ trợ Photo Post (4:5 / 1:1), Carousel, Instagram Reels (9:16).
3. **Threads (`@nhacualand`)**:
   - Threads API `graph.threads.net` (`lib/facebook-api.js`) & Threads Web `threads.com` Playwright RPA (`services/threads_playwright_publisher.js`).
   - Hỗ trợ Text Thread, Image Thread, Video Thread.
4. **Google Flow / Veo / Nano Banana / Omni Flash (Video & Image Studio)**:
   - Trình duyệt Playwright Persistent Context (`D:\Facebook\data\browser_profile` -> `Profile 38`) truy cập trực tiếp **Google Flow PRO (`https://flow.google.com/`)** cho cả tạo Video (Veo) và tạo Ảnh AI.
   - Tích hợp song song SDK `@google/genai` Interactions API:
     - Tạo ảnh: `gemini-nano-banana-2.1` & `gemini-3-pro-image` (`services/image_engine.js`).
     - Tạo video: `gemini-omni-1.1-flash` (`services/veo_video_engine.js`).
     - Hậu kỳ & Motion Graphics: Bộ 20 kỹ năng Hyperframes trong `D:\Facebook\.agents\skills\`.

## 4. Cơ Chế Bảo Vệ Tài Sản Thương Hiệu (Brand Asset Guard)
- Khi xuất bản qua Playwright (`STRICT_BRAND_ASSET_GUARD=true`), các Publisher Agent tự động kiểm tra tên Fanpage / tài khoản Instagram / Threads đang mở phải khớp với thương hiệu **Nhà Của Land (`Nhacualand` / `nhacualand`)** (hoặc tự động chuyển Page sang `Nhacualand`), tuyệt đối không đăng nhầm nội dung bất động sản sang tài sản thương hiệu khác.

## 5. Quy Chuẩn Nội Dung & Caption (Bắt Buộc 100% — Zero Advertising & Real Pain Points)
- **CẤM TUYỆT ĐỐI**:
  1. Tuyệt đối **KHÔNG viết caption mang tính chất quảng cáo**, sale phòng, rao vặt, chốt cọc hay hô hào giật tít.
  2. Tuyệt đối **KHÔNG dùng những câu khẳng định**, tâng bốc (như: "số 1", "hàng đầu", "chuyên nghiệp nhất", "khẳng định uy tín", "hoàn hảo nhất").
  3. Tuyệt đối **KHÔNG viết rõ tên riêng** thương hiệu trong caption (CẤM nhắc đến các từ: `nhacualand`, `Nhà Cửa Land`, `Nhà Của Land`, `nhacualand.com` hay bất kỳ tên riêng nào).
  4. Tuyệt đối **KHÔNG viết bài dài dòng lê thê**, không dùng từ ngữ văn hoa, hàn lâm, triết lý xa vời.
- **YÊU CẦU BẮT BUỘC (NGẮN GỌN, SÚC TÍCH, BÌNH DÂN & GẦN GŨI)**:
  - **Độ dài**: CỰC KỲ NGẮN GỌN (chỉ từ 2 đến 4 câu ngắn, đọc trong 5 giây là hiểu ngay).
  - **Đối tượng tiếp cận**: Sinh viên, công nhân, nhân viên văn phòng trẻ, người đi làm từ quê lên phố mưu sinh — những người không mấy khá giả, cần ngôn từ mộc mạc, bình dân, dễ hiểu.
  - **Văn phong**: Giản dị, chân thực như lời ăn tiếng nói hằng ngày, nói thẳng vào những chuyện bực mình hay mong muốn nhỏ bé nhất:
    * Cảnh tan làm mệt nhoài dắt xe đi tìm phòng trọ trong ngõ ngách.
    * Xem ảnh trên mạng một đằng lung linh, đến nơi thực tế thì ẩm mốc, tối om.
    * Nỗi sợ phụ phí mập mờ, tiền điện nước cộng lại đắt hơn cả tiền phòng.
    * Phòng ngột ngạt không có cửa sổ, tường mỏng ồn ào không ngủ nổi.
    * Mong ước giản dị: phòng sạch sẽ, có chút ánh sáng, tối về ngủ một giấc cho đã đời ngày mai đi làm tiếp.


