// Ordovie — sécurité : verrouillage (empreinte + mot de passe de secours) et sauvegarde chiffrée.
// Tout est local : aucun serveur. Chiffrement via Web Crypto (PBKDF2-SHA256 + AES-GCM 256 bits).
"use strict";

const LOCK_AFTER_MS = 5 * 60 * 1000;   // reverrouillage après 5 min en arrière-plan
const LOCK_ITER = 200000;              // dérivation du mot de passe de verrouillage
const BACKUP_ITER = 310000;            // dérivation du mot de passe de sauvegarde
const enc = new TextEncoder(), dec = new TextDecoder();

/* ---------- utilitaires crypto ---------- */
// Conversion par blocs : l'ancienne version (spread) plantait sur de gros volumes (sauvegardes avec documents).
const b64 = (buf) => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
async function pbkdf2Bits(pwd, salt, iter) {
  const k = await crypto.subtle.importKey("raw", enc.encode(pwd), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, k, 256);
}
async function aesKey(pwd, salt, iter) {
  const k = await crypto.subtle.importKey("raw", enc.encode(pwd), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, k,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i]; return r === 0;
}

/* ---------- mot de passe de verrouillage ---------- */
async function setLockPassword(pwd) {
  const salt = rnd(16);
  const hash = new Uint8Array(await pbkdf2Bits(pwd, salt, LOCK_ITER));
  settings.lock = Object.assign({}, settings.lock, { salt: b64(salt), hash: b64(hash), iter: LOCK_ITER });
  saveSettings();
}
async function checkLockPassword(pwd) {
  const L = settings.lock; if (!L) return false;
  const h = new Uint8Array(await pbkdf2Bits(pwd, unb64(L.salt), L.iter));
  return sameBytes(h, unb64(L.hash));
}

/* ---------- empreinte (WebAuthn, authentificateur du téléphone) ---------- */
// Sans serveur, l'empreinte sert de « porte » : Android vérifie le doigt, l'app ouvre si la vérification réussit.
const bioAvailable = async () => {
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
  catch (e) { return false; }
};
async function registerBiometric() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: rnd(32),
    rp: { name: "Ordovie", id: location.hostname },
    user: { id: rnd(16), name: "ordovie", displayName: "Ordovie" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
    timeout: 60000,
  } });
  settings.lock.credId = b64(cred.rawId); saveSettings();
}
async function verifyBiometric() {
  const L = settings.lock; if (!L || !L.credId) return false;
  try {
    await navigator.credentials.get({ publicKey: {
      challenge: rnd(32), allowCredentials: [{ type: "public-key", id: unb64(L.credId), transports: ["internal"] }],
      userVerification: "required", timeout: 60000,
    } });
    return true;
  } catch (e) { return false; }
}

/* ---------- écran de verrouillage ---------- */
let locked = false, lockFails = 0, lockWaitUntil = 0, hiddenAt = null;
function lockEnabled() { return !!(settings.lock && settings.lock.hash); }
function showLock() {
  if (!lockEnabled()) return;
  locked = true;
  let ov = document.getElementById("lock");
  if (!ov) { ov = document.createElement("div"); ov.id = "lock"; document.body.appendChild(ov); }
  const bio = !!settings.lock.credId;
  ov.innerHTML = `<div class="lock-box">
      <img src="icons/icon-192.png" alt="" class="lock-logo">
      <div class="wordmark">Ordovie</div>
      ${bio ? '<button class="btn primary full" id="lock-bio">Déverrouiller avec l\'empreinte</button>' : ""}
      <form id="lock-form" autocomplete="off">
        <input type="password" id="lock-pwd" class="big-input" placeholder="Mot de passe" autocomplete="current-password">
        <button class="btn ${bio ? "" : "primary"} full" type="submit">Déverrouiller</button>
      </form>
      <p class="muted small" id="lock-msg"></p>
    </div>`;
  ov.hidden = false;
  document.body.classList.add("is-locked");
  if (bio) setTimeout(tryBio, 300);
}
function unlock() {
  locked = false; lockFails = 0;
  // On RETIRE l'écran de verrouillage du DOM (le masquer ne suffisait pas : la règle CSS display:flex l'emportait → écran noir).
  const ov = document.getElementById("lock"); if (ov) ov.remove();
  document.body.classList.remove("is-locked");
}
async function tryBio() { if (locked && await verifyBiometric()) unlock(); }

