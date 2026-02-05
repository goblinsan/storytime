import { useState } from 'react';
import './PlanningGuides.css';

export default function PlanningGuides() {
  const [activeView, setActiveView] = useState<'tasks' | 'gantt' | 'budget'>('tasks');

  return (
    <div className="planning-guides">
      <div className="planning-header">
        <h3>📊 Project Planning</h3>
        <div className="view-switcher">
          <button 
            className={activeView === 'tasks' ? 'active' : ''} 
            onClick={() => setActiveView('tasks')}
          >
            ✓ Tasks
          </button>
          <button 
            className={activeView === 'gantt' ? 'active' : ''} 
            onClick={() => setActiveView('gantt')}
          >
            📅 Timeline
          </button>
          <button 
            className={activeView === 'budget' ? 'active' : ''} 
            onClick={() => setActiveView('budget')}
          >
            💰 Budget
          </button>
        </div>
      </div>

      {activeView === 'tasks' && (
        <div className="tasks-view">
          <button className="add-task-button">+ Add Task</button>
          <div className="task-board">
            <div className="task-column">
              <h4 className="column-header todo">To Do</h4>
              <div className="task-list">
                <div className="task-card">
                  <div className="task-priority high">High</div>
                  <h5>Example: Develop main character backstory</h5>
                  <p>Create detailed history and motivations</p>
                  <span className="task-date">Due: Not set</span>
                </div>
              </div>
            </div>
            <div className="task-column">
              <h4 className="column-header in-progress">In Progress</h4>
              <div className="task-list">
                <p className="empty-column">No tasks in progress</p>
              </div>
            </div>
            <div className="task-column">
              <h4 className="column-header done">Done</h4>
              <div className="task-list">
                <p className="empty-column">No completed tasks</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeView === 'gantt' && (
        <div className="gantt-view">
          <div className="gantt-chart">
            <div className="gantt-header">
              <div className="gantt-task-names">
                <div className="gantt-header-cell">Task</div>
              </div>
              <div className="gantt-timeline">
                <div className="gantt-header-cell">Week 1</div>
                <div className="gantt-header-cell">Week 2</div>
                <div className="gantt-header-cell">Week 3</div>
                <div className="gantt-header-cell">Week 4</div>
              </div>
            </div>
            <div className="gantt-body">
              <div className="gantt-row">
                <div className="gantt-task-name">Planning Phase</div>
                <div className="gantt-bars">
                  <div className="gantt-bar" style={{ width: '25%', marginLeft: '0%' }}></div>
                </div>
              </div>
              <div className="gantt-row">
                <div className="gantt-task-name">Writing</div>
                <div className="gantt-bars">
                  <div className="gantt-bar" style={{ width: '50%', marginLeft: '25%' }}></div>
                </div>
              </div>
              <div className="gantt-row">
                <div className="gantt-task-name">Editing</div>
                <div className="gantt-bars">
                  <div className="gantt-bar" style={{ width: '25%', marginLeft: '75%' }}></div>
                </div>
              </div>
            </div>
          </div>
          <button className="add-task-button">+ Add Timeline Item</button>
        </div>
      )}

      {activeView === 'budget' && (
        <div className="budget-view">
          <div className="budget-summary">
            <div className="budget-card">
              <h4>Total Budget</h4>
              <div className="budget-amount">$0</div>
            </div>
            <div className="budget-card">
              <h4>Spent</h4>
              <div className="budget-amount spent">$0</div>
            </div>
            <div className="budget-card">
              <h4>Remaining</h4>
              <div className="budget-amount remaining">$0</div>
            </div>
          </div>
          <div className="budget-items">
            <h4>Budget Items</h4>
            <button className="add-budget-button">+ Add Budget Item</button>
            <div className="budget-list">
              <p className="empty-message">No budget items added yet</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
