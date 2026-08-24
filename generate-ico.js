// 把 PNG 图标包装成 .ico(供桌面快捷方式使用)
const fs = require("fs");
const png = fs.readFileSync("icons/icon-192.png");

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // 保留
header.writeUInt16LE(1, 2); // 类型:图标
header.writeUInt16LE(1, 4); // 数量:1

const entry = Buffer.alloc(16);
entry[0] = 192; // 宽
entry[1] = 192; // 高
entry[2] = 0;   // 颜色数
entry[3] = 0;   // 保留
entry.writeUInt16LE(1, 4);   // planes
entry.writeUInt16LE(32, 6);  // bpp
entry.writeUInt32LE(png.length, 8); // 数据大小
entry.writeUInt32LE(22, 12); // 偏移(6+16)

const ico = Buffer.concat([header, entry, png]);
fs.writeFileSync("icons/icon.ico", ico);
console.log("icon.ico 已生成");
