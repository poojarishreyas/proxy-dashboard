/**
 * Folds a session's raw event log into ledger rows, exactly like the local
 * dashboard's projection (web/app.js in the shrey-cli package) — kept a separate
 * pure function here so it has no DOM dependency and stays easy to compare against
 * that copy if the event vocabulary ever changes.
 */
export function project(events, objects) {
  const rows = [];
  const seenMessages = new Set();
  let requestId = null;
  // A reply is shown once as the streamed response; the next request then replays
  // it as history under a different object id. Absorb that replay so each turn
  // appears once.
  let shownReplies = 0;

  const push = (row) => {
    row.key = rows.length;
    row.requestId = requestId;
    rows.push(row);
  };

  for (const ev of events) {
    const d = ev.data || {};
    switch (ev.type) {
      case 'session/start':
        push({ kind: 'separator', sep: 'session', label: 'SESSION', time: ev.time });
        break;

      case 'request/context':
        push({
          kind: 'row',
          tag: 'system',
          tagClass: 't-system',
          label: d.reason === 'initial' ? 'context' : 'context Δ',
          text: (d.toolNames || []).length + ' tools',
          time: ev.time
        });
        break;

      case 'request/start': {
        requestId = d.requestId;
        push({
          kind: 'separator',
          sep: 'request',
          label: d.requestId,
          detail: (d.params?.model ?? '') + ' · ' + (d.messageCount ?? 0) + ' msgs',
          time: ev.time
        });
        for (const ref of d.messageRefs || []) {
          if (seenMessages.has(ref)) continue;
          seenMessages.add(ref);
          const msg = objects[ref];
          if (!msg) {
            push({ kind: 'row', tag: 'user', tagClass: 't-user', label: 'message', text: '[unavailable]', time: ev.time });
            continue;
          }
          if (msg.role === 'assistant' && shownReplies > 0) {
            shownReplies--;
            continue;
          }
          projectMessage(msg, ev.time, push);
        }
        break;
      }

      case 'response/open':
        if (d.status >= 400) {
          push({ kind: 'row', tag: 'error', tagClass: 't-error', label: 'http ' + d.status, text: d.statusText || '', time: ev.time, isError: true });
        }
        break;

      case 'response/message': {
        if ((d.content || []).length) shownReplies++;
        const t = d.timings || {};
        for (const block of d.content || []) {
          if (block.type === 'text') {
            push({ kind: 'row', tag: 'assistant', tagClass: 't-assistant', label: 'text', text: block.text || '', time: ev.time });
          } else if (block.type === 'thinking') {
            push({ kind: 'row', tag: 'assistant', tagClass: 't-assistant', label: 'thinking', text: block.thinking || '', time: ev.time });
          } else if (block.type === 'tool_use') {
            push({ kind: 'row', tag: 'tool', tagClass: 't-tool', label: block.name || 'tool', text: JSON.stringify(block.input), time: ev.time, indent: true });
          }
        }
        push({
          kind: 'row',
          tag: 'assistant',
          tagClass: 't-assistant',
          label: 'stop',
          meta: true,
          text: (d.stopReason || 'null') + ' · ' + fmtDur(t.totalMs) +
            (t.ttftMs != null ? ' (ttft ' + fmtDur(t.ttftMs) + ')' : '') +
            ' · in ' + (d.usage?.input_tokens ?? 0) + ' out ' + (d.usage?.output_tokens ?? 0),
          time: ev.time
        });
        break;
      }

      case 'response/error':
        push({
          kind: 'row',
          tag: 'error',
          tagClass: 't-error',
          label: d.stage || 'error',
          text: d.message || JSON.stringify(d.body || d.errors || {}).slice(0, 600),
          time: ev.time,
          isError: true
        });
        break;

      default:
        break;
    }
  }
  return rows;
}

function projectMessage(msg, time, push) {
  const role = msg.role || 'user';
  const roleClass = role === 'user' ? 't-user' : 't-assistant';
  const content = msg.content;
  if (typeof content === 'string') {
    push({ kind: 'row', tag: role, tagClass: roleClass, label: 'message', text: content, time });
    return;
  }
  for (const block of content || []) {
    if (block.type === 'tool_result') {
      const body = typeof block.content === 'string' ? block.content : textOf(block.content);
      push({ kind: 'row', tag: 'tool', tagClass: block.is_error ? 't-error' : 't-tool', label: block.is_error ? 'result ✗' : 'result', text: body, time, indent: true });
    } else if (block.type === 'text') {
      push({ kind: 'row', tag: role, tagClass: roleClass, label: 'message', text: block.text || '', time });
    } else if (block.type === 'tool_use') {
      push({ kind: 'row', tag: 'tool', tagClass: 't-tool', label: block.name || 'tool', text: JSON.stringify(block.input), time, indent: true });
    } else if (block.type === 'image') {
      push({ kind: 'row', tag: role, tagClass: roleClass, label: 'image', text: '[image]', time });
    }
  }
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((b) => (typeof b === 'string' ? b : b?.type === 'text' ? b.text ?? '' : '')).join('\n');
}

export function fmtDur(ms) {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return Math.round(ms) + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(2) + 's';
  return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's';
}

export function fmtAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return Math.max(0, Math.round(s)) + 's ago';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

export function fmtCompact(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k';
  return String(Math.round(v));
}
