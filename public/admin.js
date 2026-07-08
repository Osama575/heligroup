// THEHELIGROUP CMS — editor interactions: repeatable rows, image upload, dirty guard.

function csrf() {
  const el = document.querySelector('#ed-form input[name="_csrf"]');
  return el ? el.value : "";
}

// Rewrite the bracket-notation names of every field in an array so indices stay
// contiguous after add/remove. Scalar arrays use base[i]; object arrays base[i][field].
function reindex(arrayEl) {
  const base = arrayEl.getAttribute("data-base");
  const items = arrayEl.querySelectorAll(":scope > [data-item]");
  items.forEach((item, i) => {
    item.querySelectorAll("[data-field]").forEach((f) => {
      const field = f.getAttribute("data-field");
      f.name = field ? `${base}[${i}][${field}]` : `${base}[${i}]`;
    });
  });
}

let dirty = false;
const markDirty = () => { dirty = true; };

document.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  if (add) {
    const arrayEl = add.closest("[data-array]");
    const tpl = arrayEl.querySelector("template[data-tpl]");
    const clone = tpl.content.firstElementChild.cloneNode(true);
    arrayEl.insertBefore(clone, tpl);
    reindex(arrayEl);
    markDirty();
    clone.querySelector("input, textarea")?.focus();
    return;
  }
  const rem = e.target.closest("[data-remove]");
  if (rem) {
    const arrayEl = rem.closest("[data-array]");
    rem.closest("[data-item]").remove();
    reindex(arrayEl);
    markDirty();
    return;
  }
  const up = e.target.closest("[data-upload]");
  if (up) { e.preventDefault(); triggerUpload(up); return; }
});

function triggerUpload(btn) {
  const wrap = btn.closest(".ed-img");
  const input = wrap.querySelector("[data-img-input]");
  const preview = wrap.querySelector(".ed-img-prev");
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "image/png,image/jpeg,image/webp,image/svg+xml,image/gif,image/avif";
  file.onchange = async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const original = btn.textContent;
    btn.textContent = "Uploading…";
    btn.disabled = true;
    try {
      const fd = new FormData();
      fd.append("image", f);
      fd.append("_csrf", csrf());
      const r = await fetch("/admin/upload", { method: "POST", headers: { "X-CSRF-Token": csrf() }, body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "upload failed");
      const data = await r.json();
      input.value = data.url;
      const img = preview.querySelector("img");
      if (img) img.src = data.url;
      preview.hidden = false;
      markDirty();
    } catch (err) {
      alert("Upload failed. " + (err.message || ""));
    } finally {
      btn.textContent = original;
      btn.disabled = false;
    }
  };
  file.click();
}

// Live image preview when a path/URL is typed or pasted.
document.addEventListener("input", (e) => {
  markDirty();
  const inp = e.target.closest("[data-img-input]");
  if (!inp) return;
  const wrap = inp.closest(".ed-img");
  const prev = wrap.querySelector(".ed-img-prev");
  const img = prev.querySelector("img");
  if (inp.value) { img.src = inp.value; prev.hidden = false; }
  else { prev.hidden = true; }
});

document.getElementById("ed-form")?.addEventListener("submit", () => { dirty = false; });

window.addEventListener("beforeunload", (e) => {
  if (dirty) { e.preventDefault(); e.returnValue = ""; }
});

// Auto-dismiss the saved/error toast.
const toast = document.querySelector("[data-toast]");
if (toast) setTimeout(() => toast.classList.add("is-gone"), 4000);
