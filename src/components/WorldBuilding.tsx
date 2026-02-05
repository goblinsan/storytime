import { useState } from 'react';
import './WorldBuilding.css';

export default function WorldBuilding() {
  const [locations] = useState<string[]>([]);
  const [mapNotes, setMapNotes] = useState('');

  return (
    <div className="world-building">
      <div className="world-sections">
        <div className="section">
          <h3>🗺️ Map & Locations</h3>
          <div className="map-canvas">
            <div className="map-placeholder">
              <p>Interactive map canvas</p>
              <p className="hint">Click to add locations</p>
            </div>
          </div>
          <div className="form-group">
            <label>Map Notes</label>
            <textarea
              placeholder="Geography, climate, terrain features..."
              value={mapNotes}
              onChange={(e) => setMapNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="section">
          <h3>📍 Locations</h3>
          <button className="add-location-button">+ Add Location</button>
          <div className="locations-list">
            {locations.length === 0 ? (
              <p className="empty-message">No locations added yet</p>
            ) : (
              locations.map((loc, idx) => (
                <div key={idx} className="location-card">
                  {loc}
                </div>
              ))
            )}
          </div>
          <div className="form-group">
            <label>Location Name</label>
            <input type="text" placeholder="e.g., The Whispering Woods" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea placeholder="What makes this place unique?" />
          </div>
        </div>

        <div className="section">
          <h3>⏰ Timeline</h3>
          <button className="add-event-button">+ Add Event</button>
          <div className="timeline">
            <div className="timeline-item">
              <div className="timeline-marker"></div>
              <div className="timeline-content">
                <p className="empty-message">Add historical events to your world's timeline</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
