<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import RouteGuard from '../components/RouteGuard.svelte';
  import { listAttempts } from '@application/services/attemptService';
  import {
    listGrades, submitFirstReview, submitSecondReview,
    decryptNotes, isComplete, NotesDecryptionError, SecondReviewDeltaBlockedError
  } from '@application/services/gradingService';
  import { questionsRepository } from '@persistence/questionsRepository';
  import type { Attempt } from '@persistence/attemptsRepository';
  import type { Grade } from '@persistence/gradesRepository';
  import type { Question } from '@domain/questions/question';
  import { businessConfig } from '@application/services/businessConfig';
  import { requiresSecondReview } from '@domain/grading/scoring';

  const cfg = businessConfig().grading;

  let attempts: Attempt[] = [];
  let grades: Grade[] = [];
  let questionsById: Record<string, Question> = {};
  let working: { attempt: Attempt; grade: Grade | null; question: Question } | null = null;
  let scoreInput = 0;
  let notesInput = '';
  let decryptedNotes = '';
  let notesUnreadable = false;
  let error = '';

  async function reload(): Promise<void> {
    attempts = await listAttempts();
    grades = await listGrades();
    const qs = await questionsRepository.list();
    questionsById = Object.fromEntries(qs.map((q) => [q.id, q]));
  }

  onMount(reload);

  function gradeFor(attemptId: string): Grade | null {
    return grades.find((g) => g.attemptId === attemptId) ?? null;
  }

  async function open(attempt: Attempt): Promise<void> {
    error = '';
    decryptedNotes = '';
    notesUnreadable = false;
    const question = questionsById[attempt.questionId];
    if (!question) return;
    const grade = gradeFor(attempt.id);
    working = { attempt, grade, question };
    scoreInput = grade?.firstScore ?? 0;
    notesInput = '';
    if (grade?.notesEncrypted) {
      try {
        decryptedNotes = await decryptNotes(grade.notesEncrypted);
      } catch (e) {
        if (e instanceof NotesDecryptionError) {
          notesUnreadable = true;
        } else {
          error = e instanceof Error ? e.message : 'Failed to load notes';
        }
      }
    }
  }

  async function submitFirst(): Promise<void> {
    if (!working) return;
    error = '';
    try {
      await submitFirstReview({ attemptId: working.attempt.id, score: scoreInput, notes: notesInput });
      await reload();
      working = null;
    } catch (e) { error = e instanceof Error ? e.message : 'Failed'; }
  }

  async function submitSecond(): Promise<void> {
    if (!working || !working.grade) return;
    error = '';
    try {
      await submitSecondReview(working.grade.id, { score: scoreInput, notes: notesInput });
      await reload();
      working = null;
    } catch (e) {
      if (e instanceof SecondReviewDeltaBlockedError) {
        // Strict policy: terminal closure is blocked while the delta still
        // exceeds the configured threshold. Keep the working drawer open
        // so the reviewer can adjust their score, and refresh the table
        // so the awaiting-2nd-review status remains visible.
        error = e.message;
        await reload();
        // Re-bind to the persisted (still-pending) grade so the drawer
        // displays the unchanged authoritative state.
        const persisted = gradeFor(working.attempt.id);
        if (persisted) working = { ...working, grade: persisted };
      } else {
        error = e instanceof Error ? e.message : 'Failed';
        await reload();
      }
    }
  }

  $: deltaTriggers = working && working.grade
    ? requiresSecondReview(working.grade.firstScore, scoreInput, cfg.secondReviewDelta)
    : false;
</script>

