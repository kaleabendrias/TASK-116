<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import RouteGuard from '../components/RouteGuard.svelte';
  import Modal from '../components/Modal.svelte';
  import {
    messages, deadLetters, refreshMessages, sendMessage, tickQueue, markRead,
    getSubscription, updateSubscription, getQuietHours, setQuietHours, clearQuietHours,
    listDirectory, type DirectoryEntry
  } from '@application/services/messagingService';
  import { businessConfig } from '@application/services/businessConfig';
  import { currentUserId } from '@application/services/authService';
  import type { SubscriptionPreferences } from '@domain/messaging/message';

  const cfg = businessConfig();
  let users: DirectoryEntry[] = [];
  let composeOpen = false;
  let toUserId = '';
  let templateId = cfg.messageTemplates[0]?.id ?? '';
  let category = cfg.messageCategories[0];
  let varsText = '{"name":"there"}';
  let prefs: SubscriptionPreferences | null = null;
  let quietStart = cfg.quietHours.startHour;
  let quietEnd = cfg.quietHours.endHour;
  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    users = await listDirectory();
    await refreshMessages();
    const me = currentUserId();
    if (me) {
      prefs = await getSubscription(me);
      const override = await getQuietHours(me);
      if (override) { quietStart = override.startHour; quietEnd = override.endHour; }
    }
    timer = setInterval(() => { void tickQueue(); }, 5000);
  });

  onDestroy(() => { if (timer) clearInterval(timer); });

  async function send(): Promise<void> {
    let variables: Record<string, string> = {};
    try { variables = JSON.parse(varsText); } catch { variables = {}; }
    await sendMessage({ toUserId, category, templateId, variables });
    composeOpen = false;
  }

  async function toggleSubscription(cat: string): Promise<void> {
    if (!prefs) return;
    const next = prefs.unsubscribed.includes(cat)
      ? prefs.unsubscribed.filter((c) => c !== cat)
      : [...prefs.unsubscribed, cat];
    prefs = { ...prefs, unsubscribed: next };
    await updateSubscription(prefs);
  }

  async function saveQuietHoursLocal(): Promise<void> {
    const me = currentUserId();
    if (!me) return;
    await setQuietHours(me, { startHour: quietStart, endHour: quietEnd });
  }
  async function clearQuietHoursLocal(): Promise<void> {
    const me = currentUserId();
    if (!me) return;
    await clearQuietHours(me);
    quietStart = cfg.quietHours.startHour; quietEnd = cfg.quietHours.endHour;
  }

  $: me = currentUserId();
  $: inbox = $messages.filter((m) => m.toUserId === me && (m.status === 'delivered' || m.status === 'read'));
  $: outbox = $messages.filter((m) => m.fromUserId === me);
</script>

<RouteGuard route="messaging">
  <PageHeader title="Messaging &amp; Notification Center" subtitle="In-app only — no SMS, email, or external IM." />

  <div class="card" style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
    <button class="btn" on:click={() => (composeOpen = true)}>Compose</button>
    <span style="color:var(--muted); font-size:12px;">
      Rate limit {cfg.messaging.ratePerMinute}/min · max retries {cfg.messaging.maxAttempts} · default quiet hours {cfg.quietHours.startHour}:00–{cfg.quietHours.endHour}:00
    </span>
  </div>

  <div class="card">
    <h3 style="margin-top:0;">Inbox</h3>
    {#if inbox.length === 0}<p style="color:var(--muted);">No messages.</p>{/if}
    {#each inbox as m (m.id)}
      <div class="card" style="margin:8px 0;">
        <strong>{m.subject}</strong>
        <div>{m.body}</div>
        <div style="font-size:12px; color:var(--muted);">
          Delivered {m.deliveredAt ? new Date(m.deliveredAt).toLocaleString() : ''}
          {#if m.readAt}· Read {new Date(m.readAt).toLocaleString()}{/if}
          · category {m.category}
        </div>
        {#if m.status === 'delivered'}
          <button class="btn secondary" on:click={() => markRead(m.id)}>Mark read</button>
        {/if}
      </div>
    {/each}
  </div>

  <div class="card">
    <h3 style="margin-top:0;">Outbox &amp; queue</h3>
    {#each outbox as m (m.id)}
      <div style="font-size:13px; padding:6px 0; border-bottom:1px solid var(--border);">
        → {m.toUserId.slice(0,12)}… · {m.subject} · <em>{m.status}</em> · attempts {m.attempts}
        {#if m.lastError}<span style="color:#ff7676;"> ({m.lastError})</span>{/if}
      </div>
    {/each}
  </div>

  <div class="card">
    <h3 style="margin-top:0;">Dead letter inbox</h3>
    {#if $deadLetters.length === 0}<p style="color:var(--muted);">Empty.</p>{/if}
    {#each $deadLetters as m (m.id)}
      <div style="font-size:13px;">{m.subject} — {m.lastError}</div>
    {/each}
  </div>

  <div class="card">
    <h3 style="margin-top:0;">Subscription preferences</h3>
    {#if prefs}
      {#each cfg.messageCategories as cat}
        <label style="margin-right:12px;">
          <input type="checkbox" checked={!prefs.unsubscribed.includes(cat)} on:change={() => toggleSubscription(cat)} />
          {cat}
        </label>
      {/each}
    {/if}
  </div>

  <div class="card">
    <h3 style="margin-top:0;">Quiet hours (preference)</h3>
    <label>Start <input type="number" min="0" max="23" bind:value={quietStart} /></label>
    <label>End <input type="number" min="0" max="23" bind:value={quietEnd} /></label>
    <button class="btn secondary" on:click={saveQuietHoursLocal}>Save</button>
    <button class="btn secondary" on:click={clearQuietHoursLocal}>Reset</button>
  </div>
</RouteGuard>

<Modal open={composeOpen} title="Compose" onClose={() => (composeOpen = false)}>
  <label>To<br/>
    <select bind:value={toUserId} style="width:100%">
      <option value="">— pick recipient —</option>
      {#each users as u}<option value={u.id}>{u.username} ({u.role})</option>{/each}
    </select>
  </label><br/><br/>
  <label>Category<br/>
    <select bind:value={category}>
      {#each cfg.messageCategories as c}<option>{c}</option>{/each}
    </select>
  </label><br/><br/>
  <label>Template<br/>
    <select bind:value={templateId}>
      {#each cfg.messageTemplates as t}<option value={t.id}>{t.name}</option>{/each}
    </select>
  </label><br/><br/>
  <label>Variables (JSON)<br/><textarea rows="3" bind:value={varsText} style="width:100%"></textarea></label>
  <div style="margin-top:12px; display:flex; gap:8px; justify-content:flex-end;">
    <button class="btn secondary" on:click={() => (composeOpen = false)}>Cancel</button>
    <button class="btn" on:click={send} disabled={!toUserId}>Send</button>
  </div>
</Modal>
