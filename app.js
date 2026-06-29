const STORAGE_KEY = "couple-world-trip-planner";
const GOOGLE_KEY_STORAGE = "couple-world-trip-google-maps-key";
const FIREBASE_URL_STORAGE = "couple-world-trip-firebase-url";
const TRIP_CODE_STORAGE = "couple-world-trip-code";
const PUBLIC_APP_URL_STORAGE = "couple-world-trip-public-app-url";
const BUILT_IN_GOOGLE_MAPS_KEY = window.TRAVEL_PLANNER_GOOGLE_MAPS_KEY || "";
const people = { me: "공동", partner: "공동", shared: "공동" };
const money = new Intl.NumberFormat("ko-KR");
const googleMapState = {
  map: null,
  markers: [],
  route: null,
  key: BUILT_IN_GOOGLE_MAPS_KEY || localStorage.getItem(GOOGLE_KEY_STORAGE) || "",
  loadPromise: null,
  geocoder: null,
  autocomplete: null
};
const syncState = {
  firebaseUrl: localStorage.getItem(FIREBASE_URL_STORAGE) || "",
  tripCode: localStorage.getItem(TRIP_CODE_STORAGE) || "",
  timer: null,
  stream: null,
  saving: false,
  lastRemoteUpdatedAt: "",
  lastSerialized: "",
  publicAppUrl: localStorage.getItem(PUBLIC_APP_URL_STORAGE) || ""
};

const sampleData = {
  meta: {
    tripName: "이탈리아 신혼여행",
    startDate: "2026-09-05",
    endDate: "2026-09-18",
    budgetTotal: 8500000,
    activePerson: "me"
  },
  schedules: [
    {
      id: "s1",
      date: "2026-09-05",
      time: "10:30",
      city: "Seoul",
      title: "인천공항 출발",
      lat: 37.4602,
      lon: 126.4407,
      note: "여권, 로밍, 여행자 보험 확인",
      updatedBy: "me",
      updatedAt: "2026-06-26T06:00:00.000Z"
    },
    {
      id: "s2",
      date: "2026-09-06",
      time: "15:00",
      city: "Paris",
      title: "숙소 체크인 후 센 강 산책",
      lat: 48.8566,
      lon: 2.3522,
      note: "체크인 코드 저장",
      updatedBy: "partner",
      updatedAt: "2026-06-26T06:10:00.000Z"
    },
    {
      id: "s3",
      date: "2026-09-10",
      time: "09:20",
      city: "Rome",
      title: "기차 이동 및 콜로세움",
      lat: 41.9028,
      lon: 12.4964,
      note: "입장권 시간 엄수",
      updatedBy: "me",
      updatedAt: "2026-06-26T06:15:00.000Z"
    },
    {
      id: "s4",
      date: "2026-09-15",
      time: "18:40",
      city: "Tokyo",
      title: "귀국 전 답례품 쇼핑",
      lat: 35.6762,
      lon: 139.6503,
      note: "가족별 선물 목록 체크",
      updatedBy: "partner",
      updatedAt: "2026-06-26T06:20:00.000Z"
    }
  ],
  expenses: [
    { id: "e1", category: "항공권", title: "국제선 왕복", amount: 2600000, payer: "shared", note: "2인 기준", updatedBy: "me", updatedAt: "2026-06-26T06:00:00.000Z" },
    { id: "e2", category: "숙박", title: "파리 4박", amount: 1280000, payer: "partner", note: "조식 포함", updatedBy: "partner", updatedAt: "2026-06-26T06:12:00.000Z" },
    { id: "e3", category: "답례품", title: "가족 선물 예산", amount: 450000, payer: "me", note: "추가 가능", updatedBy: "me", updatedAt: "2026-06-26T06:14:00.000Z" }
  ],
  bookings: [
    { id: "b1", type: "숙박", title: "파리 레프트뱅크 호텔", date: "2026-09-06", code: "PAR-2048", note: "체크인 15:00", updatedBy: "partner", updatedAt: "2026-06-26T06:18:00.000Z" },
    { id: "b2", type: "투어", title: "바티칸 오전 투어", date: "2026-09-11", code: "ROMA-77", note: "여권 사본 지참", updatedBy: "me", updatedAt: "2026-06-26T06:22:00.000Z" }
  ],
  history: []
};

