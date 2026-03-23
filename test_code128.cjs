const { JSDOM } = require("jsdom");
const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div id="container"><svg id="b"></svg></div>
</body></html>`);
const window = dom.window;
global.window = window;
global.document = window.document;

// Mock canvas
window.HTMLCanvasElement.prototype.getContext = () => ({
  measureText: () => ({ width: 10 }),
  fillText: () => {},
  clearRect: () => {},
  font: ''
});

const document = window.document;
const JsBarcode = require("jsbarcode");
const svg = document.getElementById("b");

JsBarcode(svg, '479600546170', {
  format: 'CODE128',
  width: 2.0,
  height: 100,
  fontOptions: "bold",
  fontSize: 12,
  displayValue: true,
  margin: 12,
  textMargin: 0
});

console.log("Path count:", svg.querySelectorAll('path, rect').length);
console.log("SVG generated:", svg.outerHTML.substring(0, 500));
