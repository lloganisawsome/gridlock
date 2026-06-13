import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import { getDatabase, onValue, push, ref, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-database.js";
import { firebaseConfig, MAP_RENDER_URL } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const state = {
  status: {},
  players: {},
  public: {},
  livePlayers: {},
  user: null,
  mapLayer: "players",
  mapZoom: 1
};

const demo = {
  news: [{ title: "Welcome to the Gridlock Civic Network", body: "Live city records, server information, public safety updates, and community services now share one home.", category: "City announcement", timestamp: Date.now() }],
  officials: { president: "Vacant", governor: "Vacant", mayor: "Vacant", chiefOfPolice: "Vacant" },
  events: [{ title: "Opening session", date: "To be announced", location: "City Hall" }],
  transit: [{ name: "Central Rail", status: "Planning", detail: "Route details pending" }],
  roads: [{ name: "Downtown network", status: "Open", detail: "No major delays" }],
  laws: [
    { title: "Title 1 - Citizen Rights", detail: "Property, fair trial, representation, voting, business, appeal, and protection from unlawful seizure." },
    { title: "Title 2 - Property Laws", detail: "No trespassing, theft, vandalism, unauthorized construction, or damage to buildings, vehicles, and decorations." },
    { title: "Title 3 - Criminal Laws", detail: "Theft, robbery, assault, murder, fraud, bribery, corruption, hacking, duping, and prison escape are prohibited." },
    { title: "Title 4 - Infrastructure Laws", detail: "Roads, bridges, railways, airports, utilities, and public access routes may not be damaged or blocked." },
    { title: "Title 5 - Firearm Laws", detail: "Reckless discharge, brandishing, and weapons in protected public facilities are prohibited." },
    { title: "Title 6 - Business Laws", detail: "Businesses require licenses and displayed prices; scams and false advertising are prohibited." },
    { title: "Title 7 - Tax Laws", detail: "Property, business, and vehicle taxes are required. Evasion and false filings are prohibited." },
    { title: "Title 8 - Building Code", detail: "Buildings need entrances and safe exits; floating structures, abandoned projects, and dirt towers are prohibited in city limits." },
    { title: "Title 9 - Environmental Laws", detail: "Waste dumping and protected-area development are prohibited; major logging requires replanting." },
    { title: "Title 10 - Government Ethics", detail: "Abuse of power, election interference, misuse of funds, and judicial conflicts of interest are prohibited." },
    { title: "Title 11 - Civil Code", detail: "Property, contract, business, and debt disputes may be filed; knowingly false or excessive claims may be punished." },
    { title: "Title 12 - Evidence Code", detail: "Screenshots, video, testimony, chat logs, server logs, and camera footage may be admitted. False evidence is a crime." },
    { title: "Title 13 - Emergency Laws", detail: "Emergency powers may be activated for natural disasters, major griefing, and server emergencies." }
  ]
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const values = (object) => Object.values(object || {});
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const money = (value) => `$${Math.floor(Number(value) || 0).toLocaleString("en-US")}`;
const formatTime = (value) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
const empty = (label) => `<div class="empty">${esc(label)}</div>`;
const record = (title, detail = "", meta = "") => `<div class="record"><div><strong>${esc(title)}</strong><small>${esc(detail)}</small></div><em>${esc(meta)}</em></div>`;

function activateView(name) {
  const target = document.querySelector(`.view[data-page="${name}"]`) ? name : "overview";
  $$(".view").forEach((view) => view.classList.toggle("active", view.dataset.page === target));
  $$("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === target));
  history.replaceState(null, "", `#${target}`);
  window.scrollTo({ top: target === "overview" ? 0 : document.querySelector(".workspace").offsetTop, behavior: "smooth" });
  if (target === "map") renderMap();
}

function normalizedPublic() {
  return {
    ...demo,
    ...(state.public || {}),
    news: values(state.public?.news).length ? values(state.public.news) : demo.news,
    events: values(state.public?.events).length ? values(state.public.events) : demo.events,
    transit: values(state.public?.transit).length ? values(state.public.transit) : demo.transit,
    roads: values(state.public?.roads).length ? values(state.public.roads) : demo.roads,
    laws: values(state.public?.laws).length ? values(state.public.laws) : demo.laws
  };
}

function renderStatus() {
  const status = state.status || {};
  const online = status.online === true && Date.now() - Number(status.updatedAt || 0) < 90000;
  $("#statusDot").className = `status-dot ${online ? "online" : "offline"}`;
  $("#serverState").textContent = online ? "Server online" : "Server offline";
  $("#onlineCount").textContent = Number(status.playerCount || values(state.livePlayers).length);
  $("#capacityText").textContent = `of ${Number(status.maxPlayers || 30)} players`;
  $("#uptimeText").textContent = status.uptimeSeconds ? `${Math.floor(status.uptimeSeconds / 3600)}h ${Math.floor(status.uptimeSeconds % 3600 / 60)}m` : "--";
  $("#restartText").textContent = status.lastRestart ? `Restarted ${formatTime(status.lastRestart)}` : "waiting for bridge";
  $("#tpsText").textContent = `${Number(status.tps || 0).toFixed(1)} TPS`;
  $("#memoryText").textContent = status.ram?.used ? `${status.ram.used} / ${status.ram.total} RAM` : "server telemetry";
  $("#lastUpdated").textContent = status.updatedAt ? `Updated ${formatTime(status.updatedAt)}` : "Awaiting first update";
}

function renderOverview() {
  const data = normalizedPublic();
  const profiles = values(state.players);
  const news = [...data.news].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
  const citizens = profiles.length || Number(data.stats?.citizens || 0);
  const wanted = profiles.filter((profile) => Number(profile.wanted) > 0);
  const warrants = values(data.warrants).filter((entry) => entry.status === "active");
  const cases = values(data.courtCases).filter((entry) => !["closed", "dismissed"].includes(entry.status));
  const dispatches = values(data.dispatches).filter((entry) => !String(entry.status).startsWith("closed"));
  const businesses = values(data.businesses);
  const properties = values(data.properties);
  const jobs = businesses.flatMap((business) => values(business.openPositions)).filter((job) => job.active !== false);
  const accounts = values(data.wealth);
  const total = accounts.reduce((sum, item) => sum + Number(item.netWorth || 0), 0);
  $("#leadNewsTitle").textContent = news[0]?.title || "No city news yet";
  $("#leadNewsBody").textContent = news[0]?.body || "City Hall has not published an announcement.";
  $("#citizenCount").textContent = `${citizens} registered`;
  $("#wantedCount").textContent = `${wanted.length} wanted`;
  $("#dispatchCount").textContent = dispatches.length;
  $("#warrantCount").textContent = warrants.length;
  $("#caseCount").textContent = cases.length;
  $("#economyTotal").textContent = `${money(total)} circulating`;
  $("#businessCount").textContent = businesses.length;
  $("#propertyCount").textContent = properties.length;
  $("#jobCount").textContent = jobs.length;
  $("#projectCount").textContent = values(data.construction).filter((item) => item.status !== "complete").length;
  $("#transitCount").textContent = data.transit.filter((item) => item.status !== "Normal").length;
  $("#nextEvent").textContent = data.events[0]?.title || "None posted";
  $("#populationBars").innerHTML = Array.from({ length: 12 }, (_, index) => `<i class="${index < Math.min(12, Math.ceil(citizens / 2)) ? "hot" : ""}" style="height:${16 + ((index * 17) % 48)}px"></i>`).join("");
  const tickerItems = [
    `${state.status?.playerCount || 0} PLAYERS ONLINE`,
    `${dispatches.length} OPEN INCIDENTS`,
    `${businesses.length} REGISTERED BUSINESSES`,
    news[0]?.title || "NO CITY NEWS YET",
    `CITY TIME ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
  ];
  const ticker = tickerItems.join("  ·  ");
  $("#tickerTrack").textContent = `${ticker}  ·  ${ticker}  ·  `;
  renderMap($("#overviewMap"));
}

function renderPlayers(filter = "") {
  const profiles = values(state.players).filter((profile) => String(profile.username || "").toLowerCase().includes(filter.toLowerCase()));
  $("#playerGrid").innerHTML = profiles.length ? profiles.map((profile) => `
    <article class="citizen-card">
      <div class="citizen-head"><div class="avatar">${esc(String(profile.username || "?").slice(0, 2).toUpperCase())}</div><div><h3>${esc(profile.username)}</h3><p>${profile.online ? "Online now" : `Last seen ${formatTime(profile.lastSeen)}`}</p></div></div>
      <div class="citizen-stats"><span>JOB<b>${esc(profile.job || "Citizen")}</b></span><span>WEALTH<b>${money(profile.netWorth)}</b></span><span>WANTED<b>${Number(profile.wanted || 0)} stars</b></span></div>
    </article>`).join("") : empty("No citizen profiles have synced yet.");
}

function mapPosition(location) {
  const scale = 1200;
  return {
    left: `${50 + Math.max(-45, Math.min(45, Number(location.x || 0) / scale * 45))}%`,
    top: `${50 + Math.max(-43, Math.min(43, Number(location.z || 0) / scale * 43))}%`
  };
}

function renderMap(target = $("#liveMap")) {
  if (!target) return;
  const data = normalizedPublic();
  const external = state.public?.config?.mapRenderUrl || MAP_RENDER_URL;
  target.style.backgroundImage = external ? `url("${external}")` : "";
  const source = state.mapLayer === "property"
    ? values(data.properties).map((item) => ({ ...item, label: item.name, className: "property" }))
    : state.mapLayer === "incidents"
      ? values(data.dispatches).filter((item) => !String(item.status).startsWith("closed")).map((item) => ({ ...item, label: item.type, className: "incident" }))
      : values(state.livePlayers).map((item) => ({ ...item, label: item.username, className: "" }));
  target.innerHTML = source.map((item) => {
    const point = mapPosition(item.location || item);
    return `<span class="map-marker ${item.className}" style="left:${point.left};top:${point.top}">${esc(item.label || "Marker")}</span>`;
  }).join("");
  if (target.id === "liveMap") target.style.transform = `scale(${state.mapZoom})`;
}

function renderRecords() {
  const data = normalizedPublic();
  const profiles = values(state.players);
  const officialEntries = Object.entries(data.officials || {});
  $("#officialsList").innerHTML = officialEntries.length ? officialEntries.map(([office, name]) => record(name, office.replace(/([A-Z])/g, " $1"), "ACTIVE")).join("") : empty("No office holders published.");
  $("#governmentNews").innerHTML = data.news.filter((item) => ["Election", "City announcement"].includes(item.category)).slice(0, 6).map((item) => record(item.title, item.body, formatTime(item.timestamp))).join("") || empty("No government announcements.");
  $("#electionsList").innerHTML = values(data.elections).map((item) => record(item.title, item.description, item.status)).join("") || empty("No active election or public vote.");
  $("#wantedList").innerHTML = profiles.filter((item) => Number(item.wanted) > 0).map((item) => record(item.username, item.record?.slice(-1)?.[0]?.offense || "Active wanted status", `${item.wanted} STAR`)).join("") || empty("No citizens are currently wanted.");
  $("#warrantsList").innerHTML = values(data.warrants).filter((item) => item.status === "active").map((item) => record(item.subject, item.reason || item.offense, `${item.stars || 1} STAR`)).join("") || empty("No active warrants.");
  $("#courtList").innerHTML = values(data.courtCases).map((item) => record(item.title || `${item.plaintiff || "City"} v. ${item.defendant || "Unknown"}`, item.charge || item.summary, item.date || item.status)).join("") || empty("No court cases published.");
  const businesses = values(data.businesses);
  $("#businessList").innerHTML = businesses.map((item) => record(item.name, `${item.type || "Company"} · Owner: ${item.owner}`, item.active === false ? "INACTIVE" : "OPEN")).join("") || empty("No companies registered.");
  $("#jobsList").innerHTML = businesses.flatMap((business) => values(business.openPositions).map((job) => ({ ...job, business: business.name }))).map((item) => record(item.title, item.business, money(item.pay))).join("") || empty("No job openings.");
  $("#wealthList").innerHTML = values(data.wealth).sort((a, b) => Number(b.netWorth) - Number(a.netWorth)).slice(0, 15).map((item, index) => record(`#${index + 1} ${item.username}`, `${item.businesses || 0} businesses · ${item.properties || 0} properties`, money(item.netWorth))).join("") || empty("Wealth rankings await a server snapshot.");
  $("#propertyList").innerHTML = values(data.properties).map((item) => record(item.name, `${item.type || "Property"} · Owner: ${item.owner}`, money(item.value))).join("") || empty("No properties registered.");
  $("#permitList").innerHTML = values(data.permits).map((item) => record(item.project, item.applicant, item.status)).join("") || empty("No building permits.");
  $("#constructionList").innerHTML = values(data.construction).map((item) => record(item.name, item.location, `${item.progress || 0}%`)).join("") || empty("No active construction projects.");
  $("#newsGrid").innerHTML = data.news.sort((a, b) => Number(b.timestamp) - Number(a.timestamp)).map((item, index) => `<article class="news-card ${index === 0 ? "featured" : ""}"><span>${esc(item.category || "CITY NEWS")}</span><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p><time>${formatTime(item.timestamp)}</time></article>`).join("");
  $("#transitList").innerHTML = data.transit.map((item) => record(item.name, item.detail, item.status)).join("");
  $("#roadList").innerHTML = data.roads.map((item) => record(item.name, item.detail, item.status)).join("");
  $("#airportList").innerHTML = values(data.airports).map((item) => record(item.name, item.schedule || item.detail, item.status)).join("") || empty("No airport schedules published.");
  for (const type of ["police", "fire", "ems"]) {
    const node = $(`#${type}Log`);
    node.innerHTML = values(data.dispatches).filter((item) => item.type === type).slice(-12).reverse().map((item) => record(item.reason || item.summary || "Dispatch", item.subject || item.locationName, item.status)).join("") || empty(`No ${type.toUpperCase()} incidents.`);
  }
  $("#eventList").innerHTML = data.events.map((item) => record(item.title, item.location, item.date)).join("");
  const activeIncidents = values(data.dispatches).filter((item) => !String(item.status || "").startsWith("closed")).length;
  const activeWarrants = values(data.warrants).filter((item) => item.status === "active").length;
  $("#dailyActive").textContent = profiles.filter((item) => item.online).length;
  $("#analyticsWealth").textContent = money(values(data.wealth).reduce((sum, item) => sum + Number(item.netWorth || 0), 0));
  $("#crimeRate").textContent = activeIncidents + activeWarrants;
  $("#censusCount").textContent = profiles.length;
  $("#budgetList").innerHTML = values(data.budget).map((item) => record(item.department || item.title, item.detail || item.description, money(item.amount))).join("") || empty("City Hall has not published a budget yet.");
  $("#hallOfFameList").innerHTML = values(data.hallOfFame).map((item) => record(item.name || item.title, item.achievement || item.detail, item.year || "")).join("") || empty("No Hall of Fame entries have been published.");
  $("#timelineList").innerHTML = values(data.timeline).sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)).map((item) => record(item.title || item.name, item.detail || item.description, item.date || formatTime(item.timestamp))).join("") || empty("Gridlock history is waiting for its first entry.");
  $("#lawsList").innerHTML = values(data.laws).map((item) => record(item.title || item.name, item.detail || item.description, item.status || "IN FORCE")).join("") || empty("The public law code has not been published yet.");
}

function renderAll() {
  renderStatus();
  renderOverview();
  renderPlayers($("#playerSearch")?.value || "");
  renderRecords();
  renderMap();
  if (window.lucide) window.lucide.createIcons();
}

onValue(ref(db, "serverStatus"), (snapshot) => { state.status = snapshot.val() || {}; renderAll(); });
onValue(ref(db, "livePlayers"), (snapshot) => { state.livePlayers = snapshot.val() || {}; renderAll(); });
onValue(ref(db, "public/playerProfiles"), (snapshot) => { state.players = snapshot.val() || {}; renderAll(); });
onValue(ref(db, "public"), (snapshot) => { state.public = snapshot.val() || {}; renderAll(); });
onAuthStateChanged(auth, (user) => {
  state.user = user;
  $("#requestResult").textContent = user ? `Signed in as ${user.email}` : "Sign in is required before submission.";
  $("#citizenAuthResult").textContent = user ? `Signed in as ${user.email}` : "Sign in with your Gridlock account to submit forms.";
  $("#citizenLogoutButton").classList.toggle("hidden", !user);
  $("#citizenLoginForm").classList.toggle("signed-in", Boolean(user));
});

$$("[data-view]").forEach((button) => button.addEventListener("click", (event) => { if (button.tagName === "A" && !button.dataset.view) return; event.preventDefault(); activateView(button.dataset.view); }));
$$("[data-map-layer]").forEach((button) => button.addEventListener("click", () => { $$("[data-map-layer]").forEach((item) => item.classList.remove("active")); button.classList.add("active"); state.mapLayer = button.dataset.mapLayer; renderMap(); }));
$("#zoomIn").addEventListener("click", () => { state.mapZoom = Math.min(1.5, state.mapZoom + .1); renderMap(); });
$("#zoomOut").addEventListener("click", () => { state.mapZoom = Math.max(.8, state.mapZoom - .1); renderMap(); });
$("#playerSearch").addEventListener("input", (event) => renderPlayers(event.target.value));
$("#citizenLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.user) return;
  $("#citizenAuthResult").textContent = "Signing in...";
  try {
    await signInWithEmailAndPassword(auth, $("#citizenEmail").value.trim(), $("#citizenPassword").value);
    $("#citizenPassword").value = "";
  } catch (error) {
    $("#citizenAuthResult").textContent = error.message.replace("Firebase: ", "");
  }
});
$("#citizenLogoutButton").addEventListener("click", () => signOut(auth));
$("#communityForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.user) { $("#requestResult").textContent = "Please sign in with your citizen account first."; return; }
  if (state.public?.config?.acceptForms === false) { $("#requestResult").textContent = "City Hall submissions are temporarily closed."; return; }
  await push(ref(db, "communitySubmissions"), { uid: state.user.uid, email: state.user.email, type: $("#requestType").value, subject: $("#requestSubject").value.trim(), body: $("#requestBody").value.trim(), status: "open", createdAt: serverTimestamp() });
  event.target.reset();
  $("#requestResult").textContent = "Submitted to City Hall.";
});

setInterval(() => { $("#worldClock").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }, 1000);
activateView(location.hash.slice(1) || "overview");
renderAll();
