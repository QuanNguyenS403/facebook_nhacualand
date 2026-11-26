---
name: media-use
description: Quản lý và kiểm soát việc sử dụng tài nguyên media (ảnh, video, audio, LUTs màu). Đảm bảo tuân thủ bản quyền, tối ưu dung lượng và ghi log truy vết tài nguyên.
---

# Media Use - Quản Lý Tài Nguyên Đa Phương Tiện

## Giới thiệu
Kỹ năng `media-use` đảm nhận vai trò quản kho tài nguyên, từ việc nhập khẩu, nén ảnh/video đến kiểm duyệt giấy phép bản quyền trước khi đưa vào video chính thức.

## Chức năng chính
- Phân loại và lập chỉ mục kho media: B-roll, Background Audio, Sound FX, LUTs màu.
- Tự động nén và tối ưu hóa kích thước tài nguyên để rút ngắn thời gian nạp khi render.
- Ghi nhật ký nguồn gốc và giấy phép bản quyền sử dụng.

## Cấu trúc thư mục
- `audio/`: Kho hiệu ứng âm thanh và nhạc nền đã kiểm duyệt.
- `luts/`: Các bộ chỉnh màu (Color LUTs) phong cách điện ảnh.
- `scripts/`: Công cụ kiểm tra metadata và tối ưu hóa tệp.
