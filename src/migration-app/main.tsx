import { createRoot } from 'react-dom/client';
import { createEmulatorClient } from '../data/firebaseClient';
import { FirestoreTravelRepository } from '../data/FirestoreTravelRepository';
import { TravelWorkspace } from './TravelWorkspace';
const repository = new FirestoreTravelRepository(createEmulatorClient(import.meta.env, location.hostname));
createRoot(document.getElementById('root')!).render(<TravelWorkspace repository={repository}/>);