document.addEventListener("click", (e) => { if (e.target.id === "lock-bio") tryBio(); });
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "lock-form") return;
  e.preventDefault();
  const msg = document.getElementById("lock-msg");
  if (Date.now() < lockWaitUntil) { msg.textContent = "Trop d'essais. Réessaie dans quelques secondes."; return; }
  const pwd = document.getElementById("lock-pwd").value;
  if (await checkLockPassword(pwd)) { unlock(); return; }
  lockFails++;
  document.getElementById("lock-pwd").value = "";
  if (lockFails >= 5) { lockWaitUntil = Date.now() + 30000; lockFails = 0; msg.textContent = "5 essais incorrects : attends 30 secondes."; }
  else msg.textContent = "Mot de passe incorrect.";
});
document.addEventListener("visibilitychange", () => {
  if (!lockEnabled()) return;
  if (document.hidden) hiddenAt = Date.now();
  else if (!locked && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) showLock();
});

/* ---------- sauvegarde chiffrée ---------- */
async function buildEncryptedBackup(pwd) {
  const salt = rnd(16), iv = rnd(12);
  const key = await aesKey(pwd, salt, BACKUP_ITER);
  // La clé API n'est jamais incluse dans la sauvegarde.
  const payload = { app: "Ordovie", version: APP_VERSION, createdAt: new Date().toISOString(), finances: state, admin: (typeof admin !== "undefined" ? admin : null),
    docs: (typeof exportDocFiles === "function" ? await exportDocFiles() : []) };
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(payload)));
  return JSON.stringify({ format: "ordovie-backup", v: 1, kdf: { name: "PBKDF2", hash: "SHA-256", iter: BACKUP_ITER, salt: b64(salt) },
    cipher: { name: "AES-GCM", iv: b64(iv) }, data: b64(ct) });
}
async function openEncryptedBackup(text, pwd) {
  const f = JSON.parse(text);
  const key = await aesKey(pwd, unb64(f.kdf.salt), f.kdf.iter);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(f.cipher.iv) }, key, unb64(f.data));
  return JSON.parse(dec.decode(pt));
}
function isEncryptedBackup(text) { try { return JSON.parse(text).format === "ordovie-backup"; } catch (e) { return false; } }
function downloadText(text, name, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- cartes Paramètres ---------- */
let secUi = null;        // formulaire ouvert : "setpwd" | "chgpwd" | "backup" | "restore"
let pendingBackup = null; // contenu d'un fichier chiffré en attente de mot de passe
let bioOk = null;
bioAvailable().then((v) => { bioOk = v; });

function securityCards() {
  const on = lockEnabled();
  const lockCard = `<div class="card">
    <div class="c-title">Verrouillage</div>
    <p class="muted">${on
      ? `Activé · ${settings.lock.credId ? "empreinte + mot de passe" : "mot de passe"} · reverrouillage après 5 min en arrière-plan.`
      : "Désactivé. L'app s'ouvre sans protection."}</p>
    ${secUi === "setpwd" || secUi === "chgpwd" ? `
      <form data-secform="${secUi}">
        <input type="password" class="big-input" name="p1" placeholder="Nouveau mot de passe (8 caractères min.)" autocomplete="new-password">
        <input type="password" class="big-input" name="p2" placeholder="Répète le mot de passe" autocomplete="new-password" style="margin-top:8px;">
        <div class="btn-row"><button class="btn primary" type="submit">Enregistrer</button><button class="btn" type="button" data-sec="cancel">Annuler</button></div>
      </form>
      <p class="muted small">Note-le sur papier et range-le dans ton classeur : sans lui (et si l'empreinte échoue), il faudra réinstaller et restaurer une sauvegarde.</p>`
    : `<div class="btn-row">
        ${on ? `<button class="btn" data-sec="chgpwd">Changer le mot de passe</button>
               ${settings.lock.credId ? '<button class="btn" data-sec="bio-off">Retirer l\'empreinte</button>'
                 : (bioOk ? '<button class="btn primary" data-sec="bio-on">Ajouter l\'empreinte</button>' : "")}
               <button class="btn" data-sec="lock-off">Désactiver</button>
               <button class="btn" data-sec="lock-now">Verrouiller maintenant</button>`
             : '<button class="btn primary" data-sec="setpwd">Activer le verrouillage</button>'}
      </div>
      ${on && !settings.lock.credId && bioOk === false ? '<p class="muted small">Empreinte non disponible sur cet appareil ou ce navigateur.</p>' : ""}`}
  </div>`;

  const d = daysSince(settings.lastExport);
  const backupCard = `<div class="card">
    <div class="c-title">Sauvegarde chiffrée</div>
    <p class="muted">Un fichier <strong>.ordovie</strong> chiffré par un mot de passe, à copier hors du téléphone (ordinateur, Drive, NAS…). Dernière sauvegarde : ${d === null ? "jamais" : "il y a " + d + " jour(s)"}.</p>
    ${secUi === "backup" ? `
      <form data-secform="backup">
        <input type="password" class="big-input" name="p1" placeholder="Mot de passe de la sauvegarde" autocomplete="new-password">
        <input type="password" class="big-input" name="p2" placeholder="Répète le mot de passe" autocomplete="new-password" style="margin-top:8px;">
        <div class="btn-row"><button class="btn primary" type="submit">Créer la sauvegarde</button><button class="btn" type="button" data-sec="cancel">Annuler</button></div>
      </form>
      <p class="muted small">Ce mot de passe peut être différent de celui du verrouillage. Perdu = sauvegarde illisible : note-le sur papier.</p>`
    : pendingBackup ? `
      <form data-secform="restore">
        <p class="muted small">Fichier chiffré sélectionné. Saisis son mot de passe.</p>
        <input type="password" class="big-input" name="p1" placeholder="Mot de passe de la sauvegarde" autocomplete="off">
        <div class="btn-row"><button class="btn primary" type="submit">Restaurer</button><button class="btn" type="button" data-sec="cancel">Annuler</button></div>
      </form>`
    : `<div class="btn-row">${state ? '<button class="btn primary" data-sec="backup">Créer une sauvegarde</button>' : ""}
        <button class="btn" id="btn-import">Restaurer / importer</button></div>
      <input type="file" id="file-import" hidden>
      <p class="muted small">« Restaurer / importer » accepte une sauvegarde .ordovie ou un JSON de Gestion Finances v20.
      ${state ? '<button class="link-btn" id="btn-export">Exporter en JSON non chiffré (pour la v20)</button>' : ""}</p>`}
    <p class="muted small" id="sec-msg"></p>
  </div>`;
  return lockCard + backupCard;
}

$("#screen").addEventListener("click", async (e) => {
  if (current !== "settings") return;
  const t = e.target.closest("[data-sec]"); if (!t) return;
  const a = t.dataset.sec;
  if (a === "cancel") { secUi = null; pendingBackup = null; }
  else if (a === "setpwd" || a === "chgpwd" || a === "backup") secUi = a;
  else if (a === "lock-off") {
    if (!confirm("Désactiver le verrouillage ? L'app s'ouvrira sans protection.")) return;
    delete settings.lock; saveSettings();
  } else if (a === "lock-now") { showLock(); return; }
  else if (a === "bio-on") {
    try { await registerBiometric(); alert("Empreinte ajoutée."); }
    catch (err) { alert("Empreinte non enregistrée : " + (err && err.message ? err.message : "opération annulée")); }
  } else if (a === "bio-off") { delete settings.lock.credId; saveSettings(); }
  go("settings");
});
$("#screen").addEventListener("submit", async (e) => {
  const f = e.target.closest("[data-secform]"); if (!f) return;
  e.preventDefault();
  const kind = f.dataset.secform, i1 = f.querySelector("[name=p1]"), i2 = f.querySelector("[name=p2]");
  const p1 = i1 ? i1.value : "", p2 = i2 ? i2.value : null;
  const msg = (s) => { const m = document.getElementById("sec-msg"); if (m) m.textContent = s; else alert(s); };
  if (kind !== "restore") {
    if (p1.length < 8) { alert("8 caractères minimum."); return; }
    if (p1 !== p2) { alert("Les deux mots de passe ne correspondent pas."); return; }
  }
  if (kind === "setpwd" || kind === "chgpwd") {
    await setLockPassword(p1); secUi = null;
    alert(kind === "setpwd" ? "Verrouillage activé." + (bioOk ? " Tu peux maintenant ajouter ton empreinte." : "") : "Mot de passe changé.");
    go("settings");
  } else if (kind === "backup") {
    msg("Chiffrement en cours…");
    const text = await buildEncryptedBackup(p1);
    downloadText(text, "ordovie-" + new Date().toISOString().slice(0, 10) + ".ordovie", "application/octet-stream");
    settings.lastExport = new Date().toISOString(); saveSettings();
    secUi = null; go("settings");
    alert("Sauvegarde créée (dossier Téléchargements). Copie-la hors du téléphone (ordinateur, Drive, NAS…).");
  } else if (kind === "restore") {
    let payload;
    try { payload = await openEncryptedBackup(pendingBackup, p1); }
    catch (err) { msg("Mot de passe incorrect ou fichier abîmé."); return; }
    pendingBackup = null;
    if (!payload || !payload.finances) { alert("Sauvegarde vide ou invalide."); go("settings"); return; }
    const ok = applyImported(payload.finances, payload.admin);
    if (ok && payload.docs && payload.docs.length && typeof importDocFiles === "function") await importDocFiles(payload.docs);
  }
});

/* ---------- démarrage ---------- */
if (lockEnabled()) showLock();
