/* CPF LIFE Retirement Calculator — Provident Financial Planning
 *
 * Illustrative planning tool. NOT affiliated with or a product of the
 * CPF Board. See the on-page disclaimer for the exact methodology.
 *
 * Model summary:
 *  1. Project OA/SA year-by-year from the current age to 55, each with its
 *     own interest rate plus a flat annual contribution.
 *  2. At 55, transfer SA first then OA into a new RA, up to that year's
 *     projected Full Retirement Sum (FRS). Leftover stays in OA.
 *     If "top up to ERS" is on, any leftover OA immediately tops the RA
 *     up to that year's Enhanced Retirement Sum (ERS).
 *  3. From 56 onward, RA earns interest only; OA keeps earning interest
 *     and receiving the same annual contribution. If top-up is on, any
 *     year OA can close the (rising) gap to that year's ERS ceiling, it
 *     does.
 *  4. BRS/FRS/ERS for any calendar year come from CPF Board's own published
 *     cohort schedule (exact through 2027) and, beyond that, an
 *     extrapolation at the "CPF goals grow by" rate — see
 *     COHORT_SCHEDULE / retirementSumsForYear() below. This is keyed off
 *     today's real date, so the tool stays correct year over year without
 *     needing the figures hand-edited (only needs a new schedule entry once
 *     CPF announces further cohort years).
 *  5. The Standard Plan monthly payout at 65 is estimated by linearly
 *     interpolating the projected RA-at-65 against CPF Board's published
 *     2026-cohort Standard Plan payout-per-RA-dollar examples — this ratio
 *     is assumed roughly stable year to year, per CPF's own footnote that
 *     such adjustments are "small and gradual".
 *  6. Basic and Escalating plans apply a rough illustrative adjustment to
 *     that baseline (CPF Board doesn't publish an exact formula).
 *  7. Deferring or (illustratively) starting earlier than 65 scales the
 *     payout by 1.07^(age-65) — CPF's published ~7%/year compounding
 *     deferral bonus, mirrored in reverse for 63-64.
 */