let state = loadState();
if (state.meta?.tripName === "2026 세계 여행") {
  state.meta.tripName = "이탈리아 신혼여행";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
let preferredDayFilter = "";
let saveToastTimer = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function loadState() {
  const params = new URLSearchParams(location.search);
  const remoteDb = params.get("db");
  const remoteCode = params.get("code");
  if (remoteDb && remoteCode) {
    syncState.firebaseUrl = remoteDb;
    syncState.tripCode = remoteCode;
    localStorage.setItem(FIREBASE_URL_STORAGE, remoteDb);
    localStorage.setItem(TRIP_CODE_STORAGE, remoteCode);
  }

  const shared = params.get("trip");
  if (shared) {
    try {
      const decoded = JSON.parse(decodeURIComponent(atob(shared)));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(decoded));
      history.replaceState(null, "", location.pathname);
      return decoded;
    } catch {
      return structuredClone(sampleData);
    }
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(sampleData);

  try {
    return JSON.parse(saved);
  } catch {
    return structuredClone(sampleData);
  }
}

function save(action) {
  if (action) {
    state.history.unshift({
      id: crypto.randomUUID(),
      action,
      person: state.meta.activePerson,
      at: new Date().toISOString()
    });
    state.history = state.history.slice(0, 40);
  }
  state.meta.remoteUpdatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  syncState.lastSerialized = JSON.stringify(state);
  render();
  pushRemoteState();
}

function byDateTime(a, b) {
  return `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`);
}

function formatDate(value) {
  if (!value) return "날짜 미정";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", weekday: "short" }).format(new Date(`${value}T00:00:00`));
}

function won(value) {
  return `${money.format(Number(value || 0))}원`;
}

function currentPersonLabel(id = state.meta.activePerson) {
  return people[id] || "공동";
}

function touch(item) {
  item.updatedBy = state.meta.activePerson;
  item.updatedAt = new Date().toISOString();
  return item;
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setSaveStatus(message) {
  $("#saveStatus").textContent = message;
  $("#shareStatus").textContent = message;
}

function showSaveToast(message = "저장되었습니다.") {
  const toast = $("#saveToast");
  $("#saveToastMessage").textContent = message;
  toast.classList.add("show");
  toast.setAttribute("aria-hidden", "false");
  window.clearTimeout(saveToastTimer);
  saveToastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
    toast.setAttribute("aria-hidden", "true");
  }, 2200);
}

function formHasDraft(form) {
  return Array.from(new FormData(form).entries()).some(([key, value]) => key !== "id" && String(value).trim() !== "");
}

function syncMetaFromInputs() {
  state.meta.tripName = $("#tripName").value.trim() || state.meta.tripName;
  state.meta.startDate = $("#startDate").value;
  state.meta.endDate = $("#endDate").value;
  state.meta.budgetTotal = Number($("#budgetTotal").value || 0);
}

function saveDraftForm(form, collection, label) {
  if (!formHasDraft(form)) return null;
  if (!form.checkValidity()) {
    form.reportValidity();
    setSaveStatus(`${label}에 빠진 항목이 있습니다. 표시된 칸을 먼저 채워주세요.`);
    return false;
  }

  const data = formToObject(form);
  if (!data.id) data.id = crypto.randomUUID();
  if (collection === "schedules") preferredDayFilter = data.date || "all";
  upsert(collection, data);
  resetForm(form);
  return data;
}

function saveCurrentWork() {
  syncMetaFromInputs();

  const scheduleDraft = saveDraftForm($("#scheduleForm"), "schedules", "일정");
  if (scheduleDraft === false) return;

  if (saveDraftForm($("#expenseForm"), "expenses", "비용") === false) return;
  if (saveDraftForm($("#bookingForm"), "bookings", "예약") === false) return;

  save("전체 저장");
  setSaveStatus("현재까지 수정한 내용을 저장했습니다.");
  showSaveToast("현재까지 수정한 내용을 저장했습니다.");
  if (scheduleDraft) updateScheduleLocationAfterSave(scheduleDraft);
}

async function enrichScheduleLocation(data) {
  const existing = data.id ? state.schedules.find((item) => item.id === data.id) : null;
  const hasManualCoords = data.lat !== "" && data.lon !== "";
  const placeChanged = data.placeQuery && data.placeQuery !== existing?.placeQuery;

  if (!data.placeQuery || (hasManualCoords && !placeChanged)) return data;
  if (!googleMapState.key) {
    $("#shareStatus").textContent = "Google Maps API 키가 없어 장소 좌표를 찾지 못했습니다.";
    return data;
  }

  try {
    const result = await geocodePlace(`${data.placeQuery}, ${data.city}`.trim());
    data.lat = result.lat;
    data.lon = result.lon;
    $("#shareStatus").textContent = "장소 위치를 찾아 일정에 저장했습니다.";
  } catch {
    $("#shareStatus").textContent = "장소 위치를 찾지 못했습니다. 장소명을 더 자세히 적거나 좌표를 직접 입력해주세요.";
  }
  return data;
}

