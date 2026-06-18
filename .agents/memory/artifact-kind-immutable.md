---
name: Artifact kind immutable
description: The `kind` field in artifact.toml cannot be changed after creation, even via verifyAndReplaceArtifactToml.
---

The artifact `kind` field is locked at creation time — neither direct file writes nor `verifyAndReplaceArtifactToml` will update it.

**Why:** Replit's platform enforces kind as an immutable classification. Changing it would affect routing, deployment, and preview behaviour in ways the platform manages at a deeper level.

**How to apply:** If an artifact was created as the wrong kind (e.g. `api` instead of `web`), the only fix is to:
1. Move the static/frontend files out to a new `web` artifact
2. Restrict the old `api` artifact's paths to `/api/` only (via artifact.edit.toml + verifyAndReplaceArtifactToml)
3. Create a new `react-vite` (kind: web) artifact at `/` and populate it with the existing HTML/CSS/JS in its `public/` dir

For vanilla HTML/CSS/JS in a react-vite artifact: strip the React/Tailwind plugins from vite.config.ts, put static assets in `public/`, and use a plain `index.html` at the artifact root.
