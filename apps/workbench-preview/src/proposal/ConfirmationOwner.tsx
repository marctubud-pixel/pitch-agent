import { useTeam } from '../collaboration/context';
import { confirmationOwner } from './projectDetails';

export function ConfirmationOwner() {
  const { snapshot } = useTeam();
  return <span className="project-confirmation-owner">确认负责人：{confirmationOwner(snapshot.members)}</span>;
}
