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
 *  4. The Standard Plan monthly payout at 65 is estimated by linearly
 *     interpolating the projected RA-at-65 against CPF Board's published
 *     2026-cohort Standard Plan examples at BRS/FRS/ERS.
 *  5. Basic and Escalating plans apply a rough illustrative adjustment to
 *     that baseline (CPF Board doesn't publish an exact formula).
 *  6. Deferring or (illustratively) starting earlier than 65 scales the
 *     payout by 1.07^(age-65) — CPF's published ~7%/year compounding
 *     deferral bonus, mirrored in reverse for 63-64.
 */

(function () {
  "use strict";

  var ANCHORS = { brs: 110200, frs: 220400, ers: 440800 };
  var PAYOUT_ANCHORS = [
    [0, 0],
    [110200, 950],
    [220400, 1780],
    [440800, 3440],
  ];
  var DEFERRAL_RATE = 0.07;
  var ESCALATING_GROWTH = 0.02;
  var PLAN_FACTORS = { standard: 1, basic: 0.9, escalating: 0.8 };
  var PLAN_NOTES = {
    standard:
      "Level payouts for life. Higher bequest to beneficiaries than Escalating, lower than Basic. This only changes your monthly payout below — it doesn't change your projected Retirement Account or Retirement Sum figures above.",
    basic:
      "Lower monthly payouts, but preserves more of your Retirement Account as a bequest — modelled here as roughly 10% lower than Standard. This “Basic” is a payout plan, not the Basic Retirement Sum (BRS) above — two different CPF terms that happen to share a name. It only changes your monthly payout below.",
    escalating:
      "Starts lower but rises about 2% a year to help keep pace with inflation — modelled here as roughly 20% lower than Standard at the start. This only changes your monthly payout below — it doesn't change your projected Retirement Account or Retirement Sum figures above.",
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
    var referenceAge = isPost55 ? age : 55;

    if (!isPost55) {
      for (a = age; a < 55; a++) {
        var ersA = ANCHORS.ers * Math.pow(1 + growth, a - age);
        series.push({ age: a, ra: null, combined: oa + sa, oaLeft: 0, ers: ersA });
        oa = oa * (1 + oarate) + oac;
        sa = sa * (1 + sarate) + sac;
      }

      frs55 = ANCHORS.frs * Math.pow(1 + growth, 55 - age);
      ers55 = ANCHORS.ers * Math.pow(1 + growth, 55 - age);
      brs55 = ANCHORS.brs * Math.pow(1 + growth, 55 - age);
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
      ers55 = ANCHORS.ers * Math.pow(1 + growth, 0);
      frs55 = ANCHORS.frs * Math.pow(1 + growth, 0);
      brs55 = ANCHORS.brs * Math.pow(1 + growth, 0);
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
      raBal = raBal * (1 + sarate);
      oaBal = oaBal * (1 + oarate) + oac;
      var ersYr = ANCHORS.ers * Math.pow(1 + growth, a - age);
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
      isPost55: isPost55,
      referenceAge: referenceAge,
    };
  }

  function getInputs() {
    return {
      age: Number($("age").value),
      oa: parseNum($("oa").value),
      sa: parseNum($("sa").value),
      oac: Number($("oac").value),
      sac: Number($("sac").value),
      growth: Number($("growth").value) / 100,
      oarate: Number($("oarate").value) / 100,
      sarate: Number($("sarate").value) / 100,
      payoutAge: Number($("payoutage").value),
      topup: state.topup,
    };
  }

  function updateSliderLabels(inputs) {
    $("v-age").textContent = inputs.age;
    $("v-oac").textContent = "$" + inputs.oac.toLocaleString("en-US");
    $("v-sac").textContent = "$" + inputs.sac.toLocaleString("en-US");
    $("v-growth").textContent = (inputs.growth * 100).toFixed(1) + "%/yr";
    $("v-oarate").textContent = (inputs.oarate * 100).toFixed(1) + "%/yr";
    $("v-sarate").textContent = (inputs.sarate * 100).toFixed(1) + "%/yr";
    $("v-payoutage").textContent = inputs.payoutAge;
  }

  function updatePayoutageNote(payoutAge) {
    var note = $("payoutage-note");
    if (payoutAge === 65) {
      note.textContent = "Age 65 — the earliest official CPF LIFE start, no deferral adjustment.";
    } else if (payoutAge > 65) {
      var pct = (Math.pow(1 + DEFERRAL_RATE, payoutAge - 65) - 1) * 100;
      note.textContent =
        "Deferring to age " + payoutAge + " increases your payout by about " + pct.toFixed(0) +
        "% versus starting at 65, based on CPF's published ~7%/year compounding deferral bonus.";
    } else {
      note.textContent =
        "Age " + payoutAge + " is earlier than CPF LIFE's official 65+ start — shown here as an " +
        "illustrative extrapolation using the same 7%/year factor in reverse, not an official CPF option.";
    }
  }

  function updateAgeDependentFields(isPost55) {
    var saLabel = $("sa-label");
    var saNote = $("sa-note");
    var ageNote = $("age-note");
    var sacField = $("sac-field");
    var hdg55 = $("hdg-55");
    var tlFrs55 = $("tl-frs55");
    var tlRa55 = $("tl-ra55");
    var tlOa55 = $("tl-oa55");
    var tlGap55 = $("tl-gap55");

    if (isPost55) {
      saLabel.textContent = "Current RA balance";
      saNote.textContent =
        "CPF merges your SA into your Retirement Account at 55, so enter that RA balance here, not an SA balance.";
      ageNote.textContent =
        "At 55+, OA no longer transfers automatically — the figures below start from the RA and OA balances you enter.";
      sacField.style.display = "none";
      hdg55.textContent = "Your Retirement Account today";
      tlFrs55.textContent = "ERS ceiling (today)";
      tlRa55.textContent = "Your RA today";
      tlOa55.textContent = "Your OA today";
      tlGap55.textContent = "Gap to ERS today";
    } else {
      saLabel.textContent = "Current SA balance";
      saNote.textContent = "";
      ageNote.textContent = "";
      sacField.style.display = "";
      hdg55.textContent = "Your Retirement Account at 55, projected";
      tlFrs55.textContent = "Full Retirement Sum (FRS) target at 55";
      tlRa55.textContent = "Your RA at 55";
      tlOa55.textContent = "OA left after transfer";
      tlGap55.textContent = "Shortfall to ERS at 55";
    }
  }

  function updateGapMsg(ra65, ers65, frs65, brs65) {
    var el = $("gap-msg");
    if (ra65 >= ers65) {
      el.className = "gap-msg ok";
      el.innerHTML =
        "<strong>Enhanced Retirement Sum reached</strong>You're projected to reach the top CPF LIFE payout tier by 65 &mdash; the estimate below reflects the maximum this tool models.";
    } else if (ra65 >= frs65) {
      el.className = "gap-msg ok";
      el.innerHTML =
        "<strong>Full Retirement Sum reached</strong>You're projected to clear the Full Retirement Sum by 65 &mdash; the tier most CPF members land at. You're " +
        fmtMoney(ers65 - ra65) + " short of the Enhanced Retirement Sum ceiling, which is only relevant if you're voluntarily topping up for a larger payout.";
    } else if (ra65 >= brs65) {
      el.className = "gap-msg ok";
      el.innerHTML =
        "<strong>Between Basic and Full Retirement Sum</strong>You're projected at " +
        fmtMoney(ra65) + " by 65 &mdash; above the " + fmtMoney(brs65) +
        " Basic Retirement Sum, but " + fmtMoney(frs65 - ra65) +
        " short of the Full Retirement Sum. That's still enough to join CPF LIFE, just at a smaller monthly payout than the Full Retirement Sum examples above.";
    } else {
      el.className = "gap-msg warn";
      el.innerHTML =
        "<strong>Below Basic Retirement Sum</strong>You're projected at " +
        fmtMoney(ra65) + " by 65, short of even the " + fmtMoney(brs65) +
        " Basic Retirement Sum by " + fmtMoney(brs65 - ra65) +
        ". Consider increasing contributions or a voluntary top-up if you'd like a larger CPF LIFE payout.";
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
    out += '<text x="' + (padL + 20) + '" y="14" font-size="10" fill="#1c2530">RA (or OA+SA pre-55)</text>';
    out += '<rect x="' + (padL + 170) + '" y="8" width="14" height="4" fill="#9aa7b8"/>';
    out += '<text x="' + (padL + 190) + '" y="14" font-size="10" fill="#1c2530">OA leftover</text>';
    out += '<rect x="' + (padL + 300) + '" y="8" width="14" height="4" fill="#92620a"/>';
    out += '<text x="' + (padL + 320) + '" y="14" font-size="10" fill="#1c2530">ERS ceiling</text>';

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
    var frs65 = ANCHORS.frs * Math.pow(1 + inputs.growth, 65 - inputs.age);
    var brs65 = ANCHORS.brs * Math.pow(1 + inputs.growth, 65 - inputs.age);

    // "Retirement Account at 55" (or "today", if already 55+) tiles
    if (sim.isPost55) {
      $("t-frs55").textContent = fmtMoney(sim.ers55);
      $("t-frs55-sub").textContent = "This year's Enhanced Retirement Sum ceiling";
      $("t-ra55").textContent = fmtMoney(sim.ra55);
      $("t-ra55-sub").textContent = inputs.topup
        ? "Includes an immediate OA top-up to this year's ERS"
        : "As entered";
      $("t-oa55").textContent = fmtMoney(sim.oa55);
      var gapToday = Math.max(0, sim.ers55 - sim.ra55);
      $("t-gap55").textContent = fmtMoney(gapToday);
      $("t-gap55-sub").textContent =
        gapToday > 0
          ? "To reach the Enhanced Retirement Sum today"
          : "You've already reached the Enhanced Retirement Sum";
    } else {
      $("t-frs55").textContent = fmtMoney(sim.frs55);
      $("t-frs55-sub").textContent =
        "Projected at " + (inputs.growth * 100).toFixed(1) + "%/yr growth";
      $("t-ra55").textContent = fmtMoney(sim.ra55);
      $("t-ra55-sub").textContent = inputs.topup
        ? "SA + OA transferred, plus OA top-up to ERS"
        : "SA + OA transferred, up to that year's FRS";
      $("t-oa55").textContent = fmtMoney(sim.oa55);
      var gap55 = Math.max(0, sim.ers55 - sim.ra55);
      $("t-gap55").textContent = fmtMoney(gap55);
      $("t-gap55-sub").textContent =
        gap55 > 0
          ? "To reach the Enhanced Retirement Sum at 55"
          : "You reached the Enhanced Retirement Sum at 55";
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
            "<strong>Below Full Retirement Sum:</strong> your projected RA of " +
            fmtMoney(sim.ra55) +
            " is short of the " +
            fmtMoney(sim.frs55) +
            " Full Retirement Sum (FRS) target, but still above the " +
            fmtMoney(sim.brs55) +
            " Basic Retirement Sum (BRS) &mdash; the lowest tier in the glossary above. Your CPF LIFE payout will be scaled down from the Standard-Plan examples shown, roughly in proportion to where your RA sits between BRS and FRS.";
        } else {
          brsNote.innerHTML =
            "<strong>Below Basic Retirement Sum:</strong> your projected RA of " +
            fmtMoney(sim.ra55) +
            " doesn't yet reach the " +
            fmtMoney(sim.brs55) +
            " Basic Retirement Sum (BRS) &mdash; the lowest of CPF's three Retirement Sum tiers. You can still join CPF LIFE with a smaller RA, but your monthly payout will be scaled down well below the Standard-Plan examples shown here.";
        }
      } else {
        brsNote.style.display = "none";
      }
    }

    // 65 tiles
    $("t-ers65").textContent = fmtMoney(s65.ers);
    $("t-ra65").textContent = fmtMoney(s65.ra);
    $("t-oa65").textContent = fmtMoney(s65.oaLeft);
    $("t-gapers").textContent = fmtMoney(Math.max(0, s65.ers - s65.ra));
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
    ["age", "oac", "sac", "growth", "oarate", "sarate", "payoutage"].forEach(function (id) {
      $(id).addEventListener("input", recalc);
    });

    ["oa", "sa"].forEach(function (id) {
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

    setupPillGroup("topup-group", "data-topup", function (topup) {
      state.topup = topup === "on";
      recalc();
    });

    recalc();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
