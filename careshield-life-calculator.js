(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  var state = {
    age: 30,
    gender: "male",
    sgPlan: "standard",
    sgPayTo: 69,
    sgBenefit: 1000
  };

  // --- Singlife CareShield Supplement lookup ---
  // Indicative Singlife online direct-channel rates, collected 17 Oct 2026
  // (no existing-policyholder offer). Reproduces all 288 collected quotes to
  // within S$0.02 for any age next birthday (ANB) 31-65 and any monthly
  // benefit S$200-5,000 in S$100 steps.

  // Annual premium BEFORE discount at S$1,000/month benefit, S$ incl. GST.
  // Key = plan(S|P) + gender(M|F) + ANB + "_" + payUntil(69|99), e.g. "SM46_99"
  var SL_RATE_1000 = {"PF31_69":906.99,"PF31_99":615.41,"PF32_69":947.21,"PF32_99":637.54,"PF33_69":989.72,"PF33_99":660.76,"PF34_69":1036.59,"PF34_99":685.07,"PF35_69":1086.84,"PF35_99":711.66,"PF36_69":1140.36,"PF36_99":739.13,"PF37_69":1200.2,"PF37_99":768.23,"PF38_69":1264.62,"PF38_99":799.52,"PF39_69":1334.6,"PF39_99":832.87,"PF40_69":1410.24,"PF40_99":867.53,"PF41_69":1494.83,"PF41_99":905.25,"PF42_69":1585.84,"PF42_99":943.5,"PF43_69":1685.69,"PF43_99":985.14,"PF44_69":1796.76,"PF44_99":1028.85,"PF45_69":1920.8,"PF45_99":1075.83,"PF46_69":2060.43,"PF46_99":1126.08,"PF47_69":2225.13,"PF47_99":1182.32,"PF48_69":2412.28,"PF48_99":1243.04,"PF49_69":2628.64,"PF49_99":1308.0,"PF50_69":2710.07,"PF50_99":1377.32,"PF51_69":2793.78,"PF51_99":1451.01,"PF52_69":2885.12,"PF52_99":1532.54,"PF53_69":2984.53,"PF53_99":1621.16,"PF54_69":3090.15,"PF54_99":1715.88,"PF55_69":3205.25,"PF55_99":1821.28,"PF56_69":3330.06,"PF56_99":1935.19,"PF57_69":3465.11,"PF57_99":2060.75,"PF58_69":3613.35,"PF58_99":2199.51,"PF59_69":3777.5,"PF59_99":2352.98,"PF60_69":3960.08,"PF60_99":2525.97,"PF61_69":4164.89,"PF61_99":2718.9,"PF62_69":4394.66,"PF62_99":2936.24,"PF63_69":4656.37,"PF63_99":3185.2,"PF64_69":4959.61,"PF64_99":3471.76,"PF65_69":5314.51,"PF65_99":3805.74,"PM31_69":730.63,"PM31_99":493.77,"PM32_69":762.78,"PM32_99":510.34,"PM33_69":796.14,"PM33_99":528.0,"PM34_69":832.76,"PM34_99":546.74,"PM35_69":871.56,"PM35_99":566.58,"PM36_69":913.86,"PM36_99":587.51,"PM37_69":960.4,"PM37_99":609.96,"PM38_69":1010.43,"PM38_99":633.62,"PM39_69":1065.91,"PM39_99":659.45,"PM40_69":1125.86,"PM40_99":686.26,"PM41_69":1191.26,"PM41_99":715.37,"PM42_69":1264.51,"PM42_99":745.34,"PM43_69":1344.41,"PM43_99":778.59,"PM44_69":1434.11,"PM44_99":813.03,"PM45_69":1533.96,"PM45_99":849.55,"PM46_69":1645.9,"PM46_99":889.33,"PM47_69":1772.23,"PM47_99":931.73,"PM48_69":1917.2,"PM48_99":978.38,"PM49_69":2083.21,"PM49_99":1027.33,"PM50_69":2147.08,"PM50_99":1080.74,"PM51_69":2214.34,"PM51_99":1137.31,"PM52_69":2286.17,"PM52_99":1199.44,"PM53_69":2362.25,"PM53_99":1266.04,"PM54_69":2445.2,"PM54_99":1338.3,"PM55_69":2534.69,"PM55_99":1417.0,"PM56_69":2631.04,"PM56_99":1503.55,"PM57_69":2734.92,"PM57_99":1597.83,"PM58_69":2849.91,"PM58_99":1701.93,"PM59_69":2975.92,"PM59_99":1815.83,"PM60_69":3114.24,"PM60_99":1943.03,"PM61_69":3268.04,"PM61_99":2084.52,"PM62_69":3439.71,"PM62_99":2243.77,"PM63_69":3632.53,"PM63_99":2421.54,"PM64_69":3851.73,"PM64_99":2623.63,"PM65_69":4103.2,"PM65_99":2853.08,"SF31_69":754.61,"SF31_99":514.04,"SF32_69":787.63,"SF32_99":531.38,"SF33_69":824.04,"SF33_99":550.89,"SF34_69":862.63,"SF34_99":571.49,"SF35_69":903.5,"SF35_99":593.07,"SF36_69":948.74,"SF36_99":615.85,"SF37_69":998.33,"SF37_99":640.38,"SF38_69":1051.41,"SF38_99":665.99,"SF39_69":1110.17,"SF39_99":693.79,"SF40_69":1174.37,"SF40_99":723.76,"SF41_69":1244.24,"SF41_99":754.83,"SF42_69":1325.0,"SF42_99":790.03,"SF43_69":1415.26,"SF43_99":826.22,"SF44_69":1514.01,"SF44_99":865.79,"SF45_69":1625.84,"SF45_99":907.43,"SF46_69":1750.98,"SF46_99":951.35,"SF47_69":1892.02,"SF47_99":999.53,"SF48_69":2053.56,"SF48_99":1050.0,"SF49_69":2239.51,"SF49_99":1103.73,"SF50_69":2303.5,"SF50_99":1161.83,"SF51_69":2370.1,"SF51_99":1224.18,"SF52_69":2450.54,"SF52_99":1293.61,"SF53_69":2536.21,"SF53_99":1369.15,"SF54_69":2629.3,"SF54_99":1450.9,"SF55_69":2728.92,"SF55_99":1540.28,"SF56_69":2838.8,"SF56_99":1639.69,"SF57_69":2956.95,"SF57_99":1747.6,"SF58_69":3086.88,"SF58_99":1867.06,"SF59_69":3231.2,"SF59_99":2000.59,"SF60_69":3392.95,"SF60_99":2149.81,"SF61_69":3574.11,"SF61_99":2317.78,"SF62_69":3779.03,"SF62_99":2508.09,"SF63_69":4015.56,"SF63_99":2727.62,"SF64_69":4290.02,"SF64_99":2981.59,"SF65_69":4616.26,"SF65_99":3279.37,"SM31_69":608.22,"SM31_99":414.75,"SM32_69":634.27,"SM32_99":428.59,"SM33_69":663.59,"SM33_99":443.52,"SM34_69":694.0,"SM34_99":460.63,"SM35_69":726.59,"SM35_99":476.66,"SM36_69":762.56,"SM36_99":494.86,"SM37_69":802.24,"SM37_99":514.48,"SM38_69":845.19,"SM38_99":535.19,"SM39_69":891.29,"SM39_99":556.88,"SM40_69":941.87,"SM40_99":579.77,"SM41_69":996.91,"SM41_99":603.75,"SM42_69":1059.26,"SM42_99":630.35,"SM43_69":1127.06,"SM43_99":659.01,"SM44_69":1202.6,"SM44_99":688.88,"SM45_69":1286.85,"SM45_99":719.84,"SM46_69":1382.23,"SM46_99":754.06,"SM47_69":1492.76,"SM47_99":792.54,"SM48_69":1619.2,"SM48_99":834.4,"SM49_69":1764.06,"SM49_99":878.43,"SM50_69":1822.04,"SM50_99":924.65,"SM51_69":1880.8,"SM51_99":975.11,"SM52_69":1943.03,"SM52_99":1029.07,"SM53_69":2010.07,"SM53_99":1088.8,"SM54_69":2081.79,"SM54_99":1152.13,"SM55_69":2160.49,"SM55_99":1221.45,"SM56_69":2244.2,"SM56_99":1298.08,"SM57_69":2335.65,"SM57_99":1381.36,"SM58_69":2436.59,"SM58_99":1473.03,"SM59_69":2546.89,"SM59_99":1574.4,"SM60_69":2669.08,"SM60_99":1687.43,"SM61_69":2804.35,"SM61_99":1813.76,"SM62_69":2955.54,"SM62_99":1954.81,"SM63_69":3125.68,"SM63_99":2115.04,"SM64_69":3319.7,"SM64_99":2295.87,"SM65_69":3542.39,"SM65_99":2502.1};

  // Fixed adjustment (S$/yr, before GST) for benefits under S$1,000, by pay-until age
  var SL_SMALL_ADJ = {"69":{"200":92,"300":78,"400":64,"500":55,"600":30,"700":35,"800":40,"900":45},"99":{"200":58,"300":48,"400":40,"500":30,"600":18,"700":21,"800":24,"900":27}};

  var SL_GST = 0.09;

  var CSL_PAYOUT_2026 = 689; // CareShield Life base monthly payout

  function slAdjustment(benefit, payUntil) {
    if (benefit < 1000) return SL_SMALL_ADJ[payUntil][benefit];
    if (benefit < 2000) return 0;
    if (benefit < 3000) return -(payUntil === 69 ? 0.02 : 0.01) * benefit;
    return -(payUntil === 69 ? 0.03 : 0.02) * benefit;
  }

  function slDiscount(gross) {
    return gross < 500 ? 0 : gross < 1000 ? 0.20 : gross < 1500 ? 0.25 : 0.35;
  }

  // plan: "S" | "P"; gender: "M" | "F"; age: current age; payUntil: 69 | 99; benefit: 200..5000 step 100
  function singlifeQuote(plan, gender, age, payUntil, benefit) {
    var anb = age + 1;
    if (anb < 31 || anb > 65) return { unavailable: true };
    var rate = SL_RATE_1000[plan + gender + anb + "_" + payUntil];
    var gross = Math.round((rate * benefit / 1000 + (1 + SL_GST) * slAdjustment(benefit, payUntil)) * 100) / 100;
    var d = slDiscount(gross);
    var net = Math.round(gross * (1 - d) * 100) / 100;
    return { anb: anb, gross: gross, discount: d, net: net, cash: Math.max(0, net - 600) };
  }

  // Highest monthly benefit whose after-discount premium stays under S$600 (null = none)
  function singlifeMaxUnder600(plan, gender, age, payUntil) {
    var best = null;
    for (var b = 200; b <= 5000; b += 100) {
      var q = singlifeQuote(plan, gender, age, payUntil, b);
      if (q.unavailable) return null;
      if (q.net < 600) best = b;
    }
    return best;
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
    var plan = state.sgPlan === "plus" ? "P" : "S";
    var genderCode = state.gender === "female" ? "F" : "M";
    var benefit = state.sgBenefit;
    var q = singlifeQuote(plan, genderCode, age, state.sgPayTo, benefit);

    var resultBox = $("sg-result-box");
    var maxNote = $("sg-max-note");
    var unavailBox = $("sg-unavailable-note");

    $("v-benefit").textContent = fmtSGD0(benefit);

    if (q.unavailable) {
      resultBox.style.display = "none";
      maxNote.style.display = "none";
      unavailBox.style.display = "block";
      unavailBox.innerHTML = "<strong>Not available at this age.</strong> Singlife CareShield is available from age next birthday 31 to 65.";
      return;
    }

    unavailBox.style.display = "none";
    resultBox.style.display = "block";
    maxNote.style.display = "block";

    $("sg-benefit-val").textContent = fmtSGD0(benefit) + "/mo";
    $("sg-total-val").textContent = fmtSGD0(benefit + CSL_PAYOUT_2026) + "/mo";
    $("sg-gross").textContent = fmtSGD(q.gross) + "/yr";
    $("sg-discount").textContent = q.discount ? Math.round(q.discount * 100) + "%" : "None";
    $("sg-net").textContent = fmtSGD(q.net) + "/yr";
    $("sg-cash").textContent = fmtSGD(q.cash) + "/yr";

    var maxB = singlifeMaxUnder600(plan, genderCode, age, state.sgPayTo);
    maxNote.innerHTML = maxB
      ? "Highest benefit fully payable by MediSave at age next birthday " + q.anb + ": <strong>" + fmtSGD0(maxB) + "/month</strong>"
      : "Highest benefit fully payable by MediSave at age next birthday " + q.anb + ": <strong>none</strong>. Even S$200 a month costs more than S$600 a year.";
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
    var benefitInput = $("sg-benefit");
    benefitInput.addEventListener("input", function () {
      state.sgBenefit = parseInt(benefitInput.value, 10);
      render();
    });

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
