// Loads the rewritten engine (js/engine/*.js) into Node.
const fs = require('fs');
const path = require('path');
const env = require('./env');
const dir = path.join(env.ROOT, 'js', 'engine');
const order = JSON.parse(fs.readFileSync(path.join(dir, 'order.json'), 'utf8'));
for (const f of order) new Function(fs.readFileSync(path.join(dir, f), 'utf8')).call(globalThis);
module.exports = env;
