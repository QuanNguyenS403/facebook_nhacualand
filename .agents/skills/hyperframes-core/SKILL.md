---
name: hyperframes-core
description: Kiến trúc lõi Hyperframes. Định nghĩa mô hình dữ liệu video (frame packets), timing clock, composition tree, contract rendering và hệ thống dispatch sự kiện.
---

# Hyperframes Core - Kiến Trúc Lõi Video

## Giới thiệu
`hyperframes-core` là nền tảng kiến trúc gốc rễ, quy định cách dữ liệu video được cấu trúc thành các gói frame độc lập và có thể chạy phân tán.

## Chức năng chính
- Định nghĩa Frame Packet Model (mỗi frame là một trạng thái dữ liệu có thể tái tạo).
- Hệ thống đồng hồ thời gian (Master Clock) chính xác đến từng mili-giây.
- Hợp đồng render độc lập nền tảng (Platform-Agnostic Render Contract).

## Cấu trúc thư mục
- `references/`: Đặc tả chi tiết về Frame Packet Spec và Render Pipeline.
