---
name: figma
description: Trích xuất vector, layout, frame tokens và asset thiết kế từ Figma để chuyển hóa thành các layer/component lập trình trong video Hyperframes.
---

# Figma Integration - Trích Xuất và Đồng Bộ Thiết Kế

## Giới thiệu
Kỹ năng `figma` kết nối trực tiếp với Figma API nhằm lấy thông tin layout, màu sắc, font chữ và hình ảnh vector, sẵn sàng đưa vào pipeline lập trình hoạt ảnh.

## Chức năng chính
- Xuất SVG, PNG độ phân giải cao cho các icon, logo và minh họa sản phẩm.
- Trích xuất design tokens: mã màu (Hex/RGB), kích thước chữ, bán kính bo góc (border-radius).
- Chuyển đổi khung thiết kế (frames) thành tọa độ bố cục trong hệ quy chiếu video (1080x1920).

## Cấu trúc thư mục
- `scripts/`: Scripts gọi Figma REST API và parser cấu trúc node Figma.
