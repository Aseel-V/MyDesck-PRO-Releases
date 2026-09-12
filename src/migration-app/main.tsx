import { createRoot } from 'react-dom/client';
import { createEmulatorClient, createProductionClient } from '../data/firebaseClient';
import { selectBackend } from '../data/backendMode';
import { FirestoreTravelRepository } from '../data/FirestoreTravelRepository';
import { TravelWorkspace } from './TravelWorkspace';
const mode = selectBackend(import.meta.env, location.hostname);
const client = mode === 'firestore'
  ? createProductionClient(import.meta.env, location.hostname)
  : createEmulatorClient(import.meta.env, location.hostname);
const repository = new FirestoreTravelRepository(client);
createRoot(document.getElementById('root')!).render(<TravelWorkspace repository={repository}/>);
