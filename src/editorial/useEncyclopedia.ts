import { useParams } from 'react-router-dom';
import { editorialApi, type Encyclopedia } from './api';
import { useAsync, type AsyncState } from './useAsync';

/** The universe catalog for whichever universe the route names. */
export function useEncyclopedia(): AsyncState<Encyclopedia> & { retry: () => void; universeId: string } {
  const { id = '' } = useParams();
  const state = useAsync((signal) => editorialApi.getEncyclopedia(id, signal), [id]);
  return { ...state, universeId: id };
}
