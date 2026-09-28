# Agent Note: Per-conversation session header on pi-ai routes

Status: implemented

English | [中文](2026-09-18-pi-ai-session-header.zh.md)

## Problem

Session-affinity gateways reject requests that carry no per-conversation identity header — OpenCode Go's `x-opencode-session`, required since 2026-09-05, is the instance that broke Harness users ([discussion 5495](https://github.com/deepseek-ai/deepseek-harness/discussions/5495)). The pi-ai adapter sent no session identity at all, and the community workaround — a fixed value in profile `headers` — collapses every conversation into one affinity bucket, so gateway-side prompt caching degrades and cost rises when sessions switch.

## Decision

Profile resolution stamps every OpenCode route with the gateway's required header by default: a route whose key starts with `opencode` (the installed catalog's `opencode` and `opencode-go`) or whose serving endpoints sit on `opencode.ai` gets `sessionHeader: x-opencode-session` with no configuration. The default is part of serving the route, because the gateway answers every header-less request `400 MissingSessionID` — an OpenCode user who upgrades and restarts is fixed, not greeted with a setting to discover. The adapter then sends `GenerateOptions.sessionId` under that name on every request that names one — the conversation id, stable across turns, resume, compaction, and retries, and distinct per session, fork, and subagent. An explicit `sessionHeader` names a different header on an OpenCode route or serves another session-affinity gateway; its dynamic value replaces a same-named static `headers` entry case-insensitively, because a fixed value cannot do a per-conversation id's job, and Harness attribution still wins reserved names. Resolution refuses an empty or Fetch-unrepresentable name. Requests naming no session id send nothing, and model-discovery requests are unchanged.

## Alternatives considered

**Configuration-only opt-in (the first cut).** A `sessionHeader` field with no default left the fix invisible: the maintainer's own rebuild-and-restart on the `opencode-go` route still failed with `MissingSessionID`, because nothing told the route to send the header. A breaking-gateway requirement on a known route belongs to the route, not to a setting every affected user must first hear about.

**Ride pi-ai's `sendSessionAffinityHeaders` / `sessionAffinityFormat`.** Catalog-owned and withheld from profiles by the package's compat drift gates; their wire formats (`session_id`, `x-client-request-id`, `x-session-affinity`, `x-session-id`) do not include `x-opencode-session`, so upstream work would be needed before they could serve this gateway.

**Send the harness conversation id on every provider.** Sends a per-conversation identifier to providers a deployment never asked to receive it. The auto-default is scoped to OpenCode routes; every other route keeps sending nothing until it opts in with the field.

## Consequences

OpenCode Go users recover by upgrading — the route needs no new configuration, and every wire protocol is covered because the header rides request headers at the single `streamSimple` call site, with auxiliary calls that carry the session id (titles, compaction) presenting the same per-conversation id. A route key starting with `opencode` that points at an unrelated endpoint still sends the header, an unread extra header to that endpoint. Non-OpenCode deployments see no wire change until a route opts in. The static-header workaround must be migrated by dropping the fixed entry, since the dynamic value replaces it.
