// Authored T2 preview only. These are not observed personal-agent runs.
export function authoredPreview() {
  return { origin: 'Authored preview', fetchedAt: new Date().toISOString(), metrics: { timezone: 'Authored example', days: 7, series: [{ day: '2026-11-12', count: 3 }, { day: '2026-11-13', count: 2 }, { day: '2026-11-14', count: 4 }] }, runs: [
    { id: 'authored:research', title: 'Prepare the launch research', summary: 'An authored example of an agent gathering source material. This card is not connected to a runtime.', provider: 'hermes', display_name: 'Research agent · authored', status: 'running', updated_at: '2026-11-14T12:00:00Z' },
    { id: 'authored:approval', title: 'Review the proposed next step', summary: 'An authored example of a request that waits for your decision.', provider: 'openclaw', display_name: 'Operations agent · authored', status: 'awaiting_hitl', hitl_id: 'authored-approval', hitl_label: 'Review the authored request', hitl_description: 'This is an authored preview. It cannot send an approval or control a real agent.', hitl_risk: 'medium', updated_at: '2026-11-14T11:00:00Z' },
    { id: 'authored:complete', title: 'Organize the reference notes', summary: 'An authored example of completed work with a stored follow-up draft.', provider: 'hermes', display_name: 'Notes agent · authored', status: 'completed', follow_up_status: 'ready', follow_up_prompt: 'Authored preview: review the saved notes and choose the next step. No actual command can be sent from this preview.', updated_at: '2026-11-14T10:00:00Z' }
  ] };
}
