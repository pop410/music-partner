const path = require('path');
const fs = require('fs');

console.log('__dirname:', __dirname);
const extRoot = path.resolve(__dirname, '../../../');
console.log('extRoot:', extRoot);
const candidate = path.join(extRoot, 'helper', 'netease-helper.exe');
console.log('candidate:', candidate);
console.log('exists:', fs.existsSync(candidate));

const candidate2 = path.join(extRoot, 'helper/dist', 'netease-helper.exe');
console.log('candidate2:', candidate2);
console.log('exists2:', fs.existsSync(candidate2));
