'use strict';

const fs = require('fs');
const path = require('path');
const fb = require('../lib/facebook-api');

async function testCoverUpload() {
  await fb.resolvePageCredentials();
  const cfg = fb.getConfig();
  console.log('Page ID:', cfg.pageId);

  // File to upload
  const imagePath = path.resolve('D:/Facebook/data/images/cover_map_concept1_isometric_pins_1640x924.png');
  console.log('Image exists:', fs.existsSync(imagePath));

  // 1. Upload photo to page photos
  const fileBuffer = fs.readFileSync(imagePath);
  const form = new FormData();
  form.append('access_token', cfg.pageToken);
  form.append('caption', 'Ảnh bìa mới — Bản đồ định vị tìm phòng Nhà Của Land (nhacualand.com)');
  form.append('source', new Blob([fileBuffer], { type: 'image/png' }), 'cover_map_concept1.png');

  console.log('Uploading photo to /photos...');
  const res = await fetch(`${cfg.graphBaseUrl}/${cfg.pageId}/photos`, { method: 'POST', body: form });
  const data = await res.json();
  console.log('Photo Upload Result:', data);

  if (data.id) {
    const photoId = data.id;
    console.log(`Setting photo ${photoId} as page cover...`);
    // Try setting as cover: POST /{pageId} with cover: photoId
    const coverRes = await fetch(`${cfg.graphBaseUrl}/${cfg.pageId}?access_token=${encodeURIComponent(cfg.pageToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cover: photoId })
    });
    const coverData = await coverRes.json();
    console.log('Cover update result (cover: photoId):', coverData);

    if (coverData.error) {
      console.log('Trying cover_id...');
      const coverRes2 = await fetch(`${cfg.graphBaseUrl}/${cfg.pageId}?access_token=${encodeURIComponent(cfg.pageToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover_id: photoId })
      });
      console.log('Cover update result (cover_id):', await coverRes2.json());
    }
  }
}

testCoverUpload().catch(console.error);
