import { useState } from 'react';
import './WritingGuides.css';

export default function WritingGuides() {
  const [content, setContent] = useState('');

  const guides = [
    { title: 'Plot Structure', description: 'Three-act structure, hero\'s journey, and more' },
    { title: 'Character Arcs', description: 'Growth, change, and transformation' },
    { title: 'Dialogue Tips', description: 'Natural conversation and character voice' },
    { title: 'Show vs Tell', description: 'Engaging readers through action and detail' },
    { title: 'Pacing', description: 'Balance action, dialogue, and description' },
    { title: 'Point of View', description: 'First, second, third person perspectives' },
  ];

  return (
    <div className="writing-guides">
      <div className="guides-sidebar">
        <h3>Writing Guides</h3>
        <div className="guide-list">
          {guides.map((guide, index) => (
            <div key={index} className="guide-item">
              <h4>{guide.title}</h4>
              <p>{guide.description}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="writing-area">
        <textarea
          className="story-editor"
          placeholder="Start writing your story here..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="editor-stats">
          <span>Words: {content.split(/\s+/).filter(w => w).length}</span>
          <span>Characters: {content.length}</span>
        </div>
      </div>
    </div>
  );
}
