import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import GeneratedDraftReview from '../components/GeneratedDraftReview';
import './DraftReviews.css';

export default function DraftReviews() {
  const { draftId } = useParams<{ draftId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialDraftId = draftId || searchParams.get('draftId') || null;
  const storyId = searchParams.get('projectId') || null;

  const handleSelectDraftId = (id: string | null) => {
    if (id) {
      navigate(`/drafts/${id}`);
    } else {
      navigate('/drafts');
    }
  };

  return (
    <div className="draft-reviews-page">
      <GeneratedDraftReview
        initialDraftId={initialDraftId}
        storyId={storyId}
        onSelectDraftId={handleSelectDraftId}
      />
    </div>
  );
}