async function geocodePlace(query) {
  await loadGoogleMaps();
  if (!googleMapState.geocoder) googleMapState.geocoder = new google.maps.Geocoder();

  return new Promise((resolve, reject) => {
    googleMapState.geocoder.geocode({ address: query }, (results, status) => {
      if (status !== "OK" || !results?.[0]) {
        reject(new Error(status));
        return;
      }
      const location = results[0].geometry.location;
      resolve({ lat: location.lat(), lon: location.lng() });
    });
  });
}

function initPlaceAutocomplete() {
  if (!window.google?.maps?.places || googleMapState.autocomplete) return;
  const input = document.querySelector("#scheduleForm input[name='placeQuery']");
  if (!input) return;

  googleMapState.autocomplete = new google.maps.places.Autocomplete(input, {
    fields: ["place_id", "formatted_address", "geometry", "name"],
    types: ["establishment", "geocode"]
  });

  googleMapState.autocomplete.addListener("place_changed", () => {
    const place = googleMapState.autocomplete.getPlace();
    if (!place?.geometry?.location) {
      $("#shareStatus").textContent = "선택한 장소의 위치 정보를 찾지 못했습니다.";
      return;
    }

    const form = $("#scheduleForm");
    form.elements.placeQuery.value = place.name || form.elements.placeQuery.value;
    form.elements.placeId.value = place.place_id || "";
    form.elements.placeAddress.value = place.formatted_address || "";
    form.elements.lat.value = place.geometry.location.lat();
    form.elements.lon.value = place.geometry.location.lng();
    $("#shareStatus").textContent = "장소를 선택했습니다. 일정 저장을 누르면 지도에 반영됩니다.";
  });
}

function fillForm(form, item) {
  Object.entries(item).forEach(([key, value]) => {
    const field = form.elements[key];
    if (field) field.value = value ?? "";
  });
}

function resetForm(form) {
  form.reset();
  if (form.elements.id) form.elements.id.value = "";
}

function getRemoteUrl() {
  if (!syncState.firebaseUrl || !syncState.tripCode) return "";
  const base = syncState.firebaseUrl.replace(/\/+$/, "");
  const code = encodeURIComponent(syncState.tripCode.trim());
  return `${base}/trips/${code}.json`;
}

function isSyncReady() {
  return Boolean(getRemoteUrl());
}

async function pushRemoteState() {
  if (!isSyncReady() || syncState.saving) return;
  syncState.saving = true;
  try {
    await fetch(getRemoteUrl(), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    });
    $("#shareStatus").textContent = "공동 편집 저장 완료";
  } catch {
    $("#shareStatus").textContent = "공동 편집 저장에 실패했습니다.";
  } finally {
    syncState.saving = false;
  }
}

function applyRemoteState(remote, message = "공동 편집 내용 동기화 완료") {
  if (!remote || typeof remote !== "object") return false;
  const remoteSerialized = JSON.stringify(remote);
  const remoteUpdatedAt = remote?.meta?.remoteUpdatedAt || "";
  const localUpdatedAt = state.meta.remoteUpdatedAt || "";

  if (remoteSerialized === syncState.lastSerialized || remoteUpdatedAt < localUpdatedAt) {
    return false;
  }

  state = remote;
  syncState.lastSerialized = remoteSerialized;
  localStorage.setItem(STORAGE_KEY, remoteSerialized);
  render();
  $("#shareStatus").textContent = message;
  return true;
}

async function pullRemoteState() {
  if (!isSyncReady()) return;
  try {
    const response = await fetch(getRemoteUrl(), { cache: "no-store" });
    if (!response.ok) throw new Error("Remote read failed");
    const remote = await response.json();

    if (!remote) {
      await pushRemoteState();
      return;
    }

    applyRemoteState(remote);
  } catch {
    $("#shareStatus").textContent = "공동 편집 연결을 확인해주세요.";
  }
}

function stopRemoteStream() {
  if (!syncState.stream) return;
  syncState.stream.close();
  syncState.stream = null;
}

