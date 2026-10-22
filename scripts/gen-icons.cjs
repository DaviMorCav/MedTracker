const fs = require('fs');
const path = require('path');

// Generates minimal valid PNG files of given size with a solid color
// Sufficient for PWA icon purposes when no canvas/sharp is available
function createMinimalPng(size, outputPath) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let crc = 0xffffffff;
    const table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcInput = Buffer.concat([typeBuffer, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(crcInput), 0);
    return Buffer.concat([len, typeBuffer, data, crcBuf]);
  }

  // IHDR chunk: width, height, bit depth 8, color type 2 (RGB)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // IDAT: raw pixel data (each row: filter byte 0 + RGB bytes)
  // Color: #0f172a (15, 23, 42)
  const r = 0x0f, g = 0x17, b = 0x2a;
  const rowSize = 1 + size * 3;
  const rawData = Buffer.alloc(size * rowSize);
  for (let y = 0; y < size; y++) {
    const offset = y * rowSize;
    rawData[offset] = 0; // filter type None
    for (let x = 0; x < size; x++) {
      rawData[offset + 1 + x * 3] = r;
      rawData[offset + 1 + x * 3 + 1] = g;
      rawData[offset + 1 + x * 3 + 2] = b;
    }
  }

  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawData);

  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  fs.writeFileSync(outputPath, png);
  console.log(`Generated ${outputPath} (${size}x${size})`);
}

const publicDir = path.join(__dirname, '..', 'public');
createMinimalPng(192, path.join(publicDir, 'icon-192.png'));
createMinimalPng(512, path.join(publicDir, 'icon-512.png'));