<RouteGuard route="review">
  <PageHeader
    title="Reviewer · Grading"
    subtitle={`Manual scoring on the ${cfg.partialIncrement} grid; the second review finalizes the grade as the type-weighted average.`}
  />

  <div class="card">
    <table style="width:100%; font-size:13px;">
      <thead><tr><th>Attempt</th><th>Question</th><th>Auto</th><th>Manual</th><th>Final</th><th>Status</th><th></th></tr></thead>
      <tbody>
        {#each attempts as a (a.id)}
          {@const g = gradeFor(a.id)}
          {@const q = questionsById[a.questionId]}
          <tr>
            <td>{a.id.slice(0, 12)}…</td>
            <td>{q?.prompt ?? '—'}</td>
            <td>{a.autoScore ?? '—'}</td>
            <td>{g?.firstScore ?? '—'}{g?.secondScore !== null && g?.secondScore !== undefined ? ` / ${g.secondScore}` : ''}</td>
            <td>{g?.finalScore ?? '—'}</td>
            <td>
              {#if g && isComplete(g) && g.secondScore !== null}
                graded (2 reviewers){#if g.blockedReason}<span style="color:#f1c40f;" title={g.blockedReason}> · audit</span>{/if}
              {:else if g && g.state === 'PENDING_SECOND_REVIEW'}
                <span style="color:#f1c40f;" title={g.blockedReason ?? ''}>awaiting 2nd review</span>
              {:else if g && isComplete(g)}
                graded (1 reviewer)
              {:else if a.needsManualGrading}
                needs grading
              {:else}
                auto
              {/if}
            </td>
            <td>
              {#if a.needsManualGrading && !g}
                <button class="btn secondary" on:click={() => open(a)}>Grade</button>
              {:else if g && g.state === 'PENDING_SECOND_REVIEW'}
                <button class="btn secondary" on:click={() => open(a)}>2nd review</button>
              {:else if g}
                <button class="btn secondary" on:click={() => open(a)}>View</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</RouteGuard>

{#if working}
  <div class="card" style="position:fixed; right:24px; bottom:24px; width:min(440px, 92vw); z-index:60;">
    <h3 style="margin-top:0;">Grade attempt</h3>
    <p style="color:var(--muted);">{working.question.prompt}</p>
    <p>Max score: {working.question.maxScore} · Type weight: {cfg.weights[working.question.type]}</p>

    {#if working.grade}
      <p>First score: <strong>{working.grade.firstScore}</strong>
      {#if working.grade.secondScore !== null} · Second score: <strong>{working.grade.secondScore}</strong>{/if}</p>
      {#if working.grade.blockedReason}
        <p style="color:#ff7676;">{working.grade.blockedReason}</p>
      {/if}
    {/if}

    <label>Score (step {cfg.partialIncrement})<br/>
      <input type="number" step={cfg.partialIncrement} min="0" max={working.question.maxScore} bind:value={scoreInput} />
    </label><br/><br/>
    <label>Notes (encrypted at rest)<br/>
      <textarea rows="3" bind:value={notesInput} style="width:100%"></textarea>
    </label>

    {#if notesUnreadable}
      <p style="color:var(--muted); font-size:12px; font-style: italic;">[Existing notes were encrypted by a different reviewer and cannot be decrypted in your session.]</p>
    {:else if decryptedNotes}
      <p style="color:var(--muted); font-size:12px;">Existing notes: {decryptedNotes}</p>
    {/if}

    {#if deltaTriggers}
      <p style="color:#ff7676;">
        Delta exceeds {cfg.secondReviewDelta} — submitting this score will be <strong>blocked</strong>
        and the grade will remain awaiting a second review until the two reviewers agree
        within {cfg.secondReviewDelta} points.
      </p>
    {/if}

    {#if error}<p style="color:#ff7676;">{error}</p>{/if}

    <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px;">
      <button class="btn secondary" on:click={() => (working = null)}>Close</button>
      {#if working.grade && working.grade.state === 'PENDING_SECOND_REVIEW'}
        <button class="btn" on:click={submitSecond}>Submit second review</button>
      {:else if !working.grade}
        <button class="btn" on:click={submitFirst}>Submit first review</button>
      {/if}
    </div>
  </div>
{/if}