function startRemoteStream() {
  if (!window.EventSource || !isSyncReady()) return false;
  stopRemoteStream();

  const stream = new EventSource(getRemoteUrl());
  syncState.stream = stream;

  stream.addEventListener("put", (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload?.path === "/" && payload.data) {
        applyRemoteState(payload.data, "공동 편집 내용이 바로 반영되었습니다.");
      } else {
        pullRemoteState();
      }
    } catch {
      pullRemoteState();
    }
  });

  stream.addEventListener("patch", () => pullRemoteState());
  stream.onerror = () => {
    stopRemoteStream();
  };

  return true;
}

function startSync() {
  if (syncState.timer) window.clearInterval(syncState.timer);
  stopRemoteStream();
  if (!isSyncReady()) return;
  localStorage.setItem(FIREBASE_URL_STORAGE, syncState.firebaseUrl);
  localStorage.setItem(TRIP_CODE_STORAGE, syncState.tripCode);
  pullRemoteState();
  const hasLiveStream = startRemoteStream();
  syncState.timer = window.setInterval(() => {
    if (!syncState.stream) startRemoteStream();
    pullRemoteState();
  }, hasLiveStream ? 10000 : 2500);
}

function createTripCode() {
  return `trip-${crypto.randomUUID().slice(0, 8)}-${Date.now().toString(36)}`;
}

function emptyNode() {
  return $("#emptyState").content.firstElementChild.cloneNode(true);
}

function upsert(collection, data) {
  const id = data.id || crypto.randomUUID();
  const existing = state[collection].findIndex((item) => item.id === id);
  const next = touch({ ...data, id });
  if (collection === "schedules") {
    next.lat = next.lat === "" ? "" : Number(next.lat);
    next.lon = next.lon === "" ? "" : Number(next.lon);
  }
  if (collection === "expenses") {
    next.amount = Number(next.amount || 0);
  }
  if (existing >= 0) {
    state[collection][existing] = { ...state[collection][existing], ...next };
  } else {
    state[collection].push(next);
  }
}

async function updateScheduleLocationAfterSave(data) {
  if (!data.placeQuery || (data.lat !== "" && data.lon !== "")) return;
  const enriched = await enrichScheduleLocation({ ...data });
  if (enriched.lat === "" || enriched.lon === "") return;

  upsert("schedules", enriched);
  state.meta.remoteUpdatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  syncState.lastSerialized = JSON.stringify(state);
  render();
  pushRemoteState();
}

function removeItem(collection, id, label) {
  state[collection] = state[collection].filter((item) => item.id !== id);
  save(`${label} 삭제`);
}

function renderMeta() {
  $("#tripName").value = state.meta.tripName;
  $("#startDate").value = state.meta.startDate;
  $("#endDate").value = state.meta.endDate;
  $("#budgetTotal").value = state.meta.budgetTotal;
  $("#firebaseUrl").value = syncState.firebaseUrl;
  $("#tripCode").value = syncState.tripCode;
  $("#publicAppUrl").value = syncState.publicAppUrl;
  $("#tripTitle").textContent = state.meta.tripName || "여행 일정";

  $$(".person").forEach((button) => button.classList.toggle("active", button.dataset.person === state.meta.activePerson));

  const start = state.meta.startDate ? new Date(`${state.meta.startDate}T00:00:00`) : null;
  const end = state.meta.endDate ? new Date(`${state.meta.endDate}T00:00:00`) : null;
  const days = start && end ? Math.max(1, Math.round((end - start) / 86400000) + 1) : 0;
  const cities = new Set(state.schedules.map((item) => item.city.trim()).filter(Boolean));
  const spent = state.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const left = Number(state.meta.budgetTotal || 0) - spent;

  $("#tripDays").textContent = days;
  $("#cityCount").textContent = cities.size;
  $("#budgetLeft").textContent = won(left);
}

function renderDayFilter() {
  const select = $("#dayFilter");
  const current = preferredDayFilter || select.value || "all";
  const dates = [...new Set(state.schedules.map((item) => item.date).filter(Boolean))].sort();
  select.innerHTML = `<option value="all">전체 날짜</option>${dates.map((date) => `<option value="${date}">${formatDate(date)}</option>`).join("")}`;
  select.value = dates.includes(current) ? current : "all";
  preferredDayFilter = "";
}

