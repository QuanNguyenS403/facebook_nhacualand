---
name: hyperframes-audio
description: Xử lý và đồng bộ âm thanh Hyperframes. Quản lý voice-over, phân tách beat nhạc, tự động ducking nhạc nền khi có lời nói và master âm lượng theo chuẩn loudness (-14 LUFS).
---

# Hyperframes Audio - Xử Lý và Đồng Bộ Âm Thanh

## Giới thiệu
Kỹ năng `hyperframes-audio` đảm bảo chất lượng âm thanh chuyên nghiệp, từ việc cân bằng giọng đọc, nhạc nền đến các hiệu ứng âm thanh kích thích thính giác người xem.

## Chức năng chính
- Tự động hạ âm lượng nhạc nền khi có tiếng nói (Auto-Ducking).
- Chuẩn hóa âm lượng tích hợp (Loudness Normalization) theo chuẩn phát sóng mạng xã hội (-14 LUFS).
- Cắt và lặp nhạc nền (audio looping) khớp hoàn hảo với thời lượng video.

## Cấu trúc thư mục
- `references/`: Tiêu chuẩn kỹ thuật âm thanh và bảng thông số loudness.
- `scripts/`: Tiện ích phân tích beat và bộ trộn âm đa kênh (multi-track mixer).
