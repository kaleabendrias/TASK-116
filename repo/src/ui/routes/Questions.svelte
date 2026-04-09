<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import RouteGuard from '../components/RouteGuard.svelte';
  import Modal from '../components/Modal.svelte';
  import {
    visibleQuestions, showDeleted, refreshQuestions,
    createQuestion, editQuestion, copyQuestionById, setActive, softDeleteQuestion, restoreQuestion
  } from '@application/services/questionService';
  import { businessConfig } from '@application/services/businessConfig';
  import type { NewQuestionInput, Question, QuestionType } from '@domain/questions/question';
  import { TRUE_FALSE_CHOICES } from '@domain/questions/question';
  import { uid } from '@shared/utils/id';

  const cfg = businessConfig();

  let modalOpen = false;
  let editingId: string | null = null;
  let errors: string[] = [];
  let form: NewQuestionInput = blank();

  function blank(): NewQuestionInput {
    return {
      type: 'single_choice',
      prompt: '',
      choices: [{ id: uid('ch'), label: 'Option A' }, { id: uid('ch'), label: 'Option B' }],
      correctChoiceIds: [],
      correctNumeric: null,
      numericTolerance: 0,
      acceptedAnswers: [],
      caseSensitive: false,
      difficulty: 1,
      maxScore: 10,
      explanation: '',
      tags: [],
      knowledgePoints: [],
      applicableDepartments: []
    };
  }

  onMount(refreshQuestions);

  function openCreate(): void {
    editingId = null; errors = []; form = blank(); modalOpen = true;
  }

  function openEdit(q: Question): void {
    editingId = q.id; errors = [];
    form = {
      type: q.type, prompt: q.prompt, choices: q.choices.map((c) => ({ ...c })),
      correctChoiceIds: [...q.correctChoiceIds], correctNumeric: q.correctNumeric, numericTolerance: q.numericTolerance,
      acceptedAnswers: [...q.acceptedAnswers], caseSensitive: q.caseSensitive,
      difficulty: q.difficulty, maxScore: q.maxScore, explanation: q.explanation,
      tags: [...q.tags], knowledgePoints: [...q.knowledgePoints], applicableDepartments: [...q.applicableDepartments]
    };
    modalOpen = true;
  }

  function onTypeChange(): void {
    if (form.type === 'true_false') {
      form.choices = TRUE_FALSE_CHOICES.map((c) => ({ ...c }));
      if (form.correctChoiceIds.length !== 1 || (form.correctChoiceIds[0] !== 'true' && form.correctChoiceIds[0] !== 'false')) {
        form.correctChoiceIds = ['true'];
      }
    }
    if (form.type === 'fill_in_blank' && form.acceptedAnswers.length === 0) {
      form.acceptedAnswers = [''];
    }
  }

  async function submit(): Promise<void> {
    const result = editingId ? await editQuestion(editingId, form) : await createQuestion(form);
    if (result.ok) { modalOpen = false; }
    else { errors = result.errors; }
  }

  function addChoice(): void { form.choices = [...form.choices, { id: uid('ch'), label: '' }]; }
  function removeChoice(id: string): void {
    form.choices = form.choices.filter((c) => c.id !== id);
    form.correctChoiceIds = form.correctChoiceIds.filter((c) => c !== id);
  }
  function toggleCorrect(id: string): void {
    if (form.type === 'single_choice' || form.type === 'true_false') form.correctChoiceIds = [id];
    else form.correctChoiceIds = form.correctChoiceIds.includes(id)
      ? form.correctChoiceIds.filter((c) => c !== id)
      : [...form.correctChoiceIds, id];
  }
  function toggleDept(d: string): void {
    form.applicableDepartments = form.applicableDepartments.includes(d)
      ? form.applicableDepartments.filter((x) => x !== d)
      : [...form.applicableDepartments, d];
  }
  function toggleKp(k: string): void {
    form.knowledgePoints = form.knowledgePoints.includes(k)
      ? form.knowledgePoints.filter((x) => x !== k)
      : [...form.knowledgePoints, k];
  }
  function setTags(value: string): void {
    form.tags = value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  function addAccepted(): void { form.acceptedAnswers = [...form.acceptedAnswers, '']; }
  function removeAccepted(idx: number): void {
    form.acceptedAnswers = form.acceptedAnswers.filter((_, i) => i !== idx);
  }

  const TYPES: { value: QuestionType; label: string }[] = [
    { value: 'single_choice', label: 'Single choice' },
    { value: 'multi_choice', label: 'Multi choice' },
    { value: 'true_false', label: 'True / False' },
    { value: 'fill_in_blank', label: 'Fill in the blank' },
    { value: 'numeric', label: 'Numeric' },
    { value: 'short_answer', label: 'Short answer (manual)' }
  ];
</script>

<RouteGuard route="questions">
  <PageHeader title="Question Management" subtitle="Full lifecycle: create, edit, copy, deactivate, soft-delete &amp; restore." />

  <div class="card" style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
    <button class="btn" on:click={openCreate}>New question</button>
    <label style="margin-left:auto;">
      <input type="checkbox" checked={$showDeleted} on:change={showDeleted.toggle} /> Show deleted
    </label>
  </div>

  <div class="card">
    <table style="width:100%; font-size:13px; border-collapse: collapse;">
      <thead>
        <tr><th>Prompt</th><th>Type</th><th>Diff.</th><th>Max</th><th>Status</th><th>Tags</th><th>Departments</th><th></th></tr>
      </thead>
      <tbody>
        {#each $visibleQuestions as q (q.id)}
          <tr>
            <td>{q.prompt}</td>
            <td>{q.type}</td>
            <td>{q.difficulty}</td>
            <td>{q.maxScore}</td>
            <td>{q.status}</td>
            <td>{q.tags.join(', ')}</td>
            <td>{q.applicableDepartments.join(', ')}</td>
            <td style="display:flex; gap:4px; flex-wrap:wrap;">
              <button class="btn secondary" on:click={() => openEdit(q)}>Edit</button>
              <button class="btn secondary" on:click={() => copyQuestionById(q.id)}>Copy</button>
              {#if q.status === 'active'}
                <button class="btn secondary" on:click={() => setActive(q.id, false)}>Deactivate</button>
              {:else if q.status === 'inactive'}
                <button class="btn secondary" on:click={() => setActive(q.id, true)}>Activate</button>
              {/if}
              {#if q.status !== 'deleted'}
                <button class="btn secondary" on:click={() => softDeleteQuestion(q.id)}>Delete</button>
              {:else}
                <button class="btn secondary" on:click={() => restoreQuestion(q.id)}>Restore</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</RouteGuard>

<Modal open={modalOpen} title={editingId ? 'Edit question' : 'New question'} onClose={() => (modalOpen = false)}>
  <label>Type<br/>
    <select bind:value={form.type} on:change={onTypeChange}>
      {#each TYPES as t}<option value={t.value}>{t.label}</option>{/each}
    </select>
  </label><br/><br/>
  <label>Prompt<br/><textarea bind:value={form.prompt} rows="3" style="width:100%"></textarea></label><br/><br/>

  {#if form.type === 'single_choice' || form.type === 'multi_choice'}
    <strong>Choices</strong>
    {#each form.choices as choice (choice.id)}
      <div style="display:flex; gap:6px; align-items:center; margin:4px 0;">
        <input type="checkbox" checked={form.correctChoiceIds.includes(choice.id)} on:change={() => toggleCorrect(choice.id)} />
        <input bind:value={choice.label} style="flex:1" />
        <button type="button" class="btn secondary" on:click={() => removeChoice(choice.id)}>×</button>
      </div>
    {/each}
    <button type="button" class="btn secondary" on:click={addChoice}>Add choice</button>
    <br/><br/>
  {/if}

  {#if form.type === 'true_false'}
    <strong>Correct answer</strong>
    <div style="margin-top:6px;">
      {#each form.choices as choice (choice.id)}
        <label style="margin-right:12px;">
          <input type="radio" name="tf" value={choice.id} checked={form.correctChoiceIds[0] === choice.id} on:change={() => toggleCorrect(choice.id)} />
          {choice.label}
        </label>
      {/each}
    </div>
    <br/>
  {/if}

  {#if form.type === 'fill_in_blank'}
    <strong>Accepted answers</strong>
    {#each form.acceptedAnswers as ans, idx (idx)}
      <div style="display:flex; gap:6px; align-items:center; margin:4px 0;">
        <input bind:value={form.acceptedAnswers[idx]} style="flex:1" />
        <button type="button" class="btn secondary" on:click={() => removeAccepted(idx)}>×</button>
      </div>
    {/each}
    <button type="button" class="btn secondary" on:click={addAccepted}>Add accepted answer</button>
    <br/>
    <label style="display:block; margin-top:8px;">
      <input type="checkbox" bind:checked={form.caseSensitive} /> Case sensitive
    </label>
    <br/>
  {/if}

  {#if form.type === 'numeric'}
    <label>Correct value<br/><input type="number" bind:value={form.correctNumeric} /></label>
    <label>Tolerance<br/><input type="number" bind:value={form.numericTolerance} /></label><br/><br/>
  {/if}

  <label>Difficulty ({cfg.questions.minDifficulty}–{cfg.questions.maxDifficulty})<br/>
    <input type="number" min={cfg.questions.minDifficulty} max={cfg.questions.maxDifficulty} bind:value={form.difficulty} />
  </label>
  <label>Max score ({cfg.questions.minScore}–{cfg.questions.maxScore})<br/>
    <input type="number" min={cfg.questions.minScore} max={cfg.questions.maxScore} bind:value={form.maxScore} />
  </label><br/><br/>

  <label>Explanation<br/><textarea bind:value={form.explanation} rows="2" style="width:100%"></textarea></label><br/><br/>

  <label>Tags (comma-separated)<br/>
    <input value={form.tags.join(', ')} on:input={(e) => setTags(e.currentTarget.value)} style="width:100%" />
  </label><br/><br/>

  <strong>Knowledge points</strong>
  <div>{#each cfg.knowledgePoints as k}
    <label style="margin-right:8px;"><input type="checkbox" checked={form.knowledgePoints.includes(k)} on:change={() => toggleKp(k)} /> {k}</label>
  {/each}</div>
  <br/>

  <strong>Applicable departments</strong>
  <div>{#each cfg.departments as d}
    <label style="margin-right:8px;"><input type="checkbox" checked={form.applicableDepartments.includes(d)} on:change={() => toggleDept(d)} /> {d}</label>
  {/each}</div>

  {#if errors.length}
    <ul style="color:#ff7676;">{#each errors as e}<li>{e}</li>{/each}</ul>
  {/if}

  <div style="margin-top:12px; display:flex; gap:8px; justify-content:flex-end;">
    <button type="button" class="btn secondary" on:click={() => (modalOpen = false)}>Cancel</button>
    <button type="button" class="btn" on:click={submit}>{editingId ? 'Save' : 'Create'}</button>
  </div>
</Modal>
