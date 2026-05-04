/**
 * 다이소 매장 안전사고 예방 AI — 프론트엔드
 *
 * 탭 1: 알림 발송 현황 모니터링 (GET /api/daily/{date})
 * 탭 2: 수동 알림 생성 (POST /api/simulate)
 */

(function () {
  "use strict";

  // ── 상태 ──
  let storesList = [];
  let selectedStore = null;

  // ── 초기화 ──
  document.addEventListener("DOMContentLoaded", function () {
    initTabs();
    loadStoresList();
    initMonitoring();
    initManual();
  });

  // ──────────────────────────────────────────
  // 탭 전환
  // ──────────────────────────────────────────
  function initTabs() {
    var btns = document.querySelectorAll(".tab-btn");
    btns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tabId = btn.getAttribute("data-tab");

        // 버튼 active 토글
        btns.forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");

        // 콘텐츠 active 토글
        document.querySelectorAll(".tab-content").forEach(function (sec) {
          sec.classList.remove("active");
        });
        document.getElementById("tab-" + tabId).classList.add("active");
      });
    });
  }

  // ──────────────────────────────────────────
  // 매장 리스트 로드 (자동완성용)
  // ──────────────────────────────────────────
  function loadStoresList() {
    fetch("/stores.json")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        storesList = data.filter(function (s) {
          return s["폐점여부"] === "영업";
        });
      })
      .catch(function (err) {
        console.error("매장 리스트 로드 실패:", err);
      });
  }

  // ──────────────────────────────────────────
  // 탭 1: 알림 발송 현황 모니터링
  // ──────────────────────────────────────────
  function initMonitoring() {
    var dateInput = document.getElementById("monitor-date");
    var btn = document.getElementById("btn-load-batch");

    // 기본값: 오늘
    dateInput.value = todayStr();

    btn.addEventListener("click", function () {
      loadBatchResult(dateInput.value);
    });
  }

  function loadBatchResult(date) {
    if (!date) return;

    show("monitor-loading");
    hide("monitor-empty");
    hide("monitor-error");
    hide("monitor-result");

    fetch("/api/daily/" + date)
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (body) {
            throw new Error(body.error || "조회 실패 (HTTP " + res.status + ")");
          });
        }
        return res.json();
      })
      .then(function (data) {
        hide("monitor-loading");
        renderBatchResult(data);
      })
      .catch(function (err) {
        hide("monitor-loading");
        showError("monitor-error", "❌ " + err.message);
      });
  }

  function renderBatchResult(data) {
    var summary = data.summary || {};
    var stores = data.stores || [];

    // 요약 카드
    setText("card-total", summary.total || 0);
    setText("card-success", summary.success || 0);
    setText("card-failed", summary.failed || 0);
    setText("card-email", summary.email_sent || 0);

    // 테이블
    var tbody = document.getElementById("batch-tbody");
    tbody.innerHTML = "";

    stores.forEach(function (s) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(String(s.store_code || "")) + "</td>" +
        "<td>" + escapeHtml(s.store_name || "") + "</td>" +
        "<td>" + (s.status === "success" ? "✅" : "❌") + "</td>" +
        "<td>" + riskBadgeHTML(s.risk_cust) + "</td>" +
        "<td>" + riskBadgeHTML(s.risk_emp) + "</td>" +
        "<td>" + (s.email_sent ? "📧" : "—") + "</td>";
      tbody.appendChild(tr);
    });

    show("monitor-result");
  }

  // ──────────────────────────────────────────
  // 탭 2: 수동 알림 생성
  // ──────────────────────────────────────────
  function initManual() {
    var dateInput = document.getElementById("manual-date");
    var searchInput = document.getElementById("store-search");
    var dropdown = document.getElementById("store-dropdown");
    var btn = document.getElementById("btn-simulate");

    // 기본값: 오늘
    dateInput.value = todayStr();

    // 매장 검색 자동완성
    searchInput.addEventListener("input", function () {
      var query = searchInput.value.trim().toLowerCase();
      if (query.length < 1) {
        hide("store-dropdown");
        return;
      }

      var filtered = storesList.filter(function (s) {
        var name = (s["매장명"] || "").toLowerCase();
        var code = String(s["매장"] || "");
        return name.indexOf(query) !== -1 || code.indexOf(query) !== -1;
      }).slice(0, 20);

      if (filtered.length === 0) {
        hide("store-dropdown");
        return;
      }

      dropdown.innerHTML = "";
      filtered.forEach(function (s) {
        var li = document.createElement("li");
        li.innerHTML = escapeHtml(s["매장명"] || "") +
          '<span class="store-code">' + escapeHtml(String(s["매장"] || "")) + "</span>";
        li.addEventListener("click", function () {
          selectStore(s);
          hide("store-dropdown");
          searchInput.value = "";
        });
        dropdown.appendChild(li);
      });

      show("store-dropdown");
    });

    // 외부 클릭 시 드롭다운 닫기
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".search-wrap")) {
        hide("store-dropdown");
      }
    });

    // 생성 버튼
    btn.addEventListener("click", function () {
      if (!selectedStore) return;
      runSimulate(selectedStore["매장"], dateInput.value);
    });
  }

  function selectStore(store) {
    selectedStore = store;
    var el = document.getElementById("selected-store");
    el.innerHTML =
      "🏪 <strong>" + escapeHtml(store["매장명"] || "") + "</strong>" +
      " (" + escapeHtml(String(store["매장"] || "")) + ")" +
      ' <button class="remove-btn" aria-label="선택 해제">✕</button>';
    show("selected-store");

    el.querySelector(".remove-btn").addEventListener("click", function () {
      selectedStore = null;
      hide("selected-store");
      document.getElementById("btn-simulate").disabled = true;
    });

    document.getElementById("btn-simulate").disabled = false;
  }

  function runSimulate(storeCode, date) {
    if (!storeCode || !date) return;

    show("manual-loading");
    hide("manual-empty");
    hide("manual-error");
    hide("manual-result");

    fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_code: Number(storeCode), date: date }),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (body) {
            throw new Error(body.error || "생성 실패 (HTTP " + res.status + ")");
          });
        }
        return res.json();
      })
      .then(function (data) {
        hide("manual-loading");
        renderSimResult(data);
      })
      .catch(function (err) {
        hide("manual-loading");
        showError("manual-error", "❌ " + err.message);
      });
  }

  function renderSimResult(data) {
    // 헤더
    setText("sim-store-name", "🏪 " + (data.store_name || ""));
    setText("sim-region", data.region || "");
    setText("sim-date", "📅 " + (data.date || ""));

    var results = data.results || {};

    // CUST
    renderGuide("guide-cust", results.cust);

    // EMP
    renderGuide("guide-emp", results.emp);

    show("manual-result");
  }

  // ──────────────────────────────────────────
  // 안전 가이드 렌더링
  // ──────────────────────────────────────────
  function renderGuide(elementId, sourceData) {
    var el = document.getElementById(elementId);
    if (!sourceData) {
      el.innerHTML = '<p class="guide-error">데이터 없음</p>';
      return;
    }

    if (sourceData.error) {
      el.innerHTML = '<p class="guide-error">❌ ' + escapeHtml(sourceData.error) + "</p>";
      return;
    }

    var risk = sourceData.risk || {};
    var guide = sourceData.guide || {};

    var html = "";

    // 위험도 헤더
    html += '<div class="guide-risk-header">';
    html += riskBadgeHTML(risk.grade);
    html += '<span class="risk-score">점수: ' + (risk.score != null ? risk.score : "—") + "/100</span>";
    html += '<span class="risk-type">주요 위험유형: ' + escapeHtml(risk.dominant_type || guide["주요_위험유형"] || "—") + "</span>";
    html += "</div>";

    // 위험 요약
    if (guide["위험_요약"]) {
      html += '<div class="guide-summary">' + escapeHtml(guide["위험_요약"]) + "</div>";
    }

    // 안전 수칙
    var tips = guide["안전_수칙"] || [];
    if (tips.length > 0) {
      html += '<ul class="guide-tips">';
      tips.forEach(function (tip) {
        html += "<li>" + escapeHtml(tip) + "</li>";
      });
      html += "</ul>";
    }

    // 과거 사례 + 추가 참고
    var extra = "";
    if (guide["과거_사례_인용"]) {
      extra += "<p><strong>📁 과거 사례:</strong> " + escapeHtml(guide["과거_사례_인용"]) + "</p>";
    }
    if (guide["추가_참고"]) {
      extra += "<p><strong>📌 추가 참고:</strong> " + escapeHtml(guide["추가_참고"]) + "</p>";
    }
    if (extra) {
      html += '<div class="guide-extra">' + extra + "</div>";
    }

    el.innerHTML = html;
  }

  // ──────────────────────────────────────────
  // 위험도 뱃지 HTML
  // ──────────────────────────────────────────
  function riskBadgeHTML(grade) {
    var map = {
      high: { cls: "badge-high", label: "🔴 높음" },
      medium: { cls: "badge-medium", label: "🟡 보통" },
      low: { cls: "badge-low", label: "🟢 낮음" },
    };
    var info = map[grade] || { cls: "badge-unknown", label: grade || "—" };
    return '<span class="badge ' + info.cls + '">' + info.label + "</span>";
  }

  // ──────────────────────────────────────────
  // 유틸리티
  // ──────────────────────────────────────────
  function todayStr() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-" + dd;
  }

  function show(id) {
    document.getElementById(id).classList.remove("hidden");
  }

  function hide(id) {
    document.getElementById(id).classList.add("hidden");
  }

  function setText(id, text) {
    document.getElementById(id).textContent = text;
  }

  function showError(id, message) {
    var el = document.getElementById(id);
    el.textContent = message;
    el.classList.remove("hidden");
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
})();
