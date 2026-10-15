(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  var state = {
    age: 30,
    gender: "male",
    residency: "citizen"
  };

  var BASE_PREMIUM = { male: 206, female: 254 }; // 2026 reference, entry age 30, before subsidy

  var CURRENT_YEAR = new Date().getFullYear();

  function fmtMoney(n) {
    return "$" + Math.round(n).toLocaleString("en-US");
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

  function subsidyTier(pchi, residency) {
    if (!pchi || pchi <= 0) return null;
    var pct;
    if (pchi <= 1500) pct = 30;
    else if (pchi <= 2600) pct = 25;
    else if (pchi <= 3600) pct = 20;
    else return { pct: 0, label: "Likely none" };
    if (residency === "pr") pct = pct / 2;
    return { pct: pct, label: pct + "%" };
  }

  function birthYearApprox(age) {
    return CURRENT_YEAR - age;
  }

  function computeStatus(age) {
    var by = birthYearApprox(age);
    if (age < 30) {
      return {
        html: "<strong>Not enrolled yet.</strong> Based on your age, you'll be automatically covered by CareShield Life when you turn 30 (around " + (CURRENT_YEAR + (30 - age)) + "). Premiums start then, at the age-30 rate.",
        entryAge: 30,
        payToLabel: "Age 67",
        paySub: "From age 30 to 67",
        showReference: true
      };
    }
    if (by >= 1980) {
      return {
        html: "<strong>Automatically covered.</strong> Born 1980 or later, you were auto-enrolled in CareShield Life at age 30, and have been paying premiums since then.",
        entryAge: 30,
        payToLabel: "Age 67",
        paySub: "From age 30 to 67",
        showReference: true
      };
    }
    if (by >= 1970) {
      return {
        html: "<strong>Likely already enrolled.</strong> Your cohort (born " + by + ") was mostly auto-enrolled into CareShield Life from ElderShield in December 2021, unless you opted out. Otherwise, joining now is optional &mdash; your premium would be set at your current age of " + age + ".",
        entryAge: age,
        payToLabel: age >= 59 ? "10 years" : "Age 67",
        paySub: age >= 59 ? "Fixed 10-year term" : "From age " + age + " to 67",
        showReference: age === 30
      };
    }
    return {
      html: "<strong>Enrolment is optional for you.</strong> Born " + by + " means CareShield Life isn't automatic &mdash; you can choose to opt in. If you join now, your premium would be set at your current age of " + age + " and locked in from there.",
      entryAge: age,
      payToLabel: age >= 59 ? "10 years" : "Age 67",
      paySub: age >= 59 ? "Fixed 10-year term" : "From age " + age + " to 67",
      showReference: age === 30
    };
  }

  function render() {
    var age = state.age;
    var gender = state.gender;
    var residency = state.residency;
    var pchiRaw = ($("pchi").value || "").replace(/[^0-9.]/g, "");
    var pchi = pchiRaw ? parseFloat(pchiRaw) : 0;

    $("v-age").textContent = age;

    var status = computeStatus(age);
    $("status-card").innerHTML = status.html;
    $("t-entryage").textContent = status.entryAge;
    $("t-payto").textContent = status.payToLabel;
    $("t-payto-sub").textContent = status.paySub;

    var sub = subsidyTier(pchi, residency);
    if (sub) {
      $("t-subsidy").textContent = sub.label;
      $("t-subsidy-sub").textContent = residency === "pr" ? "PR rate (half of citizen tier)" : "Based on income entered";
    } else {
      $("t-subsidy").textContent = "—";
      $("t-subsidy-sub").textContent = "Add income above";
    }

    // Highlight the matching gender box and show subsidised figure
    $("box-male").classList.toggle("match", gender === "male");
    $("box-female").classList.toggle("match", gender === "female");

    ["male", "female"].forEach(function (g) {
      var base = BASE_PREMIUM[g];
      var subEl = $("sub-" + g);
      if (sub && sub.pct > 0) {
        var after = base * (1 - sub.pct / 100);
        subEl.textContent = "~" + fmtMoney(after) + "/yr after " + sub.pct + "% subsidy";
      } else {
        subEl.textContent = "before subsidy";
      }
    });

    var ageNoteBox = $("age-note-box");
    if (!status.showReference) {
      ageNoteBox.style.display = "block";
      ageNoteBox.innerHTML = "<strong>Note:</strong> the rates above are the published reference for joining at age 30. Your entry age is " + status.entryAge + ", and CareShield Life premiums rise the older you are when you join &mdash; there's no full public table for that, so we can't show a reliable number here. Chat with us for your exact premium.";
    } else {
      ageNoteBox.style.display = "none";
    }

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
  }

  function init() {
    var ageInput = $("age");
    ageInput.addEventListener("input", function () {
      state.age = parseInt(ageInput.value, 10);
      render();
    });

    setupPillGroup("gender-group", "data-gender", function (v) { state.gender = v; render(); });
    setupPillGroup("residency-group", "data-residency", function (v) { state.residency = v; render(); });

    $("pchi").addEventListener("input", render);

    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
