---
name: hyperframes
description: Master Orchestrator - Bộ điều phối trung tâm của Hyperframes Video Engine. Quản lý toàn bộ vòng đời sản xuất video, phỏng vấn ý đồ (intent-interview), định tuyến workflow (routes) và xuất bản phẩm.
---

# Hyperframes - Master Video Engine Orchestrator

## Giới thiệu
`hyperframes` là hạt nhân điều phối cao nhất của toàn bộ hệ sinh thái sản xuất video bằng code. Kỹ năng này nhận brief, phân tích yêu cầu và điều hướng đến workflow chuyên biệt phù hợp.

## Chức năng chính
- Phỏng vấn và chuẩn hóa brief đầu vào (intent-interview: thời lượng, mục tiêu, phong cách, tone & mood).
- Điều phối (routing) sang các route chuyên trách: product-launch, talking-head, faceless-explainer, v.v.
- Giám sát tiến độ render, kiểm tra chất lượng (QA review loop) và báo cáo trạng thái.

## Cấu trúc thư mục
- `references/`: Hợp đồng dữ liệu (brief-contract.md, capability-menu.md, workflow-catalog.md).
- `references/routes/`: Bản mô tả chi tiết của từng tuyến dựng video chuyên biệt.
- `scripts/`: Thư viện lõi frame-packets-core.mjs và các tiện ích điều phối.
