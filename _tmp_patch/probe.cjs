const fs = require('fs');
const src = fs.readFileSync('lib/client.js', 'utf8');
const listeners = [];
const stubEl = () => ({ style: {}, classList: { add(){}, remove(){} }, setAttribute(){}, removeAttribute(){}, getAttribute(){return null}, appendChild(){}, addEventListener(){}, querySelector(){return null}, querySelectorAll(){return []}, children: [], firstChild: null, contains(){return false} });
const document = {
  documentElement: stubEl(),
  body: stubEl(),
  head: stubEl(),
  addEventListener(){}, removeEventListener(){},
  createElement(){ return stubEl() },
  querySelector(){ return null },
  querySelectorAll(){ return [] },
  getElementById(){ return null },
  visibilityState: 'visible'
};
const window = {
  document,
  localStorage: { getItem(){return null}, setItem(){}, removeItem(){} },
  addEventListener(){}, removeEventListener(){},
  setTimeout(){ return 0 }, clearTimeout(){}, setInterval(){ return 0 }, clearInterval(){},
  innerHeight: 800, innerWidth: 1200,
  location: { href: '' }
};
window.window = window;
const React = {
  createElement(){ return {} },
  useState(v){ return [typeof v === 'function' ? v() : v, () => {}] },
  useEffect(){}, useRef(v){ return { current: v } }
};
let captured = null;
window.__ModuleLoader__ = { load(spec){ captured = spec } };
const sandbox = { window, document, React, console, setTimeout, clearTimeout, setInterval, clearInterval, URL, Blob, navigator: {}, localStorage: window.localStorage };
const vm = require('vm');
const ctx = vm.createContext(sandbox);
ctx.window.__ModuleLoader__ = { load(spec){ captured = spec } };
try {
  vm.runInContext(src, ctx, { filename: 'client.js' });
} catch (error) {
  console.log('MODULE THROW:', error && error.message);
  process.exit(1);
}
console.log('module parsed+loaded ok, spec id =', captured && captured.id);
if (captured && typeof captured.factory === 'function') {
  try {
    const exports = captured.factory((name) => name === 'react' ? React : {});
    console.log('factory ok, exports keys =', Object.keys(exports || {}));
  } catch (error) {
    console.log('FACTORY THROW:', error && error.message);
    console.log(String(error && error.stack).split('\n').slice(0,4).join('\n'));
  }
}
