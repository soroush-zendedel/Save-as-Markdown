const form = document.querySelector("#rulesForm");
const hostInput = document.querySelector("#hostname");
const includeInput = document.querySelector("#includeSelector");
const excludeInput = document.querySelector("#excludeSelectors");
const status = document.querySelector("#status");

function normalizeHost(value) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/, 1)[0].replace(/\.$/, "");
}

async function loadRule() {
  const host = normalizeHost(hostInput.value);
  if (!host) return;
  const { siteRules = {} } = await browser.storage.local.get("siteRules");
  const rule = siteRules[host] || {};
  includeInput.value = rule.include || "";
  excludeInput.value = rule.exclude || "";
}

hostInput.addEventListener("change", loadRule);

const queryHost = new URLSearchParams(location.search).get("host");
if (queryHost) {
  hostInput.value = normalizeHost(queryHost);
  loadRule();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const host = normalizeHost(hostInput.value);
  if (!host || !/^[a-z0-9.-]+$/.test(host)) {
    status.classList.add("error");
    status.textContent = "Enter a valid website hostname.";
    return;
  }

  const { siteRules = {} } = await browser.storage.local.get("siteRules");
  const include = includeInput.value.trim();
  const exclude = excludeInput.value.trim();
  if (include || exclude) siteRules[host] = { include, exclude };
  else delete siteRules[host];
  await browser.storage.local.set({ siteRules });
  status.classList.remove("error");
  status.textContent = include || exclude ? `Rule saved for ${host}.` : `Empty rule removed for ${host}.`;
});

document.querySelector("#deleteRule").addEventListener("click", async () => {
  const host = normalizeHost(hostInput.value);
  const { siteRules = {} } = await browser.storage.local.get("siteRules");
  delete siteRules[host];
  await browser.storage.local.set({ siteRules });
  includeInput.value = "";
  excludeInput.value = "";
  status.classList.remove("error");
  status.textContent = `Rule deleted for ${host || "this site"}.`;
});
