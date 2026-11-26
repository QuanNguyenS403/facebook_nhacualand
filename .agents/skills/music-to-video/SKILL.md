---
name: music-to-video
description: Dựng video tự động khớp beat nhạc. Phân tích nhịp điệu (BPM, transients, drop) để cắt chuyển cảnh, sync visual và tạo hiệu ứng nhấp nháy/phóng to theo nhịp bài hát.
---

# Music To Video - Dựng Video Theo Beat Nhạc

## Giới thiệu
Kỹ năng `music-to-video` biến bài hát thành kim chỉ nam cho nhịp dựng video, giúp người xem cảm nhận sự ăn khớp hoàn hảo giữa âm nhạc và hình ảnh.

## Chức năng chính
- Phát hiện nhịp (Beat Detection) và đánh dấu các điểm drop/peak năng lượng.
- Tự động cắt chuyển cảnh đúng ngay tích tắc của tiếng trống hoặc drop nhạc.
- Hiệu ứng camera nhún nhảy (Pulsing / Camera Shake) theo độ mạnh của bass.

## Cấu trúc thư mục
- `references/`: Kỹ thuật dựng video theo nhịp điệu.
- `scripts/`: Tool phân tích biên độ và tần số âm thanh.
