---
name: remotion-to-hyperframes
description: Công cụ và quy chuẩn di chuyển (migration) các composition từ Remotion React sang kiến trúc dữ liệu và runtime độc lập của Hyperframes.
---

# Remotion To Hyperframes - Chuyển Đổi Framework

## Giới thiệu
Kỹ năng `remotion-to-hyperframes` hỗ trợ phân tích các dự án video viết bằng Remotion và chuyển đổi chúng sang định dạng gói frame của Hyperframes để render nhanh và nhẹ hơn.

## Chức năng chính
- Ánh xạ các hook Remotion (useCurrentFrame, interpolate, spring) sang Hyperframes Math equivalents.
- Đóng gói JSX tree thành định dạng frame packets có thể chạy headless.
- Kiểm thử đối chiếu trực quan (Visual Regression Testing) giữa 2 bản render.

## Cấu trúc thư mục
- `assets/`: Tập dữ liệu kiểm thử so sánh kết quả.
- `scripts/`: Parser và bộ chuyển đổi mã nguồn tự động.
