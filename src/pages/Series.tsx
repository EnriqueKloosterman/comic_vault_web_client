import { useParams } from 'react-router-dom';
import Library from './Library';

/** Vista por serie: Library con filtro fijo. */
export default function Series() {
  const { s } = useParams();
  return <Library key={s} initialSeries={s ?? ''} />;
}
