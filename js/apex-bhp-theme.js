/* BHP ApexCharts theme.
   A reusable, gradient-forward chart theme anchored on BHP Orange (#E65400).
   Exposes window.BHPApex with one helper per chart type. Each helper returns an
   ApexCharts options object already merged with shared brand defaults, so the
   dashboard can do:  new ApexCharts(el, BHPApex.area({ series, categories })).

   Palette and tokens mirror css/brand-tokens.css. Orange leads, teal complements. */
(function (global) {
  "use strict";

  // --- Brand tokens (keep in sync with css/brand-tokens.css) ---
  var ORANGE       = "#E65400";
  var ORANGE_HOVER = "#FF6A1A";
  var ORANGE_LIGHT = "#FF8A4D";
  var ORANGE_TINT  = "#FFB489";
  var TEAL         = "#0E7C86";
  var TEAL_LIGHT   = "#3FA9B3";
  var INK          = "#0B1F2A";
  var SLATE        = "#3D4F5C";
  var GREY         = "#6B7B86";
  var GRID         = "#E4E1DC";

  // Categorical series palette: orange and teal lead, then supporting tones.
  var PALETTE = [ORANGE, TEAL, ORANGE_LIGHT, TEAL_LIGHT, "#A63D00", SLATE];

  // --- Shared defaults applied to every chart ---
  function base() {
    return {
      chart: {
        fontFamily: "Arial, Helvetica, sans-serif",
        foreColor: INK,
        toolbar: { show: false },
        animations: { enabled: true, easing: "easeinout", speed: 650 }
      },
      colors: PALETTE.slice(),
      grid: { borderColor: GRID, strokeDashArray: 4, padding: { left: 8, right: 8 } },
      dataLabels: { enabled: false },
      legend: { position: "bottom", fontSize: "12px", labels: { colors: INK }, markers: { radius: 3 } },
      tooltip: { theme: "light", style: { fontFamily: "Arial, Helvetica, sans-serif" } },
      stroke: { curve: "smooth" },
      xaxis: { axisBorder: { color: GRID }, axisTicks: { color: GRID }, labels: { style: { colors: GREY } } },
      yaxis: { labels: { style: { colors: GREY } } }
    };
  }

  // --- Gradient builders ---
  // Vertical fade for area/sparkline: brand orange at top down to near-transparent.
  function areaFill() {
    return {
      type: "gradient",
      gradient: {
        shade: "light", type: "vertical", shadeIntensity: 0.3,
        gradientToColors: [ORANGE_LIGHT, TEAL_LIGHT],
        inverseColors: false, opacityFrom: 0.55, opacityTo: 0.05, stops: [0, 95]
      }
    };
  }
  // Horizontal gradient applied to a line's stroke (Apex applies fill gradient to line strokes).
  function lineFill() {
    return {
      type: "gradient",
      gradient: {
        type: "horizontal", shadeIntensity: 1,
        gradientToColors: [ORANGE_LIGHT, TEAL_LIGHT],
        inverseColors: false, opacityFrom: 1, opacityTo: 1, stops: [0, 100]
      }
    };
  }
  // Vertical column gradient: deep orange base brightening toward the top.
  function barFill() {
    return {
      type: "gradient",
      gradient: {
        shade: "light", type: "vertical", shadeIntensity: 0.35,
        gradientToColors: [ORANGE_LIGHT, TEAL_LIGHT],
        inverseColors: false, opacityFrom: 1, opacityTo: 0.9, stops: [0, 100]
      }
    };
  }
  // Horizontal bar gradient: deep orange at the base (left) brightening toward the tip (right).
  function barFillH() {
    return {
      type: "gradient",
      gradient: {
        shade: "light", type: "horizontal", shadeIntensity: 0.35,
        gradientToColors: [ORANGE_LIGHT, TEAL_LIGHT],
        inverseColors: false, opacityFrom: 1, opacityTo: 0.9, stops: [0, 100]
      }
    };
  }
  // Radial/gauge gradient sweep.
  function radialFill() {
    return {
      type: "gradient",
      gradient: {
        shade: "dark", type: "horizontal", shadeIntensity: 0.4,
        gradientToColors: [ORANGE_LIGHT], inverseColors: false,
        opacityFrom: 1, opacityTo: 1, stops: [0, 100]
      }
    };
  }

  // --- Small deep-ish merge (objects only; arrays and scalars overwrite) ---
  function merge() {
    var out = {};
    for (var i = 0; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
        var v = src[k];
        if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) {
          out[k] = merge(out[k], v);
        } else {
          out[k] = v;
        }
      }
    }
    return out;
  }

  // ===== Per-type helpers =====
  // opts.series, opts.categories, opts.height, opts.extra are honored where relevant.

  function area(o) {
    o = o || {};
    return merge(base(), {
      chart: { type: "area", height: o.height || 280 },
      series: o.series || [],
      xaxis: { categories: o.categories || [] },
      stroke: { curve: "smooth", width: 3 },
      fill: areaFill()
    }, o.extra);
  }

  function line(o) {
    o = o || {};
    return merge(base(), {
      chart: { type: "line", height: o.height || 280 },
      series: o.series || [],
      xaxis: { categories: o.categories || [] },
      stroke: { curve: "smooth", width: 4 },
      fill: lineFill(),
      markers: { size: 0, hover: { size: 5 } }
    }, o.extra);
  }

  // Vertical bars ("column").
  function column(o) {
    o = o || {};
    return merge(base(), {
      chart: { type: "bar", height: o.height || 280 },
      series: o.series || [],
      xaxis: { categories: o.categories || [] },
      plotOptions: { bar: { horizontal: false, borderRadius: 6, borderRadiusApplication: "end", columnWidth: "55%" } },
      fill: barFill()
    }, o.extra);
  }

  // Horizontal bars ("bar").
  function bar(o) {
    o = o || {};
    return merge(base(), {
      chart: { type: "bar", height: o.height || 280 },
      series: o.series || [],
      xaxis: { categories: o.categories || [] },
      plotOptions: { bar: { horizontal: true, borderRadius: 6, borderRadiusApplication: "end", barHeight: "60%" } },
      fill: barFillH()
    }, o.extra);
  }

  // Circular progress (radialBar, full circle).
  function radial(o) {
    o = o || {};
    return merge(base(), {
      chart: { type: "radialBar", height: o.height || 300 },
      series: o.series || [70],
      labels: o.labels || ["FAIR score"],
      plotOptions: {
        radialBar: {
          hollow: { size: "58%" },
          track: { background: "#FFE0CE", strokeWidth: "100%" },
          dataLabels: {
            name: { color: GREY, fontSize: "13px" },
            value: { color: INK, fontSize: "30px", fontWeight: 700 }
          }
        }
      },
      fill: radialFill(),
      stroke: { lineCap: "round" }
    }, o.extra);
  }

  // Semicircle gauge (radialBar, -90 to 90).
  function gauge(o) {
    o = o || {};
    return merge(base(), {
      chart: { type: "radialBar", height: o.height || 260 },
      series: o.series || [62],
      labels: o.labels || ["Coverage"],
      plotOptions: {
        radialBar: {
          startAngle: -90, endAngle: 90,
          hollow: { size: "62%" },
          track: { background: "#FFE0CE", strokeWidth: "100%", margin: 6 },
          dataLabels: {
            name: { color: GREY, fontSize: "13px", offsetY: 70 },
            value: { color: INK, fontSize: "32px", fontWeight: 700, offsetY: 28 }
          }
        }
      },
      fill: radialFill(),
      stroke: { lineCap: "round" }
    }, o.extra);
  }

  // Compact, axis-free trend line with a gradient area fill.
  function sparkline(o) {
    o = o || {};
    return merge(base(), {
      chart: { type: "area", height: o.height || 70, sparkline: { enabled: true } },
      series: o.series || [],
      stroke: { curve: "smooth", width: 2 },
      fill: areaFill(),
      colors: o.color ? [o.color] : [ORANGE],
      tooltip: { theme: "light", fixed: { enabled: false }, x: { show: false } }
    }, o.extra);
  }

  global.BHPApex = {
    palette: PALETTE.slice(),
    tokens: { ORANGE: ORANGE, ORANGE_LIGHT: ORANGE_LIGHT, TEAL: TEAL, TEAL_LIGHT: TEAL_LIGHT, INK: INK, SLATE: SLATE, GREY: GREY, GRID: GRID },
    base: base,
    area: area, line: line, column: column, bar: bar, radial: radial, gauge: gauge, sparkline: sparkline
  };
})(window);
