import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getAuth, getIdTokenResult, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import { getDatabase, onValue, ref } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-database.js";
import { API_BASE, firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
const values = (object) => Object.values(object || {});
const formatTime = (value) => value ? new Date(value).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "Never";
let currentUser;
let currentClaims;
let toastTimer;

function toast(message) {
  $("#adminToast").textContent = message;
  $("#adminToast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#adminToast").classList.remove("show"), 2600);
}

async function api(path, options = {}) {
  const token = await currentUser.getIdToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

function record(title, detail, meta) {
  return `<div class="record"><div><strong>${esc(title)}</strong><small>${esc(detail)}</small></div><em>${esc(meta)}</em></div>`;
}

function reportRecord(item) {
  return `<div class="record action-record"><div><strong>${esc(item.subject || item.type)}</strong><small>${esc(`${item.type}: ${item.body}`)}</small></div><div class="record-actions"><button data-report="${esc(item.id)}" data-status="in_progress">Claim</button><button data-report="${esc(item.id)}" data-status="resolved">Resolve</button><button data-report="${esc(item.id)}" data-status="dismissed">Dismiss</button></div></div>`;
}

async function loadOverview() {
  const overview = await api("/api/admin/overview");
  $("#adminServerState").textContent = overview.status?.online ? "ONLINE" : "OFFLINE";
  $("#adminPlayers").textContent = overview.status?.playerCount ?? 0;
  $("#adminReports").textContent = overview.openReports ?? 0;
  $("#adminBackup").textContent = overview.backups?.[0] ? formatTime(overview.backups[0].createdAt) : "Never";
  $("#backupList").innerHTML = overview.backups?.length
    ? overview.backups.slice(0, 5).map((item) => record(item.file, item.size, formatTime(item.createdAt))).join("")
    : '<div class="empty">No backups reported.</div>';
  $("#reportsList").innerHTML = overview.reports?.length
    ? overview.reports.map(reportRecord).join("")
    : '<div class="empty">No open reports or appeals.</div>';
  $("#activityList").innerHTML = overview.activity?.length
    ? overview.activity.map((item) => record(item.action || item.a, `${item.player || item.p || "system"} · ${item.detail || item.i || ""}`, formatTime(item.timestamp || item.t))).join("")
    : '<div class="empty">No recent server activity.</div>';
  $("#maintenanceMode").checked = Boolean(overview.config?.maintenanceMode);
  $("#publicLocations").checked = overview.config?.publicLocations !== false;
  $("#acceptForms").checked = overview.config?.acceptForms !== false;
  $("#mapRenderUrl").value = overview.config?.mapRenderUrl || "";
  const analytics = overview.analytics || {};
  $("#adminAnalytics").innerHTML = [
    ["Citizens", analytics.citizens || 0],
    ["Online", analytics.online || 0],
    ["Wanted", analytics.wanted || 0],
    ["City wealth", `$${Number(analytics.totalWealth || 0).toLocaleString("en-US")}`],
    ["Businesses", analytics.businesses || 0],
    ["Properties", analytics.properties || 0],
    ["Open incidents", analytics.openIncidents || 0]
  ].map(([label, value]) => `<span><small>${esc(label)}</small><strong>${esc(value)}</strong></span>`).join("");
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#loginResult").textContent = "Checking credentials...";
  try {
    await signInWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value);
  } catch (error) {
    $("#loginResult").textContent = error.message.replace("Firebase: ", "");
  }
});

$("#logoutButton").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    $("#loginPanel").classList.remove("hidden");
    $("#adminConsole").classList.add("hidden");
    return;
  }
  currentClaims = await getIdTokenResult(user, true);
  if (!currentClaims.claims.admin && !currentClaims.claims.staff) {
    $("#loginResult").textContent = "This account is authenticated but has no Gridlock staff claim.";
    await signOut(auth);
    return;
  }
  $("#loginPanel").classList.add("hidden");
  $("#adminConsole").classList.remove("hidden");
  $("#staffIdentity").textContent = `${user.email} · ${currentClaims.claims.admin ? "Administrator" : "Staff"}`;
  try {
    await loadOverview();
  } catch (error) {
    toast(error.message);
  }
  if (window.lucide) window.lucide.createIcons();
});

