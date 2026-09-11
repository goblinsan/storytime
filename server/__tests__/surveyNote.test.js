import { describe, expect, it } from 'vitest';
import { buildSurveyPrompt } from '../surveyAgent.js';

const input = {
  universe: { title: 'Void Requiem', description: '' },
  direction: {},
  census: { counts: [['characters', 66]], notes: [] },
};

describe('the survey', () => {
  // The handler always passed the note; the prompt dropped it, so an
  // instruction typed into Collaborate on the overview went nowhere.
  it('holds to what the author asked of it', () => {
    const prompt = buildSurveyPrompt({ ...input, note: 'Focus on the societies.' });
    expect(prompt).toMatch(/WHAT THE AUTHOR WANTS FROM THIS SURVEY\. Hold to it:\nFocus on the societies\./);
  });

  it('says nothing about it when nothing was asked', () => {
    expect(buildSurveyPrompt(input)).not.toMatch(/WHAT THE AUTHOR WANTS/);
  });
});
