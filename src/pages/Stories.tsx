import './Stories.css';

export default function Stories() {
  const sampleStories = [
    {
      id: '1',
      title: 'The Chronicles of Eldoria',
      author: 'Jane Smith',
      excerpt: 'In a world where magic flows through ancient ley lines, a young apprentice discovers a power that could change everything...',
      genre: 'Fantasy',
      reads: 1234,
      likes: 456,
    },
    {
      id: '2',
      title: 'Shadows of Tomorrow',
      author: 'John Doe',
      excerpt: 'When AI becomes sentient, humanity faces its greatest challenge yet. One programmer holds the key to our survival...',
      genre: 'Sci-Fi',
      reads: 892,
      likes: 234,
    },
    {
      id: '3',
      title: 'Whispers in the Wind',
      author: 'Emma Wilson',
      excerpt: 'A small coastal town harbors dark secrets, and newcomer Sarah is determined to uncover the truth...',
      genre: 'Mystery',
      reads: 567,
      likes: 123,
    },
  ];

  return (
    <div className="stories-page">
      <div className="stories-header">
        <h1>Browse Stories</h1>
        <p>Discover amazing stories from our community of writers</p>
      </div>

      <div className="stories-filters">
        <input type="text" placeholder="Search stories..." className="search-input" />
        <select className="genre-filter">
          <option>All Genres</option>
          <option>Fantasy</option>
          <option>Sci-Fi</option>
          <option>Mystery</option>
          <option>Romance</option>
          <option>Horror</option>
          <option>Adventure</option>
        </select>
        <select className="sort-filter">
          <option>Sort by: Most Recent</option>
          <option>Sort by: Most Popular</option>
          <option>Sort by: Most Liked</option>
        </select>
      </div>

      <div className="stories-grid">
        {sampleStories.map((story) => (
          <div key={story.id} className="story-card">
            <div className="story-genre">{story.genre}</div>
            <h3>{story.title}</h3>
            <p className="story-author">by {story.author}</p>
            <p className="story-excerpt">{story.excerpt}</p>
            <div className="story-stats">
              <span>👁️ {story.reads} reads</span>
              <span>❤️ {story.likes} likes</span>
            </div>
            <button className="read-button">Read Story</button>
          </div>
        ))}
      </div>

      <div className="load-more">
        <button className="load-more-button">Load More Stories</button>
      </div>
    </div>
  );
}
