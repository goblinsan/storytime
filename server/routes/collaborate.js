import { Router } from 'express';
import db from '../db.js';
import { agentEnabled, runAgent } from '../canonAgent.js';
import { canonIndex, describeRecord } from '../recordContext.js';
import { buildConversationPrompt } from '../conversationAgent.js';

/**
 * A question about a record, answered in words. Nothing is filed and nothing
 * changes: the answer comes back in the same request, because a conversation
 * that has to be polled for is not one.
 */
const router = Router();

router.post('/ask', async (req, res) => {
  const { kind, id, fields = [], thread = [], question } = req.body ?? {};
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Ask something first.' });
  }
  const record = await describeRecord(kind, id);
  if (!record) return res.status(404).json({ error: 'There is no such record to talk about.' });
  if (!agentEnabled()) {
    return res.status(503).json({ error: 'The agent is turned off, so there is nobody to ask.' });
  }

  const universe = await db.get(
    'SELECT persistent_goal AS goal, guardrails FROM stories WHERE id = ?', record.projectId,
  );
  let guardrails = [];
  try {
    const parsed = typeof universe?.guardrails === 'string' ? JSON.parse(universe.guardrails) : universe?.guardrails;
    guardrails = Array.isArray(parsed) ? parsed : [];
  } catch { guardrails = []; }

  const prompt = buildConversationPrompt({
    record,
    index: await canonIndex(record.projectId),
    direction: { goal: universe?.goal ?? '', guardrails },
    focus: Array.isArray(fields) ? fields : [],
    thread: Array.isArray(thread) ? thread.filter((t) => t && typeof t.text === 'string') : [],
    question,
  });

  try {
    const answer = String(await runAgent(prompt, { timeoutMs: 150_000 })).trim();
    if (!answer) throw new Error('the agent said nothing');
    return res.json({ answer });
  } catch (error) {
    return res.status(502).json({ error: `No answer: ${error.message}` });
  }
});

export default router;
