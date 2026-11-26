---
name: hyperframes-animation
description: Động cơ hoạt ảnh Hyperframes. Xử lý logic chuyển động, đường cong easing (spring, cubic-bezier), hiệu ứng chuyển cảnh (transitions) và biến đổi hình học cho các layer video.
---

# Hyperframes Animation - Động Cơ Hoạt Ảnh

## Giới thiệu
Kỹ năng `hyperframes-animation` chịu trách nhiệm tạo ra các chuyển động mượt mà, đậm chất điện ảnh và chuẩn quy luật vật lý cho các thành phần trên màn hình.

## Chức năng chính
- Bộ đường cong chuyển động: Linear, Ease-In-Out, Spring Physics (khối lượng, độ cứng, độ cản).
- Chuyển cảnh (Transitions): Fade, Wipe, Slide, Morph, Zoom Blur, Kinetic Snap.
- Đồng bộ chuyển động theo keyframe và thời gian thực của timeline.

## Cấu trúc thư mục
- `adapters/`: Cầu nối với các thư viện animation bên thứ ba.
- `blueprints/`: Mẫu chuyển động dựng sẵn cho các loại component (chữ, thẻ, nút CTA).
- `transitions/`: Kho hiệu ứng chuyển cảnh phong phú.
- `scripts/`: Engine tính toán tọa độ theo frame.
