'use strict';

/**
 * AUTONOMOUS WORK ORDER GATEWAY (ZERO-HUMAN-APPROVAL)
 * Thương hiệu: Nhà Của Land (nhacualand.com) — Chỉ duy nhất tại D:\Facebook
 *
 * Tự động tạo lệnh sản xuất, tự kiểm duyệt nội bộ (REQUIRE_HUMAN_APPROVAL=false)
 * và chuyển thẳng sang trạng thái SELF_APPROVED_READY_TO_PUBLISH.
 */

require('../lib/env-loader');
const { generatePost, generateVideoScript } = require('./ai_pipeline');
const { evaluateContent } = require('../lib/governance');

class WorkOrderGateway {
  constructor() {
    this.orders = new Map();
  }

  async createOrder({ topic, pillar = 'Không Gian Sống & Tiện Nghi Phòng Thuê', format = 'OMNICHANNEL_POST' }) {
    const orderId = 'WO_' + Date.now();
    let generated;
    if (format.includes('REELS') || format.includes('VIDEO')) {
      generated = await generateVideoScript({ concept: topic });
    } else {
      generated = await generatePost({ topic, pillar, format });
    }

    const gov = evaluateContent({
      caption: typeof generated === 'object'
        ? (generated.facebook_caption || generated.body || generated.call_to_action || '')
        : String(generated)
    });

    const order = {
      id: orderId,
      created_at: new Date().toISOString(),
      topic,
      pillar,
      format,
      human_approval_required: false,
      generated,
      compliance: gov,
      status: gov.allowed ? 'SELF_APPROVED_READY_TO_PUBLISH' : 'BLOCKED_BY_POLICY'
    };

    this.orders.set(orderId, order);
    return order;
  }

  getOrder(id) {
    return this.orders.get(id);
  }

  listOrders() {
    return Array.from(this.orders.values());
  }
}

module.exports = new WorkOrderGateway();
