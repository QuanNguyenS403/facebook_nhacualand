---
name: embedded-captions
description: Tự động tạo, định dạng và nhúng phụ đề (captions/subtitles) động vào video ngắn. Hỗ trợ căn chỉnh nhịp chữ (word-level timing), kinetic captions, highlight từ khóa và tối ưu vùng an toàn (safe-zones) trên Reels/TikTok/Shorts.
---

# Embedded Captions - Nhúng Phụ Đề Video Tự Động

## Giới thiệu
Kỹ năng `embedded-captions` quản lý toàn bộ quy trình nhận diện, tạo và định dạng phụ đề động cho video ngắn. Đảm bảo trải nghiệm xem video không cần bật âm lượng và tăng tỷ lệ giữ chân (retention).

## Chức năng chính
- Nhận diện lời thoại và sinh mốc thời gian chuẩn xác đến từng từ (word-level timestamps).
- Hiển thị phụ đề động (Kinetic/Pop-up captions) với highlight từ khóa chính.
- Định vị chữ tránh bị che khuất bởi UI của Facebook Reels, Instagram Reels và TikTok (vùng an toàn safe-zones).
- Hỗ trợ đa dạng preset phong cách (Cinematic, Modern Pop, Minimalist, Bold Neon).

## Cấu trúc thư mục
- `dna/`: Định nghĩa các thuộc tính cốt lõi của font chữ, màu sắc và animation.
- `modes/`: Các chế độ hiển thị (standard, cinematic, dynamic).
- `themes/`: Bảng mã màu và style preset định dạng sẵn.
- `scripts/`: Script xử lý timing và render caption layers.
