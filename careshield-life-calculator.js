(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  var state = {
    age: 30,
    gender: "male",
    sgPlan: "standard",
    sgPayTo: 69,
    sgBenefit: "b1000"
  };

  // --- Singlife CareShield Supplement lookup ---
  // Indicative Singlife online direct-channel rates, collected 17 Oct 2026
  // (non-smoker not asked; no existing-policyholder offer). gross = annual
  // premium before discount, net = after Singlife's automatic online
  // discount. Keyed by age next birthday (ANB) at 35/40/45/50/55/60/65 only
  // -- see pickAnb() for how an entered age maps onto these points.
  var SINGLIFE_CARESHIELD_RATES = [{"plan":"standard","gender":"M","anb":35,"payTo":69,"maxUnder600":{"benefit":1000,"gross":726.59,"net":581.28},"b1000":{"gross":726.59,"net":581.28},"b1500":{"gross":1089.89,"net":817.42},"b2000":{"gross":1409.59,"net":1057.19}},{"plan":"standard","gender":"M","anb":35,"payTo":99,"maxUnder600":{"benefit":1500,"gross":714.99,"net":571.99},"b1000":{"gross":476.66,"net":476.66},"b1500":{"gross":714.99,"net":571.99},"b2000":{"gross":931.51,"net":745.21}},{"plan":"standard","gender":"M","anb":40,"payTo":69,"maxUnder600":{"benefit":700,"gross":697.46,"net":557.97},"b1000":{"gross":941.87,"net":753.5},"b1500":{"gross":1412.8,"net":1059.6},"b2000":{"gross":1840.14,"net":1196.09}},{"plan":"standard","gender":"M","anb":40,"payTo":99,"maxUnder600":{"benefit":1200,"gross":695.73,"net":556.58},"b1000":{"gross":579.77,"net":463.82},"b1500":{"gross":869.66,"net":695.73},"b2000":{"gross":1137.74,"net":853.31}},{"plan":"standard","gender":"M","anb":45,"payTo":69,"maxUnder600":{"benefit":500,"gross":703.38,"net":562.7},"b1000":{"gross":1286.85,"net":965.14},"b1500":{"gross":1930.28,"net":1254.69},"b2000":{"gross":2530.11,"net":1644.57}},{"plan":"standard","gender":"M","anb":45,"payTo":99,"maxUnder600":{"benefit":1000,"gross":719.84,"net":575.87},"b1000":{"gross":719.84,"net":575.87},"b1500":{"gross":1079.75,"net":809.82},"b2000":{"gross":1417.87,"net":1063.4}},{"plan":"standard","gender":"M","anb":50,"payTo":69,"maxUnder600":{"benefit":300,"gross":631.63,"net":505.3},"b1000":{"gross":1822.04,"net":1184.33},"b1500":{"gross":2733.07,"net":1776.49},"b2000":{"gross":3600.49,"net":2340.32}},{"plan":"standard","gender":"M","anb":50,"payTo":99,"maxUnder600":{"benefit":700,"gross":670.14,"net":536.12},"b1000":{"gross":924.65,"net":739.72},"b1500":{"gross":1386.97,"net":1040.23},"b2000":{"gross":1827.49,"net":1187.87}},{"plan":"standard","gender":"M","anb":55,"payTo":69,"maxUnder600":{"benefit":300,"gross":733.17,"net":586.53},"b1000":{"gross":2160.49,"net":1404.32},"b1500":{"gross":3240.73,"net":2106.48},"b2000":{"gross":4277.38,"net":2780.3}},{"plan":"standard","gender":"M","anb":55,"payTo":99,"maxUnder600":{"benefit":500,"gross":643.43,"net":514.74},"b1000":{"gross":1221.45,"net":916.09},"b1500":{"gross":1832.18,"net":1190.92},"b2000":{"gross":2421.11,"net":1573.72}},{"plan":"standard","gender":"M","anb":60,"payTo":69,"maxUnder600":{"benefit":200,"gross":634.1,"net":507.28},"b1000":{"gross":2669.08,"net":1734.91},"b1500":{"gross":4003.62,"net":2602.36},"b2000":{"gross":5294.57,"net":3441.47}},{"plan":"standard","gender":"M","anb":60,"payTo":99,"maxUnder600":{"benefit":400,"gross":718.57,"net":574.86},"b1000":{"gross":1687.43,"net":1096.82},"b1500":{"gross":2531.14,"net":1645.25},"b2000":{"gross":3353.06,"net":2179.49}},{"plan":"standard","gender":"M","anb":65,"payTo":69,"maxUnder600":null,"b1000":{"gross":3542.39,"net":2302.56},"b1500":{"gross":5313.59,"net":3453.83},"b2000":{"gross":7041.18,"net":4576.77}},{"plan":"standard","gender":"M","anb":65,"payTo":99,"maxUnder600":{"benefit":200,"gross":563.64,"net":450.91},"b1000":{"gross":2502.1,"net":1626.37},"b1500":{"gross":3753.14,"net":2439.54},"b2000":{"gross":4982.39,"net":3238.55}},{"plan":"standard","gender":"F","anb":35,"payTo":69,"maxUnder600":{"benefit":700,"gross":670.6,"net":536.48},"b1000":{"gross":903.5,"net":722.8},"b1500":{"gross":1355.25,"net":1016.44},"b2000":{"gross":1763.4,"net":1146.21}},{"plan":"standard","gender":"F","anb":35,"payTo":99,"maxUnder600":{"benefit":1200,"gross":711.68,"net":569.35},"b1000":{"gross":593.07,"net":474.46},"b1500":{"gross":889.6,"net":711.68},"b2000":{"gross":1164.34,"net":873.25}},{"plan":"standard","gender":"F","anb":40,"payTo":69,"maxUnder600":{"benefit":600,"gross":737.32,"net":589.85},"b1000":{"gross":1174.37,"net":880.77},"b1500":{"gross":1761.55,"net":1145.01},"b2000":{"gross":2305.13,"net":1498.34}},{"plan":"standard","gender":"F","anb":40,"payTo":99,"maxUnder600":{"benefit":1000,"gross":723.76,"net":579.01},"b1000":{"gross":723.76,"net":579.01},"b1500":{"gross":1085.64,"net":814.24},"b2000":{"gross":1425.72,"net":1069.29}},{"plan":"standard","gender":"F","anb":45,"payTo":69,"maxUnder600":{"benefit":400,"gross":720.1,"net":576.08},"b1000":{"gross":1625.84,"net":1056.8},"b1500":{"gross":2438.77,"net":1585.2},"b2000":{"gross":3208.09,"net":2085.26}},{"plan":"standard","gender":"F","anb":45,"payTo":99,"maxUnder600":{"benefit":700,"gross":658.09,"net":526.47},"b1000":{"gross":907.43,"net":725.94},"b1500":{"gross":1361.14,"net":1020.86},"b2000":{"gross":1793.05,"net":1165.48}},{"plan":"standard","gender":"F","anb":50,"payTo":69,"maxUnder600":{"benefit":200,"gross":560.98,"net":448.79},"b1000":{"gross":2303.5,"net":1497.28},"b1500":{"gross":3455.25,"net":2245.91},"b2000":{"gross":4563.39,"net":2966.21}},{"plan":"standard","gender":"F","anb":50,"payTo":99,"maxUnder600":{"benefit":600,"gross":716.72,"net":573.37},"b1000":{"gross":1161.83,"net":871.38},"b1500":{"gross":1742.75,"net":1132.78},"b2000":{"gross":2301.86,"net":1496.21}},{"plan":"standard","gender":"F","anb":55,"payTo":69,"maxUnder600":{"benefit":200,"gross":646.06,"net":516.86},"b1000":{"gross":2728.92,"net":1773.8},"b1500":{"gross":4093.39,"net":2660.71},"b2000":{"gross":5414.25,"net":3519.26}},{"plan":"standard","gender":"F","anb":55,"payTo":99,"maxUnder600":{"benefit":400,"gross":659.71,"net":527.77},"b1000":{"gross":1540.28,"net":1001.18},"b1500":{"gross":2310.42,"net":1501.78},"b2000":{"gross":3058.76,"net":1988.19}},{"plan":"standard","gender":"F","anb":60,"payTo":69,"maxUnder600":null,"b1000":{"gross":3392.95,"net":2205.42},"b1500":{"gross":5089.43,"net":3308.14},"b2000":{"gross":6742.3,"net":4382.5}},{"plan":"standard","gender":"F","anb":60,"payTo":99,"maxUnder600":{"benefit":300,"gross":697.26,"net":557.81},"b1000":{"gross":2149.81,"net":1397.38},"b1500":{"gross":3224.71,"net":2096.06},"b2000":{"gross":4277.81,"net":2780.58}},{"plan":"standard","gender":"F","anb":65,"payTo":69,"maxUnder600":null,"b1000":{"gross":4616.26,"net":3000.57},"b1500":{"gross":6924.39,"net":4500.85},"b2000":{"gross":9188.92,"net":5972.8}},{"plan":"standard","gender":"F","anb":65,"payTo":99,"maxUnder600":{"benefit":200,"gross":719.09,"net":575.28},"b1000":{"gross":3279.37,"net":2131.59},"b1500":{"gross":4919.06,"net":3197.4},"b2000":{"gross":6536.95,"net":4249.02}},{"plan":"plus","gender":"M","anb":35,"payTo":69,"maxUnder600":{"benefit":800,"gross":740.85,"net":592.68},"b1000":{"gross":871.56,"net":697.25},"b1500":{"gross":1307.35,"net":980.52},"b2000":{"gross":1699.53,"net":1104.69}},{"plan":"plus","gender":"M","anb":35,"payTo":99,"maxUnder600":{"benefit":1300,"gross":736.56,"net":589.24},"b1000":{"gross":566.58,"net":453.27},"b1500":{"gross":849.87,"net":679.9},"b2000":{"gross":1111.36,"net":833.52}},{"plan":"plus","gender":"M","anb":40,"payTo":69,"maxUnder600":{"benefit":600,"gross":708.22,"net":566.57},"b1000":{"gross":1125.86,"net":844.4},"b1500":{"gross":1688.79,"net":1097.72},"b2000":{"gross":2208.12,"net":1435.28}},{"plan":"plus","gender":"M","anb":40,"payTo":99,"maxUnder600":{"benefit":1000,"gross":686.26,"net":549.01},"b1000":{"gross":686.26,"net":549.01},"b1500":{"gross":1029.4,"net":772.05},"b2000":{"gross":1350.73,"net":1013.05}},{"plan":"plus","gender":"M","anb":45,"payTo":69,"maxUnder600":{"benefit":400,"gross":683.34,"net":546.68},"b1000":{"gross":1533.96,"net":997.08},"b1500":{"gross":2300.94,"net":1495.61},"b2000":{"gross":3024.31,"net":1965.8}},{"plan":"plus","gender":"M","anb":45,"payTo":99,"maxUnder600":{"benefit":800,"gross":705.8,"net":564.64},"b1000":{"gross":849.55,"net":679.64},"b1500":{"gross":1274.32,"net":955.74},"b2000":{"gross":1677.29,"net":1090.24}},{"plan":"plus","gender":"M","anb":50,"payTo":69,"maxUnder600":{"benefit":300,"gross":729.14,"net":583.31},"b1000":{"gross":2147.08,"net":1395.6},"b1500":{"gross":3220.62,"net":2093.41},"b2000":{"gross":4250.56,"net":2762.87}},{"plan":"plus","gender":"M","anb":50,"payTo":99,"maxUnder600":{"benefit":600,"gross":668.06,"net":534.45},"b1000":{"gross":1080.74,"net":810.56},"b1500":{"gross":1621.1,"net":1053.72},"b2000":{"gross":2139.67,"net":1390.79}},{"plan":"plus","gender":"M","anb":55,"payTo":69,"maxUnder600":{"benefit":200,"gross":607.22,"net":485.77},"b1000":{"gross":2534.69,"net":1647.55},"b1500":{"gross":3802.03,"net":2471.32},"b2000":{"gross":5025.77,"net":3266.75}},{"plan":"plus","gender":"M","anb":55,"payTo":99,"maxUnder600":{"benefit":500,"gross":741.2,"net":592.96},"b1000":{"gross":1417.0,"net":1062.75},"b1500":{"gross":2125.5,"net":1381.58},"b2000":{"gross":2812.2,"net":1827.93}},{"plan":"plus","gender":"M","anb":60,"payTo":69,"maxUnder600":{"benefit":200,"gross":723.13,"net":578.51},"b1000":{"gross":3114.24,"net":2024.26},"b1500":{"gross":4671.36,"net":3036.38},"b2000":{"gross":6184.88,"net":4020.17}},{"plan":"plus","gender":"M","anb":60,"payTo":99,"maxUnder600":{"benefit":300,"gross":635.23,"net":508.18},"b1000":{"gross":1943.03,"net":1262.97},"b1500":{"gross":2914.55,"net":1894.46},"b2000":{"gross":3864.27,"net":2511.77}},{"plan":"plus","gender":"M","anb":65,"payTo":69,"maxUnder600":null,"b1000":{"gross":4103.2,"net":2667.08},"b1500":{"gross":6154.79,"net":4000.62},"b2000":{"gross":8162.79,"net":5305.81}},{"plan":"plus","gender":"M","anb":65,"payTo":99,"maxUnder600":{"benefit":200,"gross":633.84,"net":507.07},"b1000":{"gross":2853.08,"net":1854.5},"b1500":{"gross":4279.61,"net":2781.76},"b2000":{"gross":5684.35,"net":3694.83}},{"plan":"plus","gender":"F","anb":35,"payTo":69,"maxUnder600":{"benefit":600,"gross":684.8,"net":547.84},"b1000":{"gross":1086.84,"net":815.13},"b1500":{"gross":1630.26,"net":1059.67},"b2000":{"gross":2130.08,"net":1384.55}},{"plan":"plus","gender":"F","anb":35,"payTo":99,"maxUnder600":{"benefit":1000,"gross":711.66,"net":569.33},"b1000":{"gross":711.66,"net":569.33},"b1500":{"gross":1067.49,"net":800.62},"b2000":{"gross":1401.52,"net":1051.14}},{"plan":"plus","gender":"F","anb":40,"payTo":69,"maxUnder600":{"benefit":400,"gross":633.86,"net":507.09},"b1000":{"gross":1410.24,"net":1057.68},"b1500":{"gross":2115.36,"net":1374.99},"b2000":{"gross":2776.88,"net":1804.97}},{"plan":"plus","gender":"F","anb":40,"payTo":99,"maxUnder600":{"benefit":800,"gross":720.18,"net":576.15},"b1000":{"gross":867.53,"net":694.02},"b1500":{"gross":1301.3,"net":975.98},"b2000":{"gross":1713.26,"net":1113.62}},{"plan":"plus","gender":"F","anb":45,"payTo":69,"maxUnder600":{"benefit":300,"gross":661.26,"net":529.01},"b1000":{"gross":1920.8,"net":1248.52},"b1500":{"gross":2881.2,"net":1872.78},"b2000":{"gross":3798.0,"net":2468.7}},{"plan":"plus","gender":"F","anb":45,"payTo":99,"maxUnder600":{"benefit":600,"gross":665.12,"net":532.09},"b1000":{"gross":1075.83,"net":806.87},"b1500":{"gross":1613.75,"net":1048.93},"b2000":{"gross":2129.86,"net":1384.41}},{"plan":"plus","gender":"F","anb":50,"payTo":69,"maxUnder600":{"benefit":200,"gross":642.29,"net":513.84},"b1000":{"gross":2710.07,"net":1761.55},"b1500":{"gross":4065.1,"net":2642.32},"b2000":{"gross":5376.53,"net":3494.75}},{"plan":"plus","gender":"F","anb":50,"payTo":99,"maxUnder600":{"benefit":500,"gross":721.36,"net":577.09},"b1000":{"gross":1377.32,"net":1032.99},"b1500":{"gross":2065.99,"net":1342.9},"b2000":{"gross":2732.85,"net":1776.35}},{"plan":"plus","gender":"F","anb":55,"payTo":69,"maxUnder600":{"benefit":200,"gross":741.33,"net":593.07},"b1000":{"gross":3205.25,"net":2083.42},"b1500":{"gross":4807.88,"net":3125.13},"b2000":{"gross":6366.91,"net":4138.49}},{"plan":"plus","gender":"F","anb":55,"payTo":99,"maxUnder600":{"benefit":300,"gross":598.7,"net":478.97},"b1000":{"gross":1821.28,"net":1183.84},"b1500":{"gross":2731.92,"net":1775.75},"b2000":{"gross":3620.76,"net":2353.5}},{"plan":"plus","gender":"F","anb":60,"payTo":69,"maxUnder600":null,"b1000":{"gross":3960.08,"net":2574.06},"b1500":{"gross":5940.12,"net":3861.07},"b2000":{"gross":7876.56,"net":5119.76}},{"plan":"plus","gender":"F","anb":60,"payTo":99,"maxUnder600":{"benefit":200,"gross":568.41,"net":454.73},"b1000":{"gross":2525.97,"net":1641.88},"b1500":{"gross":3788.95,"net":2462.82},"b2000":{"gross":5030.13,"net":3269.59}},{"plan":"plus","gender":"F","anb":65,"payTo":69,"maxUnder600":null,"b1000":{"gross":5314.51,"net":3454.44},"b1500":{"gross":7971.77,"net":5181.65},"b2000":{"gross":10585.43,"net":6880.53}},{"plan":"plus","gender":"F","anb":65,"payTo":99,"maxUnder600":null,"b1000":{"gross":3805.74,"net":2473.73},"b1500":{"gross":5708.6,"net":3710.6},"b2000":{"gross":7589.67,"net":4933.29}}];

  var CSL_PAYOUT_2026 = 689; // CareShield Life base monthly payout

  var ANB_POINTS = [35, 40, 45, 50, 55, 60, 65];

  function pickAnb(age) {
    var anb = age + 1;
    if (anb < 31 || anb > 65) return null;
    for (var i = 0; i < ANB_POINTS.length; i++) {
      if (ANB_POINTS[i] >= anb) return ANB_POINTS[i];
    }
    return 65;
  }

  function singlifeQuote(age, gender, plan, payTo, benefitKey) {
    // gender: 'M' | 'F'; plan: 'standard' | 'plus'; payTo: 69 | 99
    // benefitKey: 'b1000' | 'b1500' | 'b2000' | 'max'
    var anb = pickAnb(age);
    if (!anb) return { unavailable: true };
    var row = null;
    for (var i = 0; i < SINGLIFE_CARESHIELD_RATES.length; i++) {
      var r = SINGLIFE_CARESHIELD_RATES[i];
      if (r.plan === plan && r.gender === gender && r.anb === anb && r.payTo === payTo) {
        row = r;
        break;
      }
    }
    if (!row) return { unavailable: true };
    if (benefitKey === "max") {
      if (!row.maxUnder600) return { anb: anb, noneUnder600: true };
      var m = row.maxUnder600;
      return { anb: anb, benefit: m.benefit, gross: m.gross, net: m.net, cash: Math.max(0, m.net - 600) };
    }
    var b = row[benefitKey];
    return { anb: anb, benefit: Number(benefitKey.slice(1)), gross: b.gross, net: b.net, cash: Math.max(0, b.net - 600) };
  }

  function fmtSGD(n) {
    return "S$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtSGD0(n) {
    return "S$" + Math.round(n).toLocaleString("en-US");
  }

  function setupPillGroup(groupId, dataAttr, onChange) {
    var group = $(groupId);
    if (!group) return;
    group.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        group.querySelectorAll("button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        onChange(btn.getAttribute(dataAttr));
      });
    });
  }

  function renderSinglife() {
    var age = state.age;
    var genderCode = state.gender === "female" ? "F" : "M";
    var q = singlifeQuote(age, genderCode, state.sgPlan, state.sgPayTo, state.sgBenefit);

    var resultBox = $("sg-result-box");
    var anbNote = $("sg-anb-note");
    var unavailBox = $("sg-unavailable-note");

    if (q.unavailable) {
      resultBox.style.display = "none";
      anbNote.style.display = "none";
      unavailBox.style.display = "block";
      unavailBox.innerHTML = "<strong>Not available at this age.</strong> Singlife CareShield is available from age next birthday 31 to 65.";
      return;
    }

    if (state.sgBenefit === "max" && q.noneUnder600) {
      resultBox.style.display = "none";
      unavailBox.style.display = "none";
      anbNote.style.display = "block";
      anbNote.textContent = "Even the S$200 minimum costs more than S$600 a year at this age on this term.";
      return;
    }

    unavailBox.style.display = "none";
    resultBox.style.display = "block";

    $("sg-benefit-val").textContent = fmtSGD0(q.benefit) + "/mo";
    $("sg-total-val").textContent = fmtSGD0(q.benefit + CSL_PAYOUT_2026) + "/mo";
    $("sg-gross").textContent = fmtSGD(q.gross) + "/yr";
    $("sg-net").textContent = fmtSGD(q.net) + "/yr";
    $("sg-cash").textContent = fmtSGD(q.cash) + "/yr";

    var trueAnb = age + 1;
    anbNote.style.display = "block";
    anbNote.textContent = trueAnb === q.anb
      ? "Rate shown for age next birthday " + q.anb + "."
      : "Rate shown for age next birthday " + q.anb + " (nearest published point at or above your age next birthday of " + trueAnb + ").";
  }

  function render() {
    var gender = state.gender;

    $("v-age").textContent = state.age;

    // Supplement table gender highlight
    var table = $("supplement-table");
    if (table) {
      table.querySelectorAll("th[data-g], td[data-g]").forEach(function (cell) {
        cell.classList.remove("hl");
      });
      table.querySelectorAll('[data-g="' + gender + '"]').forEach(function (cell) {
        cell.classList.add("hl");
      });
    }

    renderSinglife();
  }

  function init() {
    var ageInput = $("age");
    ageInput.addEventListener("input", function () {
      state.age = parseInt(ageInput.value, 10);
      render();
    });

    setupPillGroup("gender-group", "data-gender", function (v) { state.gender = v; render(); });
    setupPillGroup("sg-plan-group", "data-sgplan", function (v) { state.sgPlan = v; render(); });
    setupPillGroup("sg-payto-group", "data-sgpayto", function (v) { state.sgPayTo = parseInt(v, 10); render(); });
    setupPillGroup("sg-benefit-group", "data-sgbenefit", function (v) { state.sgBenefit = v; render(); });

    function showStep(n) {
      $("step-1").hidden = n !== 1;
      $("step-2").hidden = n !== 2;
      $("step-" + n).scrollIntoView({ behavior: "smooth", block: "start" });
    }
    $("btn-next").addEventListener("click", function () { showStep(2); });
    $("btn-back").addEventListener("click", function () { showStep(1); });

    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