function renderSchedules() {
  renderDayFilter();
  const list = $("#scheduleList");
  const filter = $("#dayFilter").value;
  const items = state.schedules
    .filter((item) => filter === "all" || item.date === filter)
    .sort(byDateTime);
  list.innerHTML = "";
  if (!items.length) {
    list.append(emptyNode());
    return;
  }
  items.forEach((item) => {
    const node = document.createElement("article");
    node.className = "item";
    node.innerHTML = `
      <div class="item-top">
        <div>
          <h4>${escapeHtml(item.title)}</h4>
          <p>${formatDate(item.date)} ${item.time || ""} · ${escapeHtml(item.city)}</p>
          ${item.placeQuery ? `<p>${escapeHtml(item.placeQuery)}</p>` : ""}
          ${item.placeAddress ? `<p>${escapeHtml(item.placeAddress)}</p>` : ""}
          ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
        </div>
        <div class="item-actions">
          <button class="mini-btn" data-edit-schedule="${item.id}" title="수정" type="button">✎</button>
          <button class="mini-btn" data-delete-schedule="${item.id}" title="삭제" type="button">×</button>
        </div>
      </div>
      <div class="meta">
        <span class="chip">${currentPersonLabel(item.updatedBy)} 수정</span>
        ${item.lat && item.lon ? `<span class="chip">지도 위치 있음</span>` : ""}
      </div>
    `;
    list.append(node);
  });
}

function renderExpenses() {
  const list = $("#expenseList");
  const summary = $("#expenseSummary");
  const total = state.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const mine = state.expenses.filter((item) => item.payer === "me").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const partner = state.expenses.filter((item) => item.payer === "partner").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  summary.innerHTML = `
    <div class="summary-card"><span>총 지출</span><strong>${won(total)}</strong></div>
    <div class="summary-card"><span>내 결제</span><strong>${won(mine)}</strong></div>
    <div class="summary-card"><span>배우자 결제</span><strong>${won(partner)}</strong></div>
  `;

  list.innerHTML = "";
  if (!state.expenses.length) {
    list.append(emptyNode());
    return;
  }
  state.expenses.forEach((item) => {
    const node = document.createElement("article");
    node.className = "item";
    node.innerHTML = `
      <div class="item-top">
        <div>
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.category)} · ${won(item.amount)} · ${currentPersonLabel(item.payer)}</p>
          ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
        </div>
        <div class="item-actions">
          <button class="mini-btn" data-edit-expense="${item.id}" title="수정" type="button">✎</button>
          <button class="mini-btn" data-delete-expense="${item.id}" title="삭제" type="button">×</button>
        </div>
      </div>
      <div class="meta"><span class="chip">${currentPersonLabel(item.updatedBy)} 수정</span></div>
    `;
    list.append(node);
  });
}

function renderBookings() {
  const list = $("#bookingList");
  const items = [...state.bookings].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  list.innerHTML = "";
  if (!items.length) {
    list.append(emptyNode());
    return;
  }
  items.forEach((item) => {
    const node = document.createElement("article");
    node.className = "item";
    node.innerHTML = `
      <div class="item-top">
        <div>
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.type)} · ${formatDate(item.date)} · ${escapeHtml(item.code || "번호 없음")}</p>
          ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
        </div>
        <div class="item-actions">
          <button class="mini-btn" data-edit-booking="${item.id}" title="수정" type="button">✎</button>
          <button class="mini-btn" data-delete-booking="${item.id}" title="삭제" type="button">×</button>
        </div>
      </div>
      <div class="meta"><span class="chip">${currentPersonLabel(item.updatedBy)} 수정</span></div>
    `;
    list.append(node);
  });
}

function renderHistory() {
  const list = $("#historyList");
  list.innerHTML = "";
  const items = state.history.length ? state.history : [{ action: "샘플 여행 일정 생성", person: "me", at: new Date().toISOString() }];
  items.forEach((item) => {
    const node = document.createElement("article");
    node.className = "item";
    node.innerHTML = `
      <h4>${escapeHtml(item.action)}</h4>
      <p>${currentPersonLabel(item.person)} · ${new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.at))}</p>
    `;
    list.append(node);
  });
}

function renderSidePanels() {
  const today = $("#todayList");
  const firstDate = [...state.schedules].sort(byDateTime)[0]?.date;
  const todayItems = state.schedules.filter((item) => item.date === firstDate).sort(byDateTime);
  today.innerHTML = "";
  if (!todayItems.length) {
    today.append(emptyNode());
  } else {
    todayItems.forEach((item) => {
      const node = document.createElement("article");
      node.className = "item";
      node.innerHTML = `<h4>${escapeHtml(item.time)} ${escapeHtml(item.title)}</h4><p>${escapeHtml(item.city)}</p>`;
      today.append(node);
    });
  }

  const bars = $("#categoryBars");
  const grouped = state.expenses.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + Number(item.amount || 0);
    return acc;
  }, {});
  const max = Math.max(1, ...Object.values(grouped));
  bars.innerHTML = "";
  if (!Object.keys(grouped).length) {
    bars.append(emptyNode());
    return;
  }
  Object.entries(grouped).forEach(([category, amount]) => {
    const node = document.createElement("div");
    node.className = "bar-row";
    node.innerHTML = `
      <div class="bar-label"><span>${escapeHtml(category)}</span><span>${won(amount)}</span></div>
      <div class="bar"><span style="width:${Math.max(4, (amount / max) * 100)}%"></span></div>
    `;
    bars.append(node);
  });
}