(function () {
  "use strict";

  var OA_RATE = 0.025;
  var SA_RATE = 0.04;
  var CPF_LIFE_MIN = 60000;
  var BELOW_MIN_NOTE =
    "This matters: CPF only signs you up for CPF LIFE (paid every month, for life) automatically once you have at least $60,000. Below that, you'd default to a plan that pays out for about 20 years and then stops, even if you're still around. The good news &mdash; you can still choose to join CPF LIFE yourself, any time up to age 80. So it's worth saving toward at least $60,000, and ideally more.";
  var CURRENT_YEAR = new Date().getFullYear();
  // CPF Board sets each year's Retirement Sums years in advance. Budget 2022
  // locked in the schedule through 2027; these are the exact published
  // figures (source: mom.gov.sg factsheet on Basic Retirement Sums 2023-2027,
  // and CPF Board's published Full/Enhanced Retirement Sum figures for the
  // same cohorts — note ERS became 4x BRS from the 2025 cohort onward,
  // up from 3x BRS previously).
  var COHORT_SCHEDULE = {
    2023: { brs: 99400, frs: 198800, ers: 298200 },
    2024: { brs: 102900, frs: 205800, ers: 308700 },
    2025: { brs: 106500, frs: 213000, ers: 426000 },
    2026: { brs: 110200, frs: 220400, ers: 440800 },
    2027: { brs: 114100, frs: 228200, ers: 456400 },
  };
  var LAST_KNOWN_COHORT_YEAR = 2027;
  var FIRST_KNOWN_COHORT_YEAR = 2023;
  // Retirement Sums for any calendar year: uses CPF's own published figure
  // when we have one (2023-2027), and otherwise extrapolates from the
  // nearest published year using the "CPF goals grow by" rate, since CPF
  // hasn't announced exact figures beyond 2027 yet. This keeps the tool
  // accurate on its own every year, without needing the anchor figures
  // hand-edited — only this schedule needs a new entry once CPF announces
  // further years.
  function retirementSumsForYear(year, growth) {
    if (COHORT_SCHEDULE[year]) return COHORT_SCHEDULE[year];
    var baseYear = year > LAST_KNOWN_COHORT_YEAR ? LAST_KNOWN_COHORT_YEAR : FIRST_KNOWN_COHORT_YEAR;
    var base = COHORT_SCHEDULE[baseYear];
    var factor = Math.pow(1 + growth, year - baseYear);
    return { brs: base.brs * factor, frs: base.frs * factor, ers: base.ers * factor };
  }
  // Keyed by the projected RA balance AT 65 (not the RA-at-55 goal amounts
  // above) against CPF Board's published 2026-cohort Standard Plan monthly
  // payout examples. Source: cpf.gov.sg "How much CPF payouts can I get
  // every month" — the $950/$1,780/$3,440 figures are the same published
  // Standard Plan examples for BRS/FRS/ERS, but that table also gives the
  // RA balance those members would actually be projected to hold AT 65
  // (after 10 more years of interest from the RA-at-55 goal amount), which
  // is the correct x-axis for this interpolation.
  var PAYOUT_ANCHORS = [
    [0, 0],
    [82400, 490],
    [170100, 950],
    [227900, 1250],
    [330100, 1780],
    [445600, 2380],
    [650100, 3440],
  ];
  // CPF's real "extra interest" bonus, on top of the guaranteed floor rates
  // (2.5% OA / 4% SA & RA): an extra 1%/yr on the first $60,000 of combined
  // balances (OA counted up to $20,000 of that), and — from 55 onward — a
  // further extra 1%/yr on the first $30,000 (so +2% on the first $30,000,
  // +1% on the next $30,000). Extra interest earned "on" OA always transfers
  // into SA (pre-55) or RA (55+) rather than staying in OA. This tool
  // ignores MediSave (MA) balances in the combined-balance cap, which will
  // slightly overstate the bonus for members with meaningful MA savings.
  var EXTRA_INTEREST_CAP = 60000;
  var EXTRA_INTEREST_OA_CAP = 20000;
  var EXTRA_INTEREST_RATE = 0.01;
  var EXTRA_INTEREST_55_BONUS_CAP = 30000;
  var EXTRA_INTEREST_55_BONUS_RATE = 0.01;
  var DEFERRAL_RATE = 0.07;
  var ESCALATING_GROWTH = 0.02;
  var PLAN_FACTORS = { standard: 1, basic: 0.9, escalating: 0.8 };
  var PLAN_NOTES = {
    standard:
      "Standard Plan (Default): same amount every month, for life. This only changes your monthly payout below — it doesn't change your savings estimate above it.",
    basic:
      "Basic Plan: a smaller monthly amount, but leaves more money behind for your family — modelled here as roughly 10% lower than the Standard Plan. Note: the “Basic Plan” is different from the Basic Retirement Sum (BRS) savings goal — they just share a name.",
    escalating:
      "Escalating Plan: starts smaller but grows about 2% a year, to help keep up with rising prices — modelled here as roughly 20% lower than the Standard Plan at the start. This only changes your monthly payout below.",
  };

  // Quick-start example profiles. Illustrative starting points only — not
  // official CPF averages — meant to give people a realistic-feeling
  // starting point to adjust from, whether they're a freelancer or a
  // salaried working professional.
  var TEMPLATES = {
    freelancer: { age: 35, oa: 8000, sa: 4000, ma: 0, oac: 0, sac: 0 },
    professional: { age: 35, oa: 52000, sa: 30000, ma: 25000, oac: 7000, sac: 2000 },
    midcareer: { age: 45, oa: 110000, sa: 75000, ma: 45000, oac: 8000, sac: 3000 },
    near55: { age: 58, oa: 20000, sa: 160000, ma: 60000, oac: 0, sac: 0 },
  };

  var state = { plan: "standard", topup: false };

  function $(id) {
    return document.getElementById(id);
  }

  function parseNum(str) {
    var n = Number(String(str).replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : 0;
  }

  function fmtMoney(n) {
    if (!isFinite(n)) n = 0;
    var sign = n < 0 ? "-" : "";
    return sign + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
  }

  function fmtCompact(n) {
    if (!isFinite(n)) n = 0;
    if (Math.abs(n) >= 1000) return "$" + Math.round(n / 1000) + "k";
    return "$" + Math.round(n);
  }

  function fmtPct(n) {
    if (!isFinite(n)) n = 0;
    return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
  }

  function interpolatePayout(ra) {
    if (ra <= 0) return 0;
    for (var i = 0; i < PAYOUT_ANCHORS.length - 1; i++) {
      var x0 = PAYOUT_ANCHORS[i][0], y0 = PAYOUT_ANCHORS[i][1];
      var x1 = PAYOUT_ANCHORS[i + 1][0], y1 = PAYOUT_ANCHORS[i + 1][1];
      if (ra <= x1 || i === PAYOUT_ANCHORS.length - 2) {
        var t = (ra - x0) / (x1 - x0);
        return y0 + t * (y1 - y0);
      }
    }
    return 0;
  }

  // Extra 1%/yr on the first $60,000 of combined OA+SA (OA capped at
  // $20,000 of that). Credited to SA — OA's share transfers out to SA.
  function extraInterestPre55(oa, sa) {
    var oaCounted = Math.min(oa, EXTRA_INTEREST_OA_CAP);
    var remainingCap = Math.max(0, EXTRA_INTEREST_CAP - oaCounted);
    var saCounted = Math.min(sa, remainingCap);
    return (oaCounted + saCounted) * EXTRA_INTEREST_RATE;
  }

  // From 55: same first-$60,000 bonus, plus an additional 1%/yr on the
  // first $30,000 (so +2% on the first $30,000, +1% on the next $30,000).
  // Credited to RA — OA's share transfers out to RA.
  function extraInterestPost55(ra, oa) {
    var oaCounted = Math.min(oa, EXTRA_INTEREST_OA_CAP);
    var remainingCap = Math.max(0, EXTRA_INTEREST_CAP - oaCounted);
    var raCounted = Math.min(ra, remainingCap);
    var tier1 = Math.min(raCounted, EXTRA_INTEREST_55_BONUS_CAP);
    var tier2 = Math.max(0, raCounted - EXTRA_INTEREST_55_BONUS_CAP);
    return tier1 * (EXTRA_INTEREST_RATE + EXTRA_INTEREST_55_BONUS_RATE) + tier2 * EXTRA_INTEREST_RATE;
  }

  function payoutAtAge(payout65std, planFactor, age) {
    return payout65std * planFactor * Math.pow(1 + DEFERRAL_RATE, age - 65);
  }

  function totalTo90(monthlyStart, startAge, plan) {
    var total = 0, m = monthlyStart;
    for (var a = startAge; a <= 90; a++) {
      total += m * 12;
      if (plan === "escalating") m *= 1 + ESCALATING_GROWTH;
    }
    return total;
  }

  // Year-by-year OA/SA/RA projection from current age to 70.
  function simulate(inputs) {
    var age = inputs.age,
      oa = inputs.oa,
      sa = inputs.sa,
      oac = inputs.oac,
      sac = inputs.sac,
      growth = inputs.growth,
      oarate = inputs.oarate,
      sarate = inputs.sarate,
      topup = inputs.topup;

    var series = [];
    var a;
    var isPost55 = age >= 55;
    var frs55 = null, ers55 = null, brs55 = null, raBal, oaBal, buildFromAge, ra55, oa55;
    var oaAt55 = null, saAt55 = null;
    var referenceAge = isPost55 ? age : 55;

    if (!isPost55) {
      for (a = age; a < 55; a++) {
        var ersA = retirementSumsForYear(CURRENT_YEAR + (a - age), growth).ers;
        series.push({ age: a, ra: null, combined: oa + sa, oaLeft: 0, ers: ersA });
        var extraPre = extraInterestPre55(oa, sa);
        oa = oa * (1 + oarate) + oac;
        sa = sa * (1 + sarate) + sac + extraPre;
      }

      oaAt55 = oa;
      saAt55 = sa;
      var sums55 = retirementSumsForYear(CURRENT_YEAR + (55 - age), growth);
      frs55 = sums55.frs;
      ers55 = sums55.ers;
      brs55 = sums55.brs;
      if (sa >= frs55) {
        raBal = frs55;
        oaBal = oa + (sa - frs55);
      } else {
        var fromOA = Math.min(oa, frs55 - sa);
        raBal = sa + fromOA;
        oaBal = oa - fromOA;
      }
      if (topup && raBal < ers55 && oaBal > 0) {
        var t55 = Math.min(oaBal, ers55 - raBal);
        raBal += t55;
        oaBal -= t55;
      }
      series.push({ age: 55, ra: raBal, combined: raBal, oaLeft: oaBal, ers: ers55 });
      buildFromAge = 56;
    } else {
      // Age 55+: SA no longer exists (CPF has already merged it into the
      // Retirement Account), so the "sa" field is read as the current RA
      // balance directly and there's no 55-transfer step to simulate.
      raBal = sa;
      oaBal = oa;
      var sumsNow = retirementSumsForYear(CURRENT_YEAR, growth);
      ers55 = sumsNow.ers;
      frs55 = sumsNow.frs;
      brs55 = sumsNow.brs;
      if (topup && raBal < ers55 && oaBal > 0) {
        var t0 = Math.min(oaBal, ers55 - raBal);
        raBal += t0;
        oaBal -= t0;
      }
      series.push({ age: age, ra: raBal, combined: raBal, oaLeft: oaBal, ers: ers55 });
      buildFromAge = age + 1;
    }

    ra55 = raBal;
    oa55 = oaBal;

    for (a = buildFromAge; a <= 70; a++) {
      var extraPost = extraInterestPost55(raBal, oaBal);
      raBal = raBal * (1 + sarate) + extraPost;
      oaBal = oaBal * (1 + oarate) + oac;
      var ersYr = retirementSumsForYear(CURRENT_YEAR + (a - age), growth).ers;
      if (topup && raBal < ersYr && oaBal > 0) {
        var t = Math.min(oaBal, ersYr - raBal);
        raBal += t;
        oaBal -= t;
      }
      series.push({ age: a, ra: raBal, combined: raBal, oaLeft: oaBal, ers: ersYr });
    }

    return {
      series: series,
      frs55: frs55,
      ers55: ers55,
      brs55: brs55,
      ra55: ra55,
      oa55: oa55,
      oaAt55: oaAt55,
      saAt55: saAt55,
      isPost55: isPost55,
      referenceAge: referenceAge,
    };
  }

  function getInputs() {
    return {
      age: Number($("age").value),
      oa: parseNum($("oa").value),
      sa: parseNum($("sa").value),
      ma: parseNum($("ma").value),
      oac: Number($("oac").value),
      sac: Number($("sac").value),
      growth: Number($("growth").value) / 100,
      oarate: OA_RATE,
      sarate: SA_RATE,
      payoutAge: Number($("payoutage").value),
      topup: state.topup,
    };
  }

  function updateSliderLabels(inputs) {
    $("v-age").textContent = inputs.age;
    $("v-oac").textContent = "$" + inputs.oac.toLocaleString("en-US");
    $("v-sac").textContent = "$" + inputs.sac.toLocaleString("en-US");
    $("v-growth").textContent = (inputs.growth * 100).toFixed(1) + "%/yr";
    $("v-payoutage").textContent = inputs.payoutAge;
  }

  function updatePayoutageNote(payoutAge) {
    var note = $("payoutage-note");
    if (payoutAge === 65) {
      note.textContent = "Age 65 — the earliest official CPF LIFE start date, no bonus or penalty.";
    } else if (payoutAge > 65) {
      var pct = (Math.pow(1 + DEFERRAL_RATE, payoutAge - 65) - 1) * 100;
      note.textContent =
        "Waiting until age " + payoutAge + " increases your payout by about " + pct.toFixed(0) +
        "% compared to starting at 65.";
    } else {
      note.textContent =
        "Age " + payoutAge + " is earlier than CPF LIFE officially allows (65). Shown here just as an illustration, not a real option.";
    }
  }

  function updateAgeDependentFields(isPost55) {
    var saLabel = $("sa-label");
    var saNote = $("sa-note");
    var ageNote = $("age-note");
    var sacField = $("sac-field");
    var hdg55 = $("hdg-55");
    var sub55 = $("sub-55");

    if (isPost55) {
      saLabel.textContent = "Money in your Retirement Account (RA) now";
      saNote.textContent =
        "At 55, CPF already moves your SA into a new Retirement Account (RA) for you — enter that RA balance here instead of SA.";
      ageNote.textContent =
        "You're 55 or older, so the numbers below start from what you enter here.";
      sacField.style.display = "none";
      hdg55.textContent = "What you have today";
      sub55.textContent = "Your own RA and OA, as you entered them.";
    } else {
      saLabel.textContent = "Money in your SA account now";
      saNote.textContent = "SA = Special Account, for retirement. It's fine to enter $0 if you're not sure or have very little.";
      ageNote.textContent = "";
      sacField.style.display = "";
      hdg55.textContent = "What you'll likely have by 55";
      sub55.textContent = "How your OA and SA come together into one account.";
    }
  }

  // Highlights whichever goal tile (BRS/FRS/ERS) the projected balance has
  // reached — only the highest one, matching the single "you've reached..."
  // message shown elsewhere (reaching FRS means BRS is reached too, but only
  // FRS lights up).
  function markReachedTiles(suffix, value, brs, frs, ers) {
    var brsTile = $("tile-brs" + suffix);
    var frsTile = $("tile-frs" + suffix);
    var ersTile = $("tile-ers" + suffix);
    if (!brsTile || !frsTile || !ersTile) return;
    brsTile.classList.remove("reached");
    frsTile.classList.remove("reached");
    ersTile.classList.remove("reached");
    if (value >= ers) {
      ersTile.classList.add("reached");
    } else if (value >= frs) {
      frsTile.classList.add("reached");
    } else if (value >= brs) {
      brsTile.classList.add("reached");
    }
  }

  function updateGapMsg(ra65, ers65, frs65, brs65) {
    var el = $("gap-msg");
    if (ra65 >= ers65) {
      el.className = "gap-msg ok";
      el.innerHTML =
        "<strong>You've reached the Enhanced Retirement Sum</strong>By 65, you're projected to reach the highest CPF savings goal. The payout estimate below is the biggest amount this tool can show.";
    } else if (ra65 >= frs65) {
      el.className = "gap-msg ok";
      el.innerHTML =
        "<strong>You've reached the Full Retirement Sum</strong>By 65, you're projected to have about " +
        fmtMoney(ra65) + ". That's the amount most CPF members aim for, and it gives a solid monthly payout. Going further, to the Enhanced Retirement Sum, would grow your payout even more.";
    } else if (ra65 >= brs65) {
      el.className = "gap-msg ok";
      el.innerHTML =
        "<strong>You've reached the Basic Retirement Sum</strong>By 65, you're projected to have about " +
        fmtMoney(ra65) + " &mdash; above the " + fmtMoney(brs65) +
        " Basic Retirement Sum. That's enough to join CPF LIFE and get paid every month for life. Saving more could grow your payout further, up to the " +
        fmtMoney(frs65) + " Full Retirement Sum.";
    } else if (ra65 >= CPF_LIFE_MIN) {
      el.className = "gap-msg warn";
      el.innerHTML =
        "<strong>You're below the Basic Retirement Sum</strong>By 65, you're projected to have about " +
        fmtMoney(ra65) + ". The Basic Retirement Sum is " + fmtMoney(brs65) +
        " &mdash; you're short by " + fmtMoney(brs65 - ra65) +
        ". The good news: with over " + fmtMoney(CPF_LIFE_MIN) +
        " saved, you're still automatically signed up for CPF LIFE, paid every month for life &mdash; just at a smaller amount. Saving even a little more, or a one-time top-up, can raise it.";
    } else {
      el.className = "gap-msg warn";
      el.innerHTML =
        "<strong>You're below the Basic Retirement Sum</strong>By 65, you're projected to have about " +
        fmtMoney(ra65) + ", well short of the " + fmtMoney(brs65) +
        " Basic Retirement Sum. " + BELOW_MIN_NOTE;
    }
  }

  function buildTable(payout65std, planFactor, plan, payoutAge) {
    var rows = "";
    for (var a = 63; a <= 70; a++) {
      var amt = payoutAtAge(payout65std, planFactor, a);
      var base = payoutAtAge(payout65std, 1, 65);
      var pct = base > 0 ? ((amt - base) / base) * 100 : 0;
      var total = totalTo90(amt, a, plan);
      var sel = a === payoutAge ? " selected" : "";
      var label = a < 65 ? a + "*" : String(a);
      rows +=
        '<tr class="' + sel.trim() + '">' +
        "<td>" + label + "</td>" +
        '<td class="num">' + fmtMoney(amt) + "</td>" +
        '<td class="num">' + fmtPct(pct) + "</td>" +
        '<td class="num">' + fmtMoney(total) + "</td>" +
        "</tr>";
    }
    $("payout-table-body").innerHTML = rows;
  }

  function renderBalanceChart(series) {
    var svg = $("chart-balance");
    var W = 640, H = 260, padL = 54, padR = 14, padT = 34, padB = 30;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var minAge = series[0].age, maxAge = series[series.length - 1].age;
    var maxVal = 0;
    series.forEach(function (s) {
      maxVal = Math.max(maxVal, s.combined, s.oaLeft, s.ers);
    });
    maxVal = maxVal * 1.08 || 1;

    function x(a) {
      return padL + ((a - minAge) / (maxAge - minAge)) * innerW;
    }
    function y(v) {
      return padT + innerH - (v / maxVal) * innerH;
    }
    function pathFor(key) {
      return series
        .map(function (s, i) {
          return (i === 0 ? "M" : "L") + x(s.age).toFixed(1) + "," + y(s[key]).toFixed(1);
        })
        .join(" ");
    }

    var out = "";
    var yTicks = [0, 0.5, 1].map(function (f) {
      return Math.round(maxVal * f);
    });
    yTicks.forEach(function (v) {
      var yy = y(v);
      out +=
        '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy +
        '" stroke="#e3e8ee" stroke-width="1"/>';
      out +=
        '<text x="' + (padL - 8) + '" y="' + (yy + 4) + '" font-size="10" fill="#5b6878" text-anchor="end">' +
        fmtCompact(v) + "</text>";
    });
    var xTickAges = [];
    [minAge, 55, 65, maxAge].forEach(function (a) {
      if (a >= minAge && a <= maxAge && xTickAges.indexOf(a) === -1) xTickAges.push(a);
    });
    xTickAges.sort(function (a, b) {
      return a - b;
    });
    xTickAges.forEach(function (a) {
      out +=
        '<text x="' + x(a).toFixed(1) + '" y="' + (H - 8) + '" font-size="10" fill="#5b6878" text-anchor="middle">' +
        a + "</text>";
    });

    out += '<path d="' + pathFor("ers") + '" fill="none" stroke="#92620a" stroke-width="1.5" stroke-dasharray="4 3"/>';
    out += '<path d="' + pathFor("oaLeft") + '" fill="none" stroke="#9aa7b8" stroke-width="2"/>';
    out += '<path d="' + pathFor("combined") + '" fill="none" stroke="#1f9d6b" stroke-width="2.5"/>';

    out += '<rect x="' + padL + '" y="8" width="14" height="4" fill="#1f9d6b"/>';
    out += '<text x="' + (padL + 20) + '" y="14" font-size="10" fill="#1c2530">Your savings</text>';
    out += '<rect x="' + (padL + 140) + '" y="8" width="14" height="4" fill="#9aa7b8"/>';
    out += '<text x="' + (padL + 160) + '" y="14" font-size="10" fill="#1c2530">Extra OA</text>';
    out += '<rect x="' + (padL + 260) + '" y="8" width="14" height="4" fill="#92620a"/>';
    out += '<text x="' + (padL + 280) + '" y="14" font-size="10" fill="#1c2530">Biggest goal (ERS)</text>';

    svg.innerHTML = out;
  }

  function renderPayoutChart(payout65std, planFactor, payoutAge) {
    var svg = $("chart-payout");
    var ages = [];
    for (var a = 63; a <= 70; a++) ages.push(a);
    var vals = ages.map(function (age) {
      return payoutAtAge(payout65std, planFactor, age);
    });
    var W = 640, H = 200, padL = 54, padR = 14, padT = 14, padB = 30;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var maxVal = Math.max.apply(null, vals) * 1.15 || 1;

    function x(i) {
      return padL + (i / (ages.length - 1)) * innerW;
    }
    function y(v) {
      return padT + innerH - (v / maxVal) * innerH;
    }

    var out = "";
    [0, 0.5, 1].forEach(function (f) {
      var v = Math.round(maxVal * f);
      var yy = y(v);
      out +=
        '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy +
        '" stroke="#e3e8ee" stroke-width="1"/>';
      out +=
        '<text x="' + (padL - 8) + '" y="' + (yy + 4) + '" font-size="10" fill="#5b6878" text-anchor="end">' +
        fmtCompact(v) + "</text>";
    });

    var line = ages
      .map(function (age, i) {
        return (i === 0 ? "M" : "L") + x(i).toFixed(1) + "," + y(vals[i]).toFixed(1);
      })
      .join(" ");
    out += '<path d="' + line + '" fill="none" stroke="#1f9d6b" stroke-width="2.5"/>';

    ages.forEach(function (age, i) {
      var sel = age === payoutAge;
      out +=
        '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(vals[i]).toFixed(1) + '" r="' + (sel ? 6 : 3.5) +
        '" fill="' + (sel ? "#173a63" : "#1f9d6b") + '" stroke="#fff" stroke-width="' + (sel ? 2 : 0) + '"/>';
      out +=
        '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" font-size="10" fill="#5b6878" text-anchor="middle">' +
        age + (age < 65 ? "*" : "") + "</text>";
    });

    svg.innerHTML = out;
  }

  function recalc() {
    var inputs = getInputs();

    // A payout can't start before the person's current age.
    var payoutSlider = $("payoutage");
    var minPayoutAge = Math.max(63, inputs.age);
    if (Number(payoutSlider.min) !== minPayoutAge) payoutSlider.min = minPayoutAge;
    if (inputs.payoutAge < minPayoutAge) {
      payoutSlider.value = minPayoutAge;
      inputs.payoutAge = minPayoutAge;
    }

    updateSliderLabels(inputs);
    updatePayoutageNote(inputs.payoutAge);

    var sim = simulate(inputs);
    updateAgeDependentFields(sim.isPost55);
    var series = sim.series;
    var s65 = null;
    for (var i = 0; i < series.length; i++) {
      if (series[i].age === 65) {
        s65 = series[i];
        break;
      }
    }
    var sums65 = retirementSumsForYear(CURRENT_YEAR + (65 - inputs.age), inputs.growth);
    var frs65 = sums65.frs;
    var brs65 = sums65.brs;

    // 3-goals row at 55 (or "today", if already 55+)
    $("t-brs55").textContent = fmtMoney(sim.brs55);
    $("t-frs55").textContent = fmtMoney(sim.frs55);
    $("t-ers55").textContent = fmtMoney(sim.ers55);
    markReachedTiles("55", sim.ra55, sim.brs55, sim.frs55, sim.ers55);

    // OA + SA -> RA card
    var raRow55 = $("ra-row-55");
    var raArrow55 = $("ra-arrow-55");
    var raResultLabel55 = $("ra-result-label-55");
    var oaLeftoverLine55 = $("oa-leftover-line-55");
    if (sim.isPost55) {
      if (raRow55) raRow55.style.display = "none";
      if (raArrow55) raArrow55.style.display = "none";
      raResultLabel55.textContent = "Your RA today";
      $("t-ra55").textContent = fmtMoney(sim.ra55);
      $("t-ra55-sub").textContent = inputs.topup
        ? "Includes an OA top-up toward the biggest goal"
        : "As entered";
      oaLeftoverLine55.innerHTML =
        sim.oa55 > 0.5
          ? "You also have " + fmtMoney(sim.oa55) + " in your OA, still earning interest &mdash; separate from your RA."
          : "";
    } else {
      if (raRow55) raRow55.style.display = "";
      if (raArrow55) raArrow55.style.display = "";
      raResultLabel55.textContent = "Your RA at 55";
      $("t-merge-oa55").textContent = fmtMoney(sim.oaAt55);
      $("t-merge-sa55").textContent = fmtMoney(sim.saAt55);
      $("t-ra55").textContent = fmtMoney(sim.ra55);
      $("t-ra55-sub").textContent = inputs.topup
        ? "Your SA + OA, plus a top-up toward the biggest goal"
        : "Your SA and OA moved into this account";
      oaLeftoverLine55.innerHTML =
        sim.oa55 > 0.5
          ? "Plus " + fmtMoney(sim.oa55) + " left over in your OA, still earning interest."
          : "All of your OA and SA moved into your RA &mdash; none left over.";
    }

    // BRS indicator — only surfaced when the projected RA falls short of
    // FRS, since that's the point where "Full Retirement Sum" alone stops
    // telling the whole story and the lower BRS tier becomes relevant.
    var brsNote = $("brs-note");
    if (brsNote) {
      if (sim.ra55 < sim.frs55 - 0.5) {
        brsNote.style.display = "block";
        if (sim.ra55 >= sim.brs55) {
          brsNote.innerHTML =
            "<strong>Above the Basic Retirement Sum</strong> At 55, you're projected to have about " +
            fmtMoney(sim.ra55) +
            ". That's above the " +
            fmtMoney(sim.brs55) +
            " Basic Retirement Sum, so you're on track to join CPF LIFE. It's " +
            fmtMoney(sim.frs55 - sim.ra55) +
            " below the Full Retirement Sum, which would give a bigger monthly payout.";
        } else {
          brsNote.innerHTML =
            "<strong>Below the Basic Retirement Sum</strong> At 55, you're projected to have about " +
            fmtMoney(sim.ra55) +
            " &mdash; short of the " +
            fmtMoney(sim.brs55) +
            " Basic Retirement Sum. You still have until 65 to grow this. See the note further down on what your balance size means for your CPF LIFE payouts.";
        }
      } else {
        brsNote.style.display = "none";
      }
    }

    // 3-goals row + savings at 65
    $("t-brs65").textContent = fmtMoney(brs65);
    $("t-frs65").textContent = fmtMoney(frs65);
    $("t-ers65").textContent = fmtMoney(s65.ers);
    $("t-ra65").textContent = fmtMoney(s65.ra);
    markReachedTiles("65", s65.ra, brs65, frs65, s65.ers);
    $("oa-leftover-line-65").innerHTML =
      s65.oaLeft > 0.5
        ? "Plus " + fmtMoney(s65.oaLeft) + " left over in your OA, still earning interest."
        : "All of your OA has moved toward your goals &mdash; none left over.";
    updateGapMsg(s65.ra, s65.ers, frs65, brs65);

    // Payout
    var payout65std = interpolatePayout(s65.ra);
    var planFactor = PLAN_FACTORS[state.plan];
    var selectedPayout = payoutAtAge(payout65std, planFactor, inputs.payoutAge);
    var baselinePayout = payoutAtAge(payout65std, 1, 65);

    $("t-payout").textContent = fmtMoney(selectedPayout);
    $("t-payoutage-label").textContent = inputs.payoutAge;

    var raAtPayoutAge =
      inputs.payoutAge >= 65
        ? s65.ra * Math.pow(1 + inputs.sarate, inputs.payoutAge - 65)
        : s65.ra / Math.pow(1 + inputs.sarate, 65 - inputs.payoutAge);
    $("t-ra-payoutage").textContent = fmtMoney(raAtPayoutAge);

    var vsPct = baselinePayout > 0 ? ((selectedPayout - baselinePayout) / baselinePayout) * 100 : 0;
    $("t-vs65").textContent = fmtPct(vsPct);
    $("t-total90").textContent = fmtMoney(totalTo90(selectedPayout, inputs.payoutAge, state.plan));

    buildTable(payout65std, planFactor, state.plan, inputs.payoutAge);
    renderBalanceChart(series);
    renderPayoutChart(payout65std, planFactor, inputs.payoutAge);
  }

  function applyTemplate(key) {
    var t = TEMPLATES[key];
    if (!t) return;
    $("age").value = String(t.age);
    $("oa").value = t.oa.toLocaleString("en-US");
    $("sa").value = t.sa.toLocaleString("en-US");
    $("ma").value = t.ma.toLocaleString("en-US");
    $("oac").value = String(t.oac);
    $("sac").value = String(t.sac);
    recalc();
  }

  function setupPillGroup(id, dataAttr, onChange) {
    var group = $(id);
    group.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        group.querySelectorAll("button").forEach(function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        onChange(btn.getAttribute(dataAttr));
      });
    });
  }

  function init() {
    ["age", "oac", "sac", "growth", "payoutage"].forEach(function (id) {
      $(id).addEventListener("input", recalc);
    });

    ["oa", "sa", "ma"].forEach(function (id) {
      var input = $(id);
      input.addEventListener("input", recalc);
      input.addEventListener("blur", function () {
        input.value = Math.round(parseNum(input.value)).toLocaleString("en-US");
        recalc();
      });
    });

    setupPillGroup("plan-group", "data-plan", function (plan) {
      state.plan = plan;
      $("plan-note").textContent = PLAN_NOTES[plan];
      recalc();
    });
    $("plan-note").textContent = PLAN_NOTES[state.plan];

    setupPillGroup("topup-group", "data-topup", function (topup) {
      state.topup = topup === "on";
      recalc();
    });

    setupPillGroup("template-group", "data-template", function (key) {
      applyTemplate(key);
    });

    var nowSums = retirementSumsForYear(CURRENT_YEAR, 0.035);
    $("goal-brs-now").textContent = fmtMoney(nowSums.brs);
    $("goal-frs-now").textContent = fmtMoney(nowSums.frs);
    $("goal-ers-now").textContent = fmtMoney(nowSums.ers);
    $("goal-year-note").textContent =
      "These are the " + CURRENT_YEAR + " figures for people turning 55 this year. CPF Board sets new (higher) figures years ahead of time — so they'll be a little higher if you check back next year, and this tool updates itself to match.";

    recalc();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
