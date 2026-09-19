import App from '../App';
import { AppProviders } from '../AppRoot';

export default function AuthenticatedApp() {
  return <AppProviders><App /></AppProviders>;
}

