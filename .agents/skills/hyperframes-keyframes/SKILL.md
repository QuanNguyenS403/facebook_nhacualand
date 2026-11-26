---
name: hyperframes-keyframes
description: Quản lý keyframe và timeline Hyperframes. Hỗ trợ nội suy thuộc tính động, marker đồng bộ theo thời gian thực và quản lý track thời gian cho từng thành phần video.
---

# Hyperframes Keyframes - Quản Lý Timeline & Keyframe

## Giới thiệu
Kỹ năng `hyperframes-keyframes` quản trị các điểm mốc thời gian trên timeline, cho phép nội suy thuộc tính từ trạng thái này sang trạng thái khác.

## Chức năng chính
- Đặt marker đồng bộ cho các sự kiện quan trọng: Nhạc drop, đổi cảnh, xuất hiện text.
- Nội suy thông số: Vị trí (X, Y), Tỉ lệ (Scale), Độ mờ (Opacity), Góc xoay (Rotation).

## Cấu trúc thư mục
- `agents/`: Agent chuyên trách tính toán keyframe timeline.
- `references/`: Quy chuẩn định dạng mốc thời gian.
