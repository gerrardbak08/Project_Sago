const w = window.innerWidth;
const docW = document.documentElement.scrollWidth;
const bodyW = document.body.scrollWidth;
const wide = [];
document.querySelectorAll('*').forEach(el => {
  const r = el.getBoundingClientRect();
  if (r.right > w + 1 || r.width > w + 1) {
    wide.push({
      tag: el.tagName,
      cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().slice(0,90),
      w: Math.round(r.width), right: Math.round(r.right), left: Math.round(r.left)
    });
  }
});
console.log(JSON.stringify({viewport:w, docW, bodyW, overflowCount: wide.length, offenders: wide.slice(0,25)}, null, 1));
