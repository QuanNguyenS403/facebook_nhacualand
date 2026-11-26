---
name: general-video
description: Quy trình dựng và render video đa mục đích. Hỗ trợ lắp ghép sequence, chuyển cảnh, phân lớp visual layer và xuất file MP4 chuẩn tỉ lệ dọc 9:16 và ngang 16:9.
---

# General Video - Dựng và Render Video Tổng Quát

## Giới thiệu
Kỹ năng `general-video` cung cấp bộ khung tổng quát nhất để lắp ráp và kết xuất mọi định dạng video từ nguồn đầu vào bất kỳ.

## Chức năng chính
- Hỗ trợ cả tỉ lệ dọc (9:16 - Reels/Stories) và ngang (16:9 - YouTube/Feed).
- Quản lý các lớp đồ họa: Nền (Background), Video/Ảnh chính, Overlay đồ họa, Text và Subtitle.
- Render MP4 chuẩn H.264/AAC tương thích hoàn hảo với thuật toán nén của Meta/Facebook.

## Cấu trúc thư mục
- `scripts/`: Trình biên dịch video và xuất file.
- `sub-agents/`: Dispatcher phân phối tác vụ render song song.