onValue(ref(db, "serverStatus"), (snapshot) => {
  const status = snapshot.val() || {};
  $("#adminServerState").textContent = status.online ? "ONLINE" : "OFFLINE";
  $("#adminPlayers").textContent = status.playerCount ?? 0;
});

$("#announcementForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/admin/announcement", { method: "POST", body: JSON.stringify({ title: $("#announcementTitle").value, body: $("#announcementBody").value, category: $("#announcementCategory").value }) });
    event.target.reset();
    toast("Announcement published.");
  } catch (error) { toast(error.message); }
});

$("#commandPreset").addEventListener("change", () => { if ($("#commandPreset").value) $("#serverCommand").value = $("#commandPreset").value; });
$("#commandForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const command = $("#serverCommand").value.trim() || $("#commandPreset").value;
  if (!command) return toast("Enter a command.");
  if (!confirm(`Queue this server command?\n\n${command}`)) return;
  try {
    await api("/api/admin/server-command", { method: "POST", body: JSON.stringify({ command }) });
    $("#serverCommand").value = "";
    toast("Command queued for the Minecraft server.");
  } catch (error) { toast(error.message); }
});

$("#broadcastForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/admin/broadcast", { method: "POST", body: JSON.stringify({ message: $("#broadcastText").value }) });
    event.target.reset();
    toast("Broadcast queued.");
  } catch (error) { toast(error.message); }
});

$("#configForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/admin/config", { method: "POST", body: JSON.stringify({ maintenanceMode: $("#maintenanceMode").checked, publicLocations: $("#publicLocations").checked, acceptForms: $("#acceptForms").checked, mapRenderUrl: $("#mapRenderUrl").value.trim() }) });
    toast("Network configuration saved.");
  } catch (error) { toast(error.message); }
});

$("#backupButton").addEventListener("click", async () => {
  try {
    toast("Backup started...");
    await api("/api/admin/backup", { method: "POST" });
    await loadOverview();
    toast("Firebase backup saved.");
  } catch (error) { toast(error.message); }
});

$("#playerLookupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api(`/api/admin/players?q=${encodeURIComponent($("#playerLookup").value.trim())}`);
    $("#playerLookupResults").innerHTML = result.players?.length
      ? result.players.map((player) => `<button class="record player-result" type="button" data-player-name="${esc(player.username)}"><div><strong>${esc(player.username)}</strong><small>${esc(`${player.job || "Citizen"} · ${player.warnings || 0} warning(s) · ${player.wanted || 0} wanted stars`)}</small></div><em>${player.banned ? "BANNED" : player.online ? "ONLINE" : "OFFLINE"}</em></button>`).join("")
      : '<div class="empty">No matching citizens.</div>';
  } catch (error) { toast(error.message); }
});

$("#playerLookupResults").addEventListener("click", (event) => {
  const result = event.target.closest("[data-player-name]");
  if (result) $("#actionPlayer").value = result.dataset.playerName;
});

$("#playerAction").addEventListener("change", () => {
  $("#actionDestination").classList.toggle("hidden", $("#playerAction").value !== "teleport");
});

$("#playerActionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = $("#playerAction").value;
  const player = $("#actionPlayer").value.trim();
  if (!confirm(`Apply ${action} to ${player}?`)) return;
  try {
    await api("/api/admin/player-action", {
      method: "POST",
      body: JSON.stringify({ action, player, destination: $("#actionDestination").value.trim(), reason: $("#actionReason").value.trim() })
    });
    toast(`${action} applied to ${player}.`);
  } catch (error) { toast(error.message); }
});

$("#publicRecordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/admin/public-record", {
      method: "POST",
      body: JSON.stringify({ collection: $("#recordCollection").value, title: $("#recordTitle").value, detail: $("#recordDetail").value, meta: $("#recordMeta").value })
    });
    event.target.reset();
    toast("Public record published.");
  } catch (error) { toast(error.message); }
});

$("#reportsList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-report]");
  if (!button) return;
  try {
    await api(`/api/admin/reports/${encodeURIComponent(button.dataset.report)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: button.dataset.status })
    });
    await loadOverview();
    toast(`Report marked ${button.dataset.status.replace("_", " ")}.`);
  } catch (error) { toast(error.message); }
});

window.addEventListener("load", () => { if (window.lucide) window.lucide.createIcons(); });