function renderMap() {
  const points = getScheduleMapPoints();

  $("#googleMapsKey").value = BUILT_IN_GOOGLE_MAPS_KEY ? "" : googleMapState.key;
  $("#googleMapsKey").placeholder = BUILT_IN_GOOGLE_MAPS_KEY ? "배포 키 사용 중" : "Google Maps API 키";
  const links = $("#mapLinks");
  links.innerHTML = "";

  if (!googleMapState.key) {
    $("#travelMap").innerHTML = "Google Maps API 키를 입력하고 저장하면 구글 지도가 표시됩니다.";
    links.innerHTML = `<a class="map-link" href="https://developers.google.com/maps/documentation/javascript/get-api-key" target="_blank" rel="noreferrer">API 키 만들기</a>`;
    return;
  }

  const filter = getSelectedMapDate();
  if (!points.length) {
    links.innerHTML = `<span class="map-link">${filter === "all" ? "일정의 장소를 저장하면 구글 지도 경로가 표시됩니다." : "선택한 날짜에 지도 장소가 있는 일정이 없습니다."}</span>`;
  } else {
    links.innerHTML = `<button id="openGoogleRoute" class="map-link map-link-button" type="button">${filter === "all" ? "Google Maps에서 전체 경로 열기" : "Google Maps에서 선택 날짜 경로 열기"}</button>`;
  }

  loadGoogleMaps()
    .then(() => {
      initPlaceAutocomplete();
      drawGoogleMap(points);
    })
    .catch(() => {
      $("#travelMap").innerHTML = "Google Maps를 불러오지 못했습니다. API 키와 결제/도메인 제한 설정을 확인해주세요.";
    });
}

function getSelectedMapDate() {
  const filter = $("#dayFilter")?.value || "all";
  return filter;
}

function getScheduleMapPoints() {
  const filter = getSelectedMapDate();
  return state.schedules
    .filter((item) => filter === "all" || item.date === filter)
    .filter((item) => item.lat !== "" && item.lon !== "" && !Number.isNaN(Number(item.lat)) && !Number.isNaN(Number(item.lon)))
    .sort(byDateTime)
    .map((item) => ({ ...item, lat: Number(item.lat), lon: Number(item.lon) }));
}

function buildGoogleMapsRouteUrl(points = getScheduleMapPoints()) {
  if (!points.length) return "https://www.google.com/maps";
  if (points.length === 1) {
    const point = points[0];
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point.lat},${point.lon}`)}&query_place_id=${encodeURIComponent(point.placeId || "")}`;
  }

  const origin = points[0];
  const destination = points[points.length - 1];
  const waypointPoints = points.slice(1, -1).slice(0, 23);
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", `${origin.lat},${origin.lon}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lon}`);
  if (waypointPoints.length) {
    url.searchParams.set("waypoints", waypointPoints.map((point) => `${point.lat},${point.lon}`).join("|"));
  }
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}

function openGoogleMapsRoute() {
  const points = getScheduleMapPoints();
  if (!points.length) {
    $("#shareStatus").textContent = "먼저 일정에 지도 장소를 저장해주세요.";
    return;
  }
  window.open(buildGoogleMapsRouteUrl(points), "_blank", "noopener,noreferrer");
}

function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve();
  if (googleMapState.loadPromise) return googleMapState.loadPromise;

  googleMapState.loadPromise = new Promise((resolve, reject) => {
    const callbackName = `initTravelGoogleMap_${Date.now()}`;
    window[callbackName] = () => {
      delete window[callbackName];
      resolve();
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapState.key)}&callback=${callbackName}&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      delete window[callbackName];
      googleMapState.loadPromise = null;
      reject(new Error("Google Maps load failed"));
    };
    document.head.append(script);
  });

  return googleMapState.loadPromise;
}

