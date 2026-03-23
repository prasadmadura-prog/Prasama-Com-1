const { JSDOM } = require("jsdom");
const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div id="container"><svg id="b"></svg></div>
</body></html>`);
const window = dom.window;
global.window = window;
global.document = window.document;

// Mock canvas to prevent error
window.HTMLCanvasElement.prototype.getContext = () => ({
    measureText: () => ({ width: 10 }),
    fillText: () => { },
    clearRect: () => { },
    font: ''
});

const document = window.document;
const JsBarcode = require("jsbarcode");

const svg = document.getElementById("b");

const render = (f, v) => {
    let isValid = true;
    svg.innerHTML = '';
    svg.removeAttribute('viewBox');
    svg.removeAttribute('width');
    svg.removeAttribute('height');

    JsBarcode(svg, String(v), {
        format: f,
        margin: 0,
        displayValue: false, // SKIP TEXT MEASUREMENT ERROR
        valid: function (status) { isValid = status; }
    });

    if (!isValid) throw new Error("Validation failed for " + f);
    if (!svg.innerHTML.trim()) throw new Error("Empty SVG");
};

try {
    try {
        render('UPC', '479600543051');
    } catch (e) {
        console.log("Caught:", e.message);
        try {
            render('CODE128', '479600543051');
        } catch (e2) {
            console.log("Caught 2:", e2.message);
            render('CODE128', '0000');
        }
    }
} catch (err) {
    console.log("Fatal Error:", err);
}

console.log("FINAL SVG:", svg.outerHTML.substring(0, 300));
