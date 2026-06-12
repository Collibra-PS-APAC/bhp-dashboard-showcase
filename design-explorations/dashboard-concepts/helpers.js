/* Tiny shared helpers for the dashboard concepts: number formatting, an
   on-load count-up (CountUp-style, reduced-motion aware), and a one-line
   sparkline renderer on the BHPApex theme. No dependencies beyond ApexCharts
   + BHPApex, which each concept already loads. */
window.DUTIL = {
  fmt: function (n) { return Number(n).toLocaleString('en-US'); },

  countUp: function (el, to) {
    el = typeof el === 'string' ? document.querySelector(el) : el;
    if (!el) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { el.textContent = this.fmt(to); return; }
    var dur = 1100, t0 = null, self = this;
    function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min((t - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = self.fmt(Math.round(to * eased));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  },

  spark: function (sel, data, height) {
    if (!window.ApexCharts || !window.BHPApex) return;
    var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!el) return;
    new ApexCharts(el, BHPApex.sparkline({ series: [{ name: 't', data: data }], height: height || 38 })).render();
  }
};