function drawGoogleMap(points) {
  const center = points[0] ? { lat: points[0].lat, lng: points[0].lon } : { lat: 37.5665, lng: 126.9780 };
  if (!googleMapState.map) {
    $("#travelMap").innerHTML = "";
    googleMapState.map = new google.maps.Map($("#travelMap"), {
      center,
      zoom: points.length ? 4 : 3,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true
    });
    googleMapState.map.addListener("click", openGoogleMapsRoute);
  }

  googleMapState.markers.forEach((marker) => marker.setMap(null));
  googleMapState.markers = [];
  if (googleMapState.route) googleMapState.route.setMap(null);
  googleMapState.route = null;

  if (!points.length) {
    googleMapState.map.setCenter(center);
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  const path = points.map((point, index) => {
    const position = { lat: point.lat, lng: point.lon };
    bounds.extend(position);
    const marker = new google.maps.Marker({
      position,
      map: googleMapState.map,
      label: String(index + 1),
      title: `${point.city} - ${point.title}`
    });
    const info = new google.maps.InfoWindow({
      content: `<strong>${escapeHtml(point.city)}</strong><br>${escapeHtml(point.title)}<br>${formatDate(point.date)} ${escapeHtml(point.time || "")}`
    });
    marker.addListener("click", () => info.open({ anchor: marker, map: googleMapState.map }));
    googleMapState.markers.push(marker);
    return position;
  });

  if (path.length > 1) {
    googleMapState.route = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: "#e3655b",
      strokeOpacity: 0.92,
      strokeWeight: 4,
      map: googleMapState.map
    });
  }

  googleMapState.map.fitBounds(bounds, 60);
}

function fitMapToRoute() {
  if (googleMapState.map && googleMapState.markers.length) {
    const bounds = new google.maps.LatLngBounds();
    googleMapState.markers.forEach((marker) => bounds.extend(marker.getPosition()));
    googleMapState.map.fitBounds(bounds, 60);
  }
  $("#mapWrap").scrollIntoView({ behavior: "smooth", block: "center" });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function render() {
  renderMeta();
  renderSchedules();
  renderExpenses();
  renderBookings();
  renderHistory();
  renderSidePanels();
  renderMap();
}

function bindEvents() {
  $("#saveAll").addEventListener("click", saveCurrentWork);

  ["tripName", "startDate", "endDate", "budgetTotal"].forEach((id) => {
    $(`#${id}`).addEventListener("change", (event) => {
      state.meta[id] = event.target.type === "number" ? Number(event.target.value || 0) : event.target.value;
      save("여행 정보 수정");
      setSaveStatus("여행 정보를 저장했습니다.");
      showSaveToast("여행 정보를 저장했습니다.");
    });
  });

  $("#saveGoogleKey").addEventListener("click", () => {
    googleMapState.key = $("#googleMapsKey").value.trim();
    if (googleMapState.key) {
      localStorage.setItem(GOOGLE_KEY_STORAGE, googleMapState.key);
      $("#shareStatus").textContent = "Google Maps API 키를 저장했습니다.";
    } else {
      localStorage.removeItem(GOOGLE_KEY_STORAGE);
      $("#shareStatus").textContent = "Google Maps API 키를 삭제했습니다.";
    }
    googleMapState.map = null;
    googleMapState.markers = [];
    googleMapState.route = null;
    googleMapState.loadPromise = null;
    renderMap();
  });

  $("#makeTripCode").addEventListener("click", () => {
    $("#tripCode").value = createTripCode();
    $("#shareStatus").textContent = "새 여행 코드를 만들었습니다.";
  });

  $("#connectSync").addEventListener("click", () => {
    syncState.firebaseUrl = $("#firebaseUrl").value.trim();
    syncState.tripCode = $("#tripCode").value.trim();
    syncState.publicAppUrl = $("#publicAppUrl").value.trim();
    if (!syncState.firebaseUrl || !syncState.tripCode) {
      $("#shareStatus").textContent = "Firebase DB 주소와 여행 코드를 모두 입력해주세요.";
      return;
    }
    if (syncState.publicAppUrl) localStorage.setItem(PUBLIC_APP_URL_STORAGE, syncState.publicAppUrl);
    startSync();
    $("#shareStatus").textContent = "공동 편집을 연결했습니다.";
  });

  $$(".person").forEach((button) => {
    button.addEventListener("click", () => {
      state.meta.activePerson = button.dataset.person;
      save(`${currentPersonLabel()}로 수정자 변경`);
    });
  });

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((item) => item.classList.remove("active"));
      $$(".tab-panel").forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      $(`#${tab.dataset.tab}Panel`).classList.add("active");
    });
  });

  $("#dayFilter").addEventListener("change", () => {
    renderSchedules();
    renderMap();
  });

  $("#scheduleForm input[name='placeQuery']").addEventListener("focus", () => {
    if (!googleMapState.key) return;
    loadGoogleMaps()
      .then(initPlaceAutocomplete)
      .catch(() => {
        $("#shareStatus").textContent = "장소 자동완성을 불러오지 못했습니다.";
      });
  });

  $("#scheduleForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formToObject(event.currentTarget);
    if (!data.id) data.id = crypto.randomUUID();
    preferredDayFilter = data.date || "all";
    upsert("schedules", data);
    resetForm(event.currentTarget);
    save("일정 저장");
    setSaveStatus("일정을 저장했습니다.");
    showSaveToast("일정을 저장했습니다.");
    updateScheduleLocationAfterSave(data);
  });
  $("#expenseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    upsert("expenses", formToObject(event.currentTarget));
    resetForm(event.currentTarget);
    save("비용 저장");
    setSaveStatus("비용을 저장했습니다.");
    showSaveToast("비용을 저장했습니다.");
  });
  $("#bookingForm").addEventListener("submit", (event) => {
    event.preventDefault();
    upsert("bookings", formToObject(event.currentTarget));
    resetForm(event.currentTarget);
    save("예약 저장");
    setSaveStatus("예약을 저장했습니다.");
    showSaveToast("예약을 저장했습니다.");
  });

  $("#clearSchedule").addEventListener("click", () => resetForm($("#scheduleForm")));
  $("#clearExpense").addEventListener("click", () => resetForm($("#expenseForm")));
  $("#clearBooking").addEventListener("click", () => resetForm($("#bookingForm")));

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;

    if (target.id === "openGoogleRoute") {
      openGoogleMapsRoute();
      return;
    }

    const editSchedule = target.dataset.editSchedule;
    const deleteSchedule = target.dataset.deleteSchedule;
    const editExpense = target.dataset.editExpense;
    const deleteExpense = target.dataset.deleteExpense;
    const editBooking = target.dataset.editBooking;
    const deleteBooking = target.dataset.deleteBooking;

    if (editSchedule) fillForm($("#scheduleForm"), state.schedules.find((item) => item.id === editSchedule));
    if (deleteSchedule) removeItem("schedules", deleteSchedule, "일정");
    if (editExpense) fillForm($("#expenseForm"), state.expenses.find((item) => item.id === editExpense));
    if (deleteExpense) removeItem("expenses", deleteExpense, "비용");
    if (editBooking) fillForm($("#bookingForm"), state.bookings.find((item) => item.id === editBooking));
    if (deleteBooking) removeItem("bookings", deleteBooking, "예약");
  });

  $("#exportJson").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.meta.tripName || "travel-plan"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    $("#shareStatus").textContent = "백업 파일을 만들었습니다.";
  });

  $("#importJson").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      state = JSON.parse(await file.text());
      save("백업 불러오기");
      $("#shareStatus").textContent = "백업을 불러왔습니다.";
    } catch {
      $("#shareStatus").textContent = "파일을 읽지 못했습니다.";
    }
  });

  $("#copyShare").addEventListener("click", async () => {
    syncState.publicAppUrl = $("#publicAppUrl").value.trim();
    if (syncState.publicAppUrl) localStorage.setItem(PUBLIC_APP_URL_STORAGE, syncState.publicAppUrl);
    const currentBaseUrl = location.href.split("?")[0];
    const baseUrl = syncState.publicAppUrl || currentBaseUrl;
    const url = new URL(baseUrl);
    if (syncState.firebaseUrl && syncState.tripCode) {
      url.searchParams.set("db", syncState.firebaseUrl);
      url.searchParams.set("code", syncState.tripCode);
    } else {
      url.searchParams.set("trip", btoa(encodeURIComponent(JSON.stringify(state))));
    }
    try {
      await navigator.clipboard.writeText(url.toString());
      $("#shareStatus").textContent = url.hostname === "localhost" || url.hostname === "127.0.0.1"
        ? "localhost 링크는 내 컴퓨터에서만 열립니다. 공개 앱 주소를 넣어주세요."
        : "공유 링크를 복사했습니다.";
    } catch {
      $("#shareStatus").textContent = url.toString();
    }
  });

  $("#fitRoute").addEventListener("click", () => {
    fitMapToRoute(true);
  });

  $("#travelMap").addEventListener("dblclick", () => {
    openGoogleMapsRoute();
  });
}

bindEvents();
render();
syncState.lastSerialized = JSON.stringify(state);
startSync();
